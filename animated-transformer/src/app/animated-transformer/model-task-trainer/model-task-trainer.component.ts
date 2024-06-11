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

import {
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  Signal,
  WritableSignal,
  computed,
  signal,
} from '@angular/core';
import { ConfigUpdate } from 'src/app/codemirror-config-editor/codemirror-config-editor.component';
import {
  ModelUpdate,
  ModelSpecAndData,
  ModelData,
} from '../model-selector/model-selector.component';
import json5 from 'json5';
import { FormControl } from '@angular/forms';
import {
  BehaviorSubject,
  combineLatest,
  filter,
  firstValueFrom,
  map,
  merge,
  Observable,
  shareReplay,
  startWith,
  tap,
} from 'rxjs';
import { MatSlideToggleChange } from '@angular/material/slide-toggle';
import { NamedChartPoint } from 'src/app/d3-line-chart/d3-line-chart.component';

import {
  computeMetrics,
  initTransformerTrainState,
  TrainMetrics,
  TransformerTrainState,
} from 'src/lib/trainer/basic_transformer_trainer';
import { mapNonNull } from 'src/lib/rxjs/util';
import { TrainStateConfig, trySgdTrainStep } from 'src/lib/trainer/train_state';
import { stringifyJsonValue } from 'src/lib/pretty_json/pretty_json';
import { DictTree, SimpleJsTreesLib } from 'src/lib/js_tree/js_tree';
import * as tf from '@tensorflow/tfjs';
import {
  prepareBasicTaskTokenRep,
  strSeqPrepFn,
  singleNextTokenIdxOutputPrepFn,
} from 'src/lib/tokens/token_gemb';
import { BasicLmTask, BasicLmTaskUpdate } from 'src/lib/seqtasks/util';

// TODO: update to use JsTree.
export type JsonConfigData = DictTree<number | string | boolean>;

export type TrainerConfig = {
  name: string;
  trainState: TrainStateConfig;
  updateGraphEveryNSteps: number;
  stepDelayInMs: number;
};

export class TrainerMetaData {
  public config: TrainerConfig;
  public configStr: string;
  public defaultConfigStr: string;

  public trainState: WritableSignal<TransformerTrainState | null> =
    signal(null);
  // public trainAndMetricsGen?: Generator<TrainMetrics, undefined, undefined>;
  public metrics: WritableSignal<TrainMetrics | null> = signal(null);

