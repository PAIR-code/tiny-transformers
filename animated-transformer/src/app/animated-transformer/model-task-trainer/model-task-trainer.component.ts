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

import { Component, EventEmitter, Input, Output, Signal, computed, signal } from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { AutoCompletedTextInputComponent } from '../../auto-completed-text-input/auto-completed-text-input.component';

import {
  CodemirrorConfigEditorComponent,
  ConfigUpdate,
  ConfigUpdateKind,
} from 'src/app/codemirror-config-editor/codemirror-config-editor.component';
import { ModelUpdate } from '../model-selector/model-selector.component';
import json5 from 'json5';
import { MatSlideToggleChange } from '@angular/material/slide-toggle';
import {
  D3LineChartComponent,
  NamedChartPoint,
} from 'src/app/d3-line-chart/d3-line-chart.component';

import {
  computeMetrics,
  initTransformerTrainState,
  TrainMetrics,
  TransformerTrainState,
} from 'src/lib/trainer/basic_transformer_trainer';
import { TrainStateConfig, trySgdTrainStep } from 'src/lib/trainer/train_state';
import { stringifyJsonValue } from 'src/lib/json/pretty_json';
import { DictTree } from 'src/lib/js_tree/js_tree';
import * as tf from '@tensorflow/tfjs';
import { strSeqPrepFn, singleNextTokenIdxOutputPrepFn } from 'src/lib/tokens/token_gemb';
import { BasicLmTask, BasicLmTaskUpdate, BasicRandLmTask } from 'src/lib/seqtasks/util';
import { ConfigObj } from 'src/lib/json/config-obj';
import { EnvModel } from 'src/weblab-examples/tiny-transformer-example/ailab';
import { CommonModule } from '@angular/common';

export type TrainerConfig = {
  name: string;
  kind: 'TransformerTrainConfig';
  trainState: TrainStateConfig;
  updateGraphEveryNSteps: number;
  stepDelayInMs: number;
};

const layerNormTrainerConfig: TrainerConfig = {
  name: 'layerNormTrainer',
  kind: 'TransformerTrainConfig',
  trainState: {
    batchSize: 64,
    learningRate: 10,
    maxInputLength: 5,
    testSetSize: 64,
    trainSetSize: 64 * 10000,
  },
  updateGraphEveryNSteps: 10,
  stepDelayInMs: 100,
};

const noLayerNormTrainerConfig: TrainerConfig = {
  name: 'noLayerNormTrainer',
  kind: 'TransformerTrainConfig',
  trainState: {
    batchSize: 64,
    learningRate: 0.5,
    maxInputLength: 5,
    testSetSize: 64,
    trainSetSize: 64 * 10000,
  },
  updateGraphEveryNSteps: 10,
  stepDelayInMs: 100,
};

const initTrainerConfigSet = [noLayerNormTrainerConfig, layerNormTrainerConfig];
const initTrainersConfigMap = {} as { [name: string]: TrainerConfig };
initTrainerConfigSet.forEach((t) => (initTrainersConfigMap[t.name] = t));

export interface ModelParamsUpdate {}

function nullOrComputed<T, T2>(
  maybeNullSignal: Signal<null | T>,
  f: (x: T) => T2,
): Signal<T2 | null> {
  return computed(() => {
    const maybeNull = maybeNullSignal();
    if (!maybeNull) {
      return null;
    }
    return f(maybeNull);
  });
}

// ----------------------------------------------------------------------------
@Component({
  selector: 'app-model-task-trainer',
  templateUrl: './model-task-trainer.component.html',
  styleUrls: ['./model-task-trainer.component.scss'],
  imports: [
    CommonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    FormsModule,
    ReactiveFormsModule,
    MatSlideToggleModule,
    MatListModule,
    MatMenuModule,
    MatAutocompleteModule,
    CodemirrorConfigEditorComponent,
    D3LineChartComponent,
    AutoCompletedTextInputComponent,
  ],
})
export class ModelTaskTrainerComponent {
  // lastModelUpdate: ModelUpdate = { model: null };
  // lastTaskUpdate: BasicLmTaskUpdate = {}
  view: 'edit' | 'view' = 'view';
  // currentTrainer: TrainerMetaData | null = null;
  trainersMap = signal(initTrainersConfigMap);
  trainerNames: Signal<string[]>;

