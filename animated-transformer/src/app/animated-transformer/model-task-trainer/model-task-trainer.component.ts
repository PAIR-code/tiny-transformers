/* Copyright 2023 Google LLC. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/


import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { ConfigUpdate } from 'src/app/codemirror-config-editor/codemirror-config-editor.component';
import { BasicLmTask, BasicLmTaskUpdate } from 'src/lib/seqtasks/util';
import { prepareBasicTaskTokenRep, strSeqPrepFn, singleNextTokenIdxOutputPrepFn } from 'src/lib/tokens/token_gemb';
import { ModelUpdate, ModelSpecAndData, ModelData } from '../model-selector/model-selector.component';
import * as tf from '@tensorflow/tfjs';
import { stringifyJsonValue } from 'src/lib/pretty_json/pretty_json';
import { DictTree, SimpleJsTreesLib } from 'src/lib/js_tree/js_tree';
import * as json5 from 'json5';
import { FormControl } from '@angular/forms';
import { BehaviorSubject, combineLatest, filter, firstValueFrom, map, merge, Observable, shareReplay, startWith, tap } from 'rxjs';
import { MatSlideToggleChange } from '@angular/material/slide-toggle';
import { computeMetrics, initTransformerTrainState, TrainMetrics, TransformerTrainState } from 'src/lib/trainer/basic_transformer_trainer';
import { mapNonNull } from 'src/lib/rxjs/util';
import { NamedChartPoint } from 'src/app/d3-line-chart/d3-line-chart.component';
import { TrainStateConfig, trySgdTrainStep } from 'src/lib/trainer/train_state';

// TODO: update to use JsTree.
export type JsonConfigData = DictTree<number | string | boolean>;

export type TrainerConfig = {
  name: string;
  trainState: TrainStateConfig;
  updateGraphEveryNSteps: number;
  stepDelayInMs: number;
}

export class TrainerMetaData {
  public config: TrainerConfig
  public configStr: string;
  public defaultConfigStr: string;

  public trainState?: TransformerTrainState;
  // public trainAndMetricsGen?: Generator<TrainMetrics, undefined, undefined>;
  public metrics?: TrainMetrics;

  constructor(
    public kind: 'transformer',
    public defaultConfig: TrainerConfig
  ) {
    this.config =
      SimpleJsTreesLib.copy<JsonConfigData>(defaultConfig) as TrainerConfig;
    this.configStr = stringifyJsonValue(this.config);
    this.defaultConfigStr = this.configStr;
  }

  updateFromStr(s: string) {
    this.configStr = s;
    this.config = json5.parse(this.configStr);
  }
}

export interface TrainerConfigUpdate {
  trainer: TrainerMetaData | null;
}

export interface ModelParamsUpdate {
}


const layerNormTrainer = new TrainerMetaData('transformer',
  {
    name: 'layerNormTrainer',
    trainState: {
      batchSize: 64,
      learningRate: 30,
      maxInputlength: 5,
      testSetSize: 64,
      trainSetSize: 64 * 10000,
    },
    updateGraphEveryNSteps: 10,
    stepDelayInMs: 100,
  });

const noLayerNormTrainer = new TrainerMetaData('transformer',
  {
    name: 'noLayerNormTrainer',
    trainState: {
      batchSize: 64,
      learningRate: 1,
      maxInputlength: 5,
      testSetSize: 64,
      trainSetSize: 64 * 10000,
    },
    updateGraphEveryNSteps: 10,
    stepDelayInMs: 100,
  });

@Component({
  selector: 'app-model-task-trainer',
  templateUrl: './model-task-trainer.component.html',
  styleUrls: ['./model-task-trainer.component.scss']
})
export class ModelTaskTrainerComponent implements OnInit {
  // lastModelUpdate: ModelUpdate = { model: null };
  // lastTaskUpdate: BasicLmTaskUpdate = {}
  view: 'edit' | 'view' = 'view';
  // currentTrainer: TrainerMetaData | null = null;
  trainersByName: { [name: string]: TrainerMetaData } = {}
  trainerSet: TrainerMetaData[] = [noLayerNormTrainer, layerNormTrainer];

  trainerNameControl = new FormControl<string>('');
  currentTrainer$: BehaviorSubject<TrainerMetaData | null>;
  filteredTrainers$!: Observable<TrainerMetaData[]>;
  currentModel$: BehaviorSubject<ModelSpecAndData | null>;
  currentTask$: BehaviorSubject<BasicLmTask | null>;
  trainState$: Observable<TransformerTrainState | null>;
  taskAndModelWithData$: Observable<{ model: ModelSpecAndData; task: BasicLmTask } | null>;
  layerNormHeadsProjectionGain: number = -1;
  layerNormPostFFGain: number = -1;

  lossPoints: NamedChartPoint[] = [
    // { x: 1, y: 2, name: 'a', },
    // { x: 2, y: 3, name: 'a', },
    // { x: 3, y: 1, name: 'a', },
    // { x: 1, y: 3, name: 'b', },
    // { x: 2, y: 2, name: 'b', },
    // { x: 3, y: 3, name: 'b', },
  ];
  accPoints: NamedChartPoint[] = [
    // { x: 1, y: 3, name: 'b', },
    // { x: 2, y: 2, name: 'b', },
    // { x: 3, y: 3, name: 'b', },
  ];
  curMetrics: TrainMetrics;
  isTraining: boolean = false;

  @Output() configUpdate = new EventEmitter<TrainerConfigUpdate>();
  @Output() modelUpdate = new EventEmitter<ModelParamsUpdate>();

  @Input()
  set trainerName(n: string) {
    this.maybeSetTrainer(n);
  }
  @Input()
  set model(modelUpdate: ModelUpdate) {
    this.currentModel$.next(modelUpdate.model);
  };
  @Input()
  set task(taskUpdate: BasicLmTaskUpdate) {
    // console.log('taskUpdate', taskUpdate.task);
    this.currentTask$.next(taskUpdate.task || null);
  }

  constructor() {
    this.currentTrainer$ = new BehaviorSubject<TrainerMetaData | null>(null);
    this.currentModel$ = new BehaviorSubject<ModelSpecAndData | null>(null);
    this.trainState$ = this.currentTrainer$.pipe(
      mapNonNull(m => m.trainState || null)
    );
    this.currentTask$ = new BehaviorSubject<BasicLmTask | null>(null);
    this.trainersByName = {};
    this.reCreateTrainerNameIndex();
    // trainersConfigs.forEach(t => this.trainersByName[t.name.toLocaleLowerCase()] =
    //   new TrainerMetaData('transformer', t));
    this.taskAndModelWithData$ = combineLatest([this.currentTask$, this.currentModel$])
      .pipe(map(combinedTaskAndModel => {
        const [task, model] = combinedTaskAndModel;
        if (!task || !model || !model.modelData) {
          return null;
        }
        return { task, model };
      }));
    this.curMetrics = {
      nExamples: 0,
      nEpochs: 0,
      nSteps: 0,

      trainBatchAcc: -1,
      testAcc: -1,

      trainBatchMeanLoss: -1,
      testMeanLoss: -1,
    }
  }

  ngOnInit(): void {
    this.filteredTrainers$ = this.trainerNameControl.valueChanges.pipe(
      tap(s => this.maybeSetTrainer(s)),
      map(name => (name ? this._filterTrainers(name) : this.trainerSet.slice())),
      startWith(this.trainerSet.slice()),
      shareReplay(1));
  }

  public get tfjsMemory(): string {
    return JSON.stringify(tf.memory(), null, 2);
  }

  async maybeSetTrainer(maybeName: string | null) {
    const name = (maybeName || '').toLocaleLowerCase();
    const currentTrainer = await firstValueFrom(this.currentTrainer$);
    const currentTrainerName =
      currentTrainer ? currentTrainer.config.name : '';
    // console.log('maybeSetTrainer new name:', name);
    // console.log('maybeSetTrainer currentTrainer name:', currentTrainerName);
    // console.log('maybeSetTrainer trainerNameControl:', this.trainerNameControl.value);
    if (name in this.trainersByName) {
      const newTrainer = this.trainersByName[name];
      if (currentTrainerName !== newTrainer.config.name) {
        this.currentTrainer$.next(newTrainer);
        if (this.trainerNameControl.value !== newTrainer.config.name) {
          this.trainerNameControl.setValue(newTrainer.config.name);
        }
        this.configUpdate.emit({ trainer: newTrainer });
      }
    } else {
      if (maybeName === null) {
        this.trainerNameControl.setValue('');
      } else if (this.trainerNameControl.value !== maybeName) {
        this.trainerNameControl.setValue(maybeName);
      }
      if (currentTrainerName !== null) {
        this.configUpdate.emit({ trainer: null });
        this.currentTrainer$.next(null);
      }
    }
  }

  private _filterTrainers(name: string): TrainerMetaData[] {
    const filterValue = name.toLowerCase();

    const filteredTrainers = this.trainerSet.filter(trainer => {
      return trainer.config.name.toLowerCase().includes(filterValue)
    });

    if (filteredTrainers.length <= 1
      //  && filteredTasks[0].config.name.toLowerCase() === filterValue
    ) {
      return this.trainerSet;
    }

    return filteredTrainers;
  }

  reCreateTrainerNameIndex(): void {
    this.trainerSet.forEach(t =>
      this.trainersByName[t.config.name.toLocaleLowerCase()] = t);
  }

  toggleModelEditor() {
    this.view = this.view === 'edit' ? 'view' : 'edit';
  }

  async trainerConfigUpdated(configUpdate: ConfigUpdate<TrainerConfig>): Promise<void> {
    if (configUpdate.close) {
      this.view = 'view';
    }

    if (configUpdate.error || !configUpdate.obj || !configUpdate.json) {
      // console.log(`configUpdated with no update: ${configUpdate}`);
      return;
    }

    const trainer = await firstValueFrom(this.currentTrainer$);
    if (!trainer) {
      console.error(`had null trainer for configUpdated: ${configUpdate}`);
      return;
    }
    if (trainer.trainState) {
      trainer.trainState.config = configUpdate.obj.trainState;
      trainer.trainState.initInputsAndTargets();
    }

    trainer.updateFromStr(configUpdate.json);
    // Model name was changed.
    if (trainer.config.name !== this.trainerNameControl.value) {
      if (!trainer.config.name) {
        trainer.config.name = 'model without a name'
      }
      // Because the name of the model may have changed, we need to re-create the
      // index
      this.reCreateTrainerNameIndex();
      this.trainerNameControl.setValue(trainer.config.name);
    }
    this.currentTrainer$.next(trainer);
  }

  addMetricsToGraph(m: TrainMetrics, name: string) {
    const x = m.nSteps;
    this.lossPoints = this.lossPoints.concat([
      { x, y: m.trainBatchMeanLoss, name: `trainBatchLoss(${name})` },
      { x, y: m.testMeanLoss, name: `testLoss(${name})` }
    ]);
    this.accPoints = this.accPoints.concat([
      { x, y: m.trainBatchAcc, name: `trainBatchAcc(${name})` },
      { x, y: m.testAcc, name: `testAcc(${name})` }
    ]);
  }

  async getCurrentTrainer(): Promise<TrainerMetaData> {
    const currentTrainer = await firstValueFrom(this.currentTrainer$);
    if (!currentTrainer) {
      throw new Error('no currentTrainer');
    }
    return currentTrainer;
  }

  async getTrainState(): Promise<TransformerTrainState> {
    const trainState = await firstValueFrom(this.trainState$);
    if (!trainState) {
      throw new Error('no trainState');
    }
    return trainState;
  }

  async getCurrentTask(): Promise<BasicLmTask> {
    const currentTask = await firstValueFrom(this.currentTask$);
    if (!currentTask) {
      throw new Error('no currentTask');
    }
    return currentTask;
  }

  async getCurrentModel(): Promise<ModelSpecAndData> {
    const currentModel = await firstValueFrom(this.currentModel$);
    if (!currentModel) {
      throw new Error('no current model');
    }
    return currentModel;
  }

  async getCurrentModelData(): Promise<ModelData> {
    const currentModel = await this.getCurrentModel();
    if (!currentModel.modelData) {
      throw new Error('current model missing data');
    }
    return currentModel.modelData;
  }

  async trainStep() {
    const trainer = await this.getCurrentTrainer();
    const trainState = await this.getTrainState();
    this.curMetrics = computeMetrics(trainState);
    if (trySgdTrainStep(trainState)) {
      this.addMetricsToGraph(this.curMetrics, trainer.config.name);
      this.layerNormHeadsProjectionGain = trainState.params.obj.layers[0].layerNormHeadsProjection?.gain.tensor.dataSync()[0]!;
      this.layerNormPostFFGain = trainState.params.obj.layers[0].layerNormPostFF?.gain.tensor.dataSync()[0]!;
    }
  }

  clearPlots() {
    this.lossPoints = [];
    this.accPoints = [];
  }

  async initTrainer(): Promise<void> {
    const trainer = await this.getCurrentTrainer();
    const currentTask = await this.getCurrentTask();
    const currentModelData = await this.getCurrentModelData();
    if (trainer.trainState) {
      trainer.trainState.dispose();
    }
    trainer.trainState = initTransformerTrainState(
      currentTask,
      currentModelData.tokenRep,
      strSeqPrepFn,
      singleNextTokenIdxOutputPrepFn,
      currentModelData.config.transformer,
      currentModelData.params,
      trainer.config.trainState,
    );

    this.clearPlots();
    this.curMetrics = computeMetrics(trainer.trainState);
    this.addMetricsToGraph(this.curMetrics, trainer.config.name);

    // Send an update about the trainer, so others know train state is set.
    this.currentTrainer$.next(trainer);
  }

  // Repeatedly does training steps.
  async startTraining() {
    const trainer = await this.getCurrentTrainer();
    const trainState = await this.getTrainState();
    const self = this;
    async function doTraining() {
      if (self.isTraining) {
        let stillTraining = true;
        for (let i = 0; stillTraining &&
          i < trainer.config.updateGraphEveryNSteps; i++) {
          stillTraining = trySgdTrainStep(trainState);
        }
        if (!stillTraining) {
          self.stopTraining();
          return;
        }
        self.curMetrics = computeMetrics(trainState);
        self.addMetricsToGraph(self.curMetrics, trainer.config.name);
        self.layerNormHeadsProjectionGain = trainState.params.obj.layers[0].layerNormHeadsProjection?.gain.tensor.dataSync()[0]!;
        self.layerNormPostFFGain = trainState.params.obj.layers[0].layerNormPostFF?.gain.tensor.dataSync()[0]!;
        // await self.trainStep();
        // wait 100ms between training steps.
        // TODO: we don't need to do this if we move to using separate
        // web-worker for training.
        setTimeout(doTraining, trainer.config.stepDelayInMs || 100);
      }
    }
    self.isTraining = true;
    await doTraining();
  }
  stopTraining() {
    this.isTraining = false;
  }
  toggleTraining(change: MatSlideToggleChange) {
    if (change.checked) {
      this.startTraining();
    } else {
      this.stopTraining();
    }
  }
}
