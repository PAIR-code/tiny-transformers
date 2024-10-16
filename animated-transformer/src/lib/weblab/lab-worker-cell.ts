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

/// <reference lib="webworker" />

import * as tf from '@tensorflow/tfjs';
import { FromWorkerMessage, ToWorkerMessage } from './messages';
import { SignalSpace } from '../signalspace/signalspace';
import {
  ValueStruct,
  CellStateSpec,
  WritableStructFn,
  PromisedSignalsFn,
  Metrics,
  Subobj,
} from './cellspec';
import { ExpandOnce } from '../ts-type-helpers';
import { AbstractSignal, DerivedSignal, SetableSignal } from '../signalspace/signalspace';

export class StatefulCell<
  Globals extends ValueStruct,
  Uses extends keyof Globals & string,
  Updates extends keyof Globals & string
> {
  space = new SignalSpace();
  onceFinishRequested: Promise<void>;
  inputPromises: PromisedSignalsFn<Subobj<Globals, Uses>>;
  stillExpectedInputs: Set<Uses>;
  inputSoFar: Partial<WritableStructFn<Subobj<Globals, Uses>>> = {};
  onceAllInputs: Promise<WritableStructFn<Subobj<Globals, Uses>>>;
  inputResolvers = {} as { [signalId: string]: (value: unknown) => void };
  onceFinishedFn!: () => void;
  inputSet: Set<Uses>;
  outputSet: Set<Updates>;
  inputPorts: Map<Uses, { ports: MessagePort[] }>;
  outputPorts: Map<Updates, { ports: MessagePort[]; postToParentToo: boolean }>;

  constructor(public global: Partial<Globals>, public spec: CellStateSpec<Globals, Uses, Updates>) {
    this.inputSet = new Set(this.spec.uses);
    this.outputSet = new Set(this.spec.updates);
    this.inputPorts = new Map();
    this.outputPorts = new Map();
    this.spec.uses.forEach((input) => {
      this.inputPorts.set(input, { ports: [] });
    });
    this.spec.updates.forEach((output) => {
      this.outputPorts.set(output, { ports: [], postToParentToo: true });
    });

    this.onceFinishRequested = new Promise<void>((resolve) => {
      this.onceFinishedFn = resolve;
    });
    addEventListener('message', (m) => this.onMessage(m));

    this.inputPromises = {} as PromisedSignalsFn<Subobj<Globals, Uses>>;
    this.stillExpectedInputs = new Set(spec.uses);

    let onceAllInputsResolver: (allInput: WritableStructFn<Subobj<Globals, Uses>>) => void;
    this.onceAllInputs = new Promise<WritableStructFn<Subobj<Globals, Uses>>>((resolve, reject) => {
      onceAllInputsResolver = resolve;
    });

    for (const inputName of spec.uses) {
      const promisedInput = this.initOnceInput<Globals[typeof inputName]>(inputName as string);
      this.inputPromises[inputName] = promisedInput.then((inputValue) => {
        console.log(`inputPromises[${inputName}] has value: `, inputValue);
        const signal = this.space.setable(inputValue);
        this.inputSoFar[inputName] = signal;
        this.stillExpectedInputs.delete(inputName);
        if (this.stillExpectedInputs.size === 0) {
          onceAllInputsResolver(this.inputSoFar as WritableStructFn<Subobj<Globals, Uses>>);
        }
        delete this.inputResolvers[inputName as string];
        // // New inputs should now simply update the existing signal.
        // this.inputResolvers[inputName as string] = (value) => {
        //   signal.set(value as Globals[typeof inputName]);
        // };
        return signal;
      });
    }
  }

  onMessage(message: { data: ToWorkerMessage }) {
    const { data } = message;
    if (data.kind === 'finishRequest') {
      this.onceFinishedFn();
    } else if (data.kind === 'pipeInputSignal') {
      const inputPortConfig = this.inputPorts.get(data.signalId as Uses);
      if (!inputPortConfig) {
        throw new Error(`No input named ${data.signalId} to set pipeInputSignal.`);
      }
      // It might be cleaner to make a new onMessage function with some extra
      // params for the port name it is linked to?
      inputPortConfig.ports.push(data.port);
      data.port.onmessage = (m) => this.onMessage(m);
    } else if (data.kind === 'pipeOutputSignal') {
      const outputPortConfig = this.outputPorts.get(data.signalId as Updates);
      if (!outputPortConfig) {
        throw new Error(`No output named ${data.signalId} to set pipeOutputSignal.`);
      }
      // TODO: consider bidirectional ports/signals, then we would also listen
      // here too... but then loops get much harder to spot...
      outputPortConfig.ports.push(data.port);
      if (data.options && data.options.keepSignalPushesHereToo) {
        outputPortConfig.postToParentToo = true;
      }
    } else if (data.kind === 'setSignal') {
      const signal = this.inputSoFar[data.signalId as Uses];
      if (signal) {
        console.log(`onMessage: setSignal: ${data.signalId}`, data.signalValue);
        signal.set(data.signalValue as Globals[Uses]);
      } else {
        if (data.signalId in this.inputResolvers) {
          this.inputResolvers[data.signalId](data.signalValue);
        } else {
          console.warn('got sent an input we do not know about: ', data);
        }
      }
    } else {
      console.warn('unknown message from the main thread: ', data);
    }
  }

  initOnceInput<T>(signalId: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // TODO: consider allowing parent to send stuff before we ask for it..
      // this would just involved checking the inputResolvers here.
      this.inputResolvers[signalId] = resolve as (v: unknown) => void;
    });
  }

  // // Note sure of the value of this separately... maybe handy if something isn't
  // // initially set.
  // requestInput<T>(signalId: string): Promise<T> {
  //   const message: FromWorkerMessage = { kind: 'requestInput', signalId };
  //   postMessage(message);
  //   return new Promise<T>((resolve, reject) => {
  //     // TODO: consider allowing parent to send stuff before we ask for it..
  //     // this would just involved checking the inputResolvers here.
  //     this.inputResolvers[signalId] = resolve as (v: unknown) => void;
  //   });
  // }

  // get all inputs, run the function on them, and then provide the outputs.
  // Basically an RPC.
  async runOnceHaveInputs(
    runFn: (input: ExpandOnce<WritableStructFn<Subobj<Globals, Uses>>>) => Promise<void>
  ) {
    const inputs = await this.onceAllInputs;
    await runFn(inputs as ExpandOnce<WritableStructFn<Subobj<Globals, Uses>>>);
    this.finished();
  }

  async run(runFn: () => Promise<void>) {
    await runFn();
    this.finished();
  }

  output<Key extends Updates>(signalId: Key, signalValue: Globals[Key]) {
    const message: FromWorkerMessage = { kind: 'setSignal', signalId, signalValue };
    const outputPortConfig = this.outputPorts.get(signalId);
    if (!outputPortConfig) {
      throw new Error('output signal does not exist in the output (when looking at outputPorts)');
    }
    for (const port of outputPortConfig.ports) {
      port.postMessage(message);
    }
    if (outputPortConfig.postToParentToo) {
      postMessage(message);
    }
  }

  finished() {
    const message: FromWorkerMessage = { kind: 'finished' };
    postMessage(message);
    close();
  }
}