  currentTrainer = signal<TrainerConfig | null>(null);
  currentModel = signal<EnvModel | null>(null);
  currentTask = signal<BasicRandLmTask | null>(null);
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
    this.currentTrainerName = nullOrComputed(this.currentTrainer, (trainer) => trainer.name);
    // this.currentModelData = nullOrComputed(this.currentModel, model => model.modelData());
    this.trainState = nullOrComputed(this.currentTrainer, (trainer) => null);
    // this.trainState = nullOrComputed(this.currentTrainer, (trainer) => trainer. {
    //   const trainer = this.currentTrainer();
    //   if (!trainer) {
    //     return null;
    //   }
    //   return trainer.trainState() || null;
    // });

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
    // const currentTrainerName = this.currentTrainerName() || '';
    // const newTrainerName = maybeName || '';
    // if (newTrainerName === currentTrainerName) {
    //   return;
    // }
    // if (newTrainerName in this.trainersMap()) {
    //   const newTrainer = this.trainersMap()[newTrainerName];
    //   if (currentTrainerName !== newTrainer.config.name) {
    //     this.currentTrainer.set(newTrainer);
    //     this.configUpdate.emit({ trainer: newTrainer });
    //   }
    // } else {
    //   if (currentTrainerName !== null) {
    //     this.configUpdate.emit({ trainer: null });
    //     this.currentTrainer.set(null);
    //   }
    // }
  }

  toggleModelEditor() {
    this.view = this.view === 'edit' ? 'view' : 'edit';
  }

  trainerConfigUpdated(configUpdate: ConfigUpdate<TrainerConfig>): void {
    if (configUpdate.close) {
      this.view = 'view';
    }

    if (configUpdate.kind !== ConfigUpdateKind.UpdatedValue) {
      return;
    }

    this.currentTrainer.set(configUpdate.obj);
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

  getCurrentTrainer(): TrainerConfig {
    const currentTrainer = this.currentTrainer();
    if (!currentTrainer) {
      throw new Error('no currentTrainer');
    }
    return currentTrainer;
  }

  // getTrainState(): TransformerTrainState {
  //   const trainState = this.trainState();
  //   if (!trainState) {
  //     throw new Error('no trainState');
  //   }
  //   return trainState;
  // }

  // getCurrentTask(): BasicLmTask {
  //   const currentTask = this.currentTask();
  //   if (!currentTask) {
  //     throw new Error('no currentTask');
  //   }
  //   return currentTask;
  // }

  // getCurrentModel(): ModelSpecAndData {
  //   const currentModel = this.currentModel();
  //   if (!currentModel) {
  //     throw new Error('no current model');
  //   }
  //   return currentModel;
  // }

  // getCurrentModelData(): TransformerModel {
  //   const data = this.currentModelData();
  //   if (!data) {
  //     throw new Error('current model missing data');
  //   }
  //   return data;
  // }

  trainStep() {
    const trainer = this.getCurrentTrainer();
    // const trainState = this.getTrainState();
    // this.curMetrics = computeMetrics(trainState);
    // if (trySgdTrainStep(trainState)) {
    //   this.addMetricsToGraph(this.curMetrics, trainer.config.name);
    //   this.layerNormHeadsProjectionGain =
    //     trainState.params.layers[0].layerNormHeadsProjection?.gain.tensor.dataSync()[0]!;
    //   this.layerNormPostFFGain =
    //     trainState.params.layers[0].layerNormPostFF?.gain.tensor.dataSync()[0]!;
    // }
  }

  hasPlots() {
    return this.lossPoints.length > 0 || this.accPoints.length > 0;
  }

  clearPlots() {
    this.lossPoints = [];
    this.accPoints = [];
  }

  initTrainer(): void {
    // const trainer = this.getCurrentTrainer();
    // const currentTask = this.getCurrentTask();
    // const currentModelData = this.getCurrentModelData();
    // const oldTrainState = trainer.trainState();
    // if (oldTrainState) {
    //   oldTrainState.dispose();
    // }
    // const newState = initTransformerTrainState(
    //   currentTask,
    //   currentModelData,
    //   strSeqPrepFn,
    //   singleNextTokenIdxOutputPrepFn,
    //   trainer.config.trainState
    // );
    // trainer.trainState.set(newState);
    // this.curMetrics = computeMetrics(newState);
    // this.addMetricsToGraph(this.curMetrics, trainer.config.name);
  }

  // Repeatedly does training steps.
  // TODO: move into web-worker and remove the timeout.
  async startTraining() {
    // const trainer = this.getCurrentTrainer();
    // const trainState = this.getTrainState();
    // const self = this;
    // async function doTraining() {
    //   if (self.isTraining) {
    //     let stillTraining = true;
    //     for (let i = 0; stillTraining && i < trainer.config.updateGraphEveryNSteps; i++) {
    //       stillTraining = trySgdTrainStep(trainState);
    //     }
    //     if (!stillTraining) {
    //       self.stopTraining();
    //       return;
    //     }
    //     self.curMetrics = computeMetrics(trainState);
    //     self.addMetricsToGraph(self.curMetrics, trainer.config.name);
    //     self.layerNormHeadsProjectionGain =
    //       trainState.params.layers[0].layerNormHeadsProjection?.gain.tensor.dataSync()[0]!;
    //     self.layerNormPostFFGain =
    //       trainState.params.layers[0].layerNormPostFF?.gain.tensor.dataSync()[0]!;
    //     // await self.trainStep();
    //     // wait 100ms between training steps.
    //     // TODO: we don't need to do this if we move to using separate
    //     // web-worker for training.
    //     setTimeout(doTraining, trainer.config.stepDelayInMs || 100);
    //   }
    // }
    // self.isTraining = true;
    // await doTraining();
  }
  stopTraining() {
    this.isTraining = false;
  }
  toggleTraining(change: MatSlideToggleChange) {
    // if (change.checked) {
    //   this.startTraining();
    // } else {
    //   this.stopTraining();
    // }
  }
}