  constructor(public kind: 'transformer', public defaultConfig: TrainerConfig) {
    this.config = SimpleJsTreesLib.copy<JsonConfigData>(
      defaultConfig
    ) as TrainerConfig;
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

export interface ModelParamsUpdate {}

const layerNormTrainer = new TrainerMetaData('transformer', {
  name: 'layerNormTrainer',
  trainState: {
    batchSize: 64,
    learningRate: 10,
    maxInputlength: 5,
    testSetSize: 64,
    trainSetSize: 64 * 10000,
  },
  updateGraphEveryNSteps: 10,
  stepDelayInMs: 100,
});

const noLayerNormTrainer = new TrainerMetaData('transformer', {
  name: 'noLayerNormTrainer',
  trainState: {
    batchSize: 64,
    learningRate: 0.5,
    maxInputlength: 5,
    testSetSize: 64,
    trainSetSize: 64 * 10000,
  },
  updateGraphEveryNSteps: 10,
  stepDelayInMs: 100,
});

const initTrainerSet = [noLayerNormTrainer, layerNormTrainer];
const initTrainersMap = {} as { [name: string]: TrainerMetaData };
initTrainerSet.forEach((t) => (initTrainersMap[t.config.name] = t));

// ----------------------------------------------------------------------------
@Component({
  selector: 'app-model-task-trainer',
  templateUrl: './model-task-trainer.component.html',
  styleUrls: ['./model-task-trainer.component.scss'],
})
export class ModelTaskTrainerComponent {
  // lastModelUpdate: ModelUpdate = { model: null };
  // lastTaskUpdate: BasicLmTaskUpdate = {}
  view: 'edit' | 'view' = 'view';
  // currentTrainer: TrainerMetaData | null = null;
  trainersMap = signal(initTrainersMap);
  trainerNames: Signal<string[]>;

  currentTrainer = signal<TrainerMetaData | null>(null);
  currentModel = signal<ModelSpecAndData | null>(null);
  currentModelData: Signal<ModelData | null>;
  currentTask = signal<BasicLmTask | null>(null);
  currentTrainerName: Signal<string | null>;
  trainState: Signal<TransformerTrainState | null>;

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
    this.selectTrainer(n);
  }
  @Input()
  set model(modelUpdate: ModelUpdate) {
    this.currentModel.set(modelUpdate.model);
  }
  @Input()
  set task(taskUpdate: BasicLmTaskUpdate) {
    // console.log('taskUpdate', taskUpdate.task);
    this.currentTask.set(taskUpdate.task || null);
  }

  constructor() {
    this.currentTrainerName = computed(() => {
      const task = this.currentTrainer();
      if (!task) {
        return null;
      }
      return task.config.name;
    });

    this.currentModelData = computed(() => {
      const model = this.currentModel();
      if (!model) {
        return null;
      }
      return model.modelData();
    });

    this.trainState = computed(() => {
      const trainer = this.currentTrainer();
      if (!trainer) {
        return null;
      }
      return trainer.trainState() || null;
    });

    this.trainerNames = computed(() => Object.keys(this.trainersMap()));

    this.curMetrics = {
      nExamples: 0,
      nEpochs: 0,
      nSteps: 0,

      trainBatchAcc: -1,
      testAcc: -1,

      trainBatchMeanLoss: -1,
      testMeanLoss: -1,
    };
  }

  public get tfjsMemory(): string {
    return JSON.stringify(tf.memory(), null, 2);
  }

  selectTrainer(maybeName: string | null): void {
    const currentTrainerName = this.currentTrainerName() || '';
    const newTrainerName = maybeName || '';
    if (newTrainerName === currentTrainerName) {
      return;
    }
    if (newTrainerName in this.trainersMap()) {
      const newTrainer = this.trainersMap()[newTrainerName];
      if (currentTrainerName !== newTrainer.config.name) {
        this.currentTrainer.set(newTrainer);
        this.configUpdate.emit({ trainer: newTrainer });
      }
    } else {
      if (currentTrainerName !== null) {
        this.configUpdate.emit({ trainer: null });
        this.currentTrainer.set(null);
      }
    }
  }

  toggleModelEditor() {
    this.view = this.view === 'edit' ? 'view' : 'edit';
  }

  trainerConfigUpdated(configUpdate: ConfigUpdate<TrainerConfig>): void {
    if (configUpdate.close) {
      this.view = 'view';
    }

    if (configUpdate.error || !configUpdate.obj || !configUpdate.json) {
      // console.log(`configUpdated with no update: ${configUpdate}`);
      return;
    }

    const trainer = this.currentTrainer();
    if (!trainer) {
      console.error(`had null trainer for configUpdated: ${configUpdate}`);
      return;
    }
    const trainState = trainer.trainState();
    if (trainState) {
      trainState.config = configUpdate.obj.trainState;
      trainState.initInputsAndTargets();
    }

    const newTrainer = new TrainerMetaData(trainer.kind, trainer.defaultConfig);
    newTrainer.metrics.set(trainer.metrics());

    newTrainer.updateFromStr(configUpdate.json);
    // Model name was changed.
    if (trainer.config.name !== newTrainer.config.name) {
      if (!newTrainer.config.name) {
        newTrainer.config.name = 'model without a name';
      }
      console.log('updating trainer name');
      // Because the name of the model may have changed, we need to
      // re-create the index
      const newTrainersMap = { ...this.trainersMap() };
      delete newTrainersMap[trainer.config.name];
      newTrainersMap[newTrainer.config.name] = newTrainer;
      this.trainersMap.set(newTrainersMap);
    }
    this.currentTrainer.set(newTrainer);
  }

  addMetricsToGraph(m: TrainMetrics, name: string) {
    const x = m.nSteps;
    this.lossPoints = this.lossPoints.concat([
      { x, y: m.trainBatchMeanLoss, name: `trainBatchLoss(${name})` },
      { x, y: m.testMeanLoss, name: `testLoss(${name})` },
    ]);
    this.accPoints = this.accPoints.concat([
      { x, y: m.trainBatchAcc, name: `trainBatchAcc(${name})` },
      { x, y: m.testAcc, name: `testAcc(${name})` },
    ]);
  }

  getCurrentTrainer(): TrainerMetaData {
    const currentTrainer = this.currentTrainer();
    if (!currentTrainer) {
      throw new Error('no currentTrainer');
    }
    return currentTrainer;
  }

  getTrainState(): TransformerTrainState {
    const trainState = this.trainState();
    if (!trainState) {
      throw new Error('no trainState');
    }
    return trainState;
  }

  getCurrentTask(): BasicLmTask {
    const currentTask = this.currentTask();
    if (!currentTask) {
      throw new Error('no currentTask');
    }
    return currentTask;
  }

  getCurrentModel(): ModelSpecAndData {
    const currentModel = this.currentModel();
    if (!currentModel) {
      throw new Error('no current model');
    }
    return currentModel;
  }

  getCurrentModelData(): ModelData {
    const data = this.currentModelData();
    if (!data) {
      throw new Error('current model missing data');
    }
    return data;
  }

  trainStep() {
    const trainer = this.getCurrentTrainer();
    const trainState = this.getTrainState();
    this.curMetrics = computeMetrics(trainState);
    if (trySgdTrainStep(trainState)) {
      this.addMetricsToGraph(this.curMetrics, trainer.config.name);
      this.layerNormHeadsProjectionGain =
        trainState.params.obj.layers[0].layerNormHeadsProjection?.gain.tensor.dataSync()[0]!;
      this.layerNormPostFFGain =
        trainState.params.obj.layers[0].layerNormPostFF?.gain.tensor.dataSync()[0]!;
    }
  }

  hasPlots() {
    return this.lossPoints.length > 0 || this.accPoints.length > 0;
  }

  clearPlots() {
    this.lossPoints = [];
    this.accPoints = [];
  }

  initTrainer(): void {
    const trainer = this.getCurrentTrainer();
    const currentTask = this.getCurrentTask();
    const currentModelData = this.getCurrentModelData();
    const oldTrainState = trainer.trainState();
    if (oldTrainState) {
      oldTrainState.dispose();
    }
    const newState = initTransformerTrainState(
      currentTask,
      currentModelData.tokenRep,
      strSeqPrepFn,
      singleNextTokenIdxOutputPrepFn,
      currentModelData.config.transformer,
      currentModelData.params,
      trainer.config.trainState
    );

    trainer.trainState.set(newState);
    this.curMetrics = computeMetrics(newState);
    this.addMetricsToGraph(this.curMetrics, trainer.config.name);
  }

  // Repeatedly does training steps.
  // TODO: move into web-worker and remove the timeout.
  async startTraining() {
    const trainer = this.getCurrentTrainer();
    const trainState = this.getTrainState();
    const self = this;
    async function doTraining() {
      if (self.isTraining) {
        let stillTraining = true;
        for (
          let i = 0;
          stillTraining && i < trainer.config.updateGraphEveryNSteps;
          i++
        ) {
          stillTraining = trySgdTrainStep(trainState);
        }
        if (!stillTraining) {
          self.stopTraining();
          return;
        }
        self.curMetrics = computeMetrics(trainState);
        self.addMetricsToGraph(self.curMetrics, trainer.config.name);
        self.layerNormHeadsProjectionGain =
          trainState.params.obj.layers[0].layerNormHeadsProjection?.gain.tensor.dataSync()[0]!;
        self.layerNormPostFFGain =
          trainState.params.obj.layers[0].layerNormPostFF?.gain.tensor.dataSync()[0]!;
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