// ============================================================================

type PromisedMetrics<Name extends string> = {
  batchId: number;
  values: { [metricName in Name]: Promise<number> };
};

export function makeMetricReporter<Name extends string>(
  space: SignalSpace,
  metrics: SetableSignal<Metrics<Name>>
): {
  reportMetrics: (batchId: number, tfScalarMetrics: { [names in Name]: tf.Scalar }) => void;
} {
  const promisedMetrics = space.setable({} as PromisedMetrics<Name>);

  // Notes:
  // - We keep all tfjs values local, so there is no memory leakage.
  // - We avoid sync calls that slow down CPU/GPU communication.
  function reportMetrics(batchId: number, tfScalarMetrics: { [names in Name]: tf.Scalar }): void {
    const promised = { batchId, values: {} } as PromisedMetrics<Name>;
    for (const [metricName, scalar] of Object.entries<tf.Scalar>(tfScalarMetrics)) {
      promised.values[metricName as Name] = scalar.array();
    }
    promisedMetrics.set(promised);
  }

  // const lastMetrics = space.writable({ batchId: -1, values: {} } as Metrics<Name>);
  space.derived(async () => {
    const promised = promisedMetrics();
    const metric = { batchId: promised.batchId, values: {} } as Metrics<Name>;
    for (const [metricName, promise] of Object.entries<Promise<number>>(promised.values)) {
      metric.values[metricName as Name] = await promise;
    }
    metrics.set(metric);
  });

  return { reportMetrics };
}
