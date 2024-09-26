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

import { Component } from '@angular/core';
import { GTensor, SerializedGTensor, makeScalar } from 'src/lib/gtensor/gtensor';
import { BasicLmTaskConfig, Example, indexExample, RandLmTaskConfig } from 'src/lib/seqtasks/util';
import { defaultTransformerConfig } from 'src/lib/transformer/transformer_gtensor';
import { TrainStateConfig } from 'src/lib/trainer/train_state';
import { DerivedSignal, SignalSpace, SetableSignal } from 'src/lib/weblab/signalspace';
import { taskRegistry } from 'src/lib/seqtasks/task_registry';
import { prepareBasicTaskTokenRep, strSeqPrepFnAddingFinalMask } from 'src/lib/tokens/token_gemb';
import {
  Batch,
  EnvModel,
  globals,
  Globals,
  TrainConfig,
  trainerCellSpec,
} from './tiny-transformer-example/ailab';
import { LabEnv } from 'src/lib/weblab/lab-env';
import { LabState } from 'src/lib/weblab/lab-state';
import { varifyParams } from 'src/lib/gtensor/params';

@Component({
  selector: 'app-web-colab',
  standalone: true,
  imports: [],
  templateUrl: './web-colab.component.html',
  styleUrl: './web-colab.component.scss',
})
export class WebColabComponent {
  globals: {
    taskKind: SetableSignal<string>;
    taskConfigStr: SetableSignal<string>;
    model: SetableSignal<EnvModel>;
    trainConfig: SetableSignal<TrainConfig>;
    batchId: SetableSignal<number>;
    batch: DerivedSignal<Batch>;
    testSet: DerivedSignal<Example[]>;
  };
  state: LabState;
  env: LabEnv<Globals>;
  space: SignalSpace;

  constructor() {
    this.state = new LabState();
    this.env = new LabEnv<Globals>(this.state);
    this.space = new SignalSpace();
    // Consider... one liner... but maybe handy to have the object to debug.
    // const { writable, computed } = new SignalSpace();
    const { setable, derived, alwaysDerived } = this.space;

    const taskKinds = Object.keys(taskRegistry.kinds);
    const taskKind = setable<string>(taskKinds[0]);
    const taskConfigStr = setable(taskRegistry.kinds[taskKind()].defaultConfigStr);
    const task = derived(() => taskRegistry.kinds[taskKind()].makeFn(taskConfigStr()));
    alwaysDerived(() => taskConfigStr.set(taskRegistry.kinds[taskKind()].defaultConfigStr));

    const trainConfig = setable<TrainConfig>({
      id: 'a train cofig',
      kind: 'basicSeqTrainer',
      // training hyper-params
      learningRate: 0.5,
      batchSize: 64,
      maxInputLength: 10,
      // Reporting / eval
      // testSetSize: 200,
      checkpointFrequencyInBatches: 100,
      metricReporting: {
        metricFrequencyInBatches: 10,
      },
    });

    const testSetSize = setable(200);

    const dataSplitByTrainAndTest = derived(() => {
      const examplesIter = task().exampleIter.copy();
      const testExamples = examplesIter.takeOutN(testSetSize());
      const testSetIndex = new Set(testExamples.map(indexExample));
      const trainExamplesIter = examplesIter.copy();
      // With a generative synthetic world you can guarentee no duplicate example in
      // the test set and train set by filtering the test from the train.
      // This gives the optimal quality of test metric measurement.
      trainExamplesIter.filter((example) => !testSetIndex.has(indexExample(example)));
      return { testExamples, trainExamplesIter };
    });

    const testSet = derived(() => dataSplitByTrainAndTest().testExamples);
    const trainExamplesIter = derived(() => dataSplitByTrainAndTest().trainExamplesIter);
    const model = setable<EnvModel>({ config: defaultTransformerConfig() });

    // TODO: move making examples to a separate web-worker.
    function makeBatch(batchId: number, batchSize: number): Batch {
      let batchOriginal = trainExamplesIter({ untracked: true }).takeOutN(batchSize);
      let inputs = batchOriginal.map((example) => example.input);
      let outputs = batchOriginal.map((example) => example.output);
      return { batchId, inputs, outputs };
    }

    const batchId = setable(0);
    const batch = derived<Batch>(() => makeBatch(batchId(), trainConfig().batchSize));

    this.globals = {
      taskKind,
      taskConfigStr,
      batchId,
      batch,
      model,
      trainConfig,
      testSet,
    };

    // async function run() {

    // This works...
    // this.worker2 = new Worker(new URL('./app.worker', import.meta.url));
  }

  async doRun() {
    const cell = this.env.start(trainerCellSpec, this.globals);
    const lastTrainMetric = await cell.outputs.lastTrainMetric;
    console.log(lastTrainMetric);
    cell.worker.terminate();
  }

  async doOpen() {
    const dirHandle = await self.showDirectoryPicker({ mode: 'readwrite' });
    const testFile = await dirHandle.getFileHandle('test.txt', {
      create: true,
    });
    const writable = await testFile.createWritable();
    await writable.write('hello there');
    await writable.close();
    console.log(dirHandle.name);
    // console.log(dirHandle.getFileHandle(''));
    for await (const entry of dirHandle.values()) {
      const perm = await entry.requestPermission({ mode: 'read' });
      console.log(entry.kind, entry.name, perm);
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        const dec = new TextDecoder('utf-8');
        console.log('file contains:', dec.decode(await file.arrayBuffer()));
      }
    }
  }
}

// // fileHandle is an instance of FileSystemFileHandle..
// async function writeFile(fileHandle, contents) {
//   // Create a FileSystemWritableFileStream to write to.
//   const writable = await fileHandle.createWritable();
//   // Write the contents of the file to the stream.
//   await writable.write(contents);
//   // Close the file and write the contents to disk.
//   await writable.close();
// }
