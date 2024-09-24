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
import { Signal, WritableSignal, SignalSpace } from './signalspace';
import {
  ValueStruct,
  CellStateSpec,
  PromiseStructFn,
  WritableStructFn,
  PromisedSignalsFn,
  Metrics,
  Subobj,
} from './cellspec';
import { ExpandOnce } from '../ts-type-helpers';

// export class LabCell<Globals extends { [key: string]: any }, I extends string, O extends string> {
//   constructor(op: WorkerOp<I, O>) {}
//   inputs;
// }

// export class FuncCell<Input extends ValueStruct, Output extends ValueStruct> {
//   onceFinishRequested: Promise<void> = onceFinished;
//   input: PromiseStructFn<Input>;
//   stillExpectedInputs: Set<keyof Input>;
//   inputSoFar: Partial<Input> = {};
//   onceAllInputs: Promise<Input>;

//   constructor(spec: CellFuncSpec<Input, Output>) {
//     this.input = {} as Input;
//     this.stillExpectedInputs = new Set(spec.inputs);

//     let onceAllInputsResolver: (allInput: Input) => void;
//     this.onceAllInputs = new Promise<Input>((resolve, reject) => {
//       onceAllInputsResolver = resolve;
//     });

//     for (const inputName of spec.inputs) {
//       this.input[inputName] = onceGetInput(inputName as string);
//       this.input[inputName].then((inputValue) => {
//         this.inputSoFar[inputName] = inputValue;
//         this.stillExpectedInputs.delete(inputName);
//         if (this.stillExpectedInputs.size === 0) {
//           onceAllInputsResolver(this.inputSoFar as Input);
//         }
//       });
//     }
//   }

//   // get all inputs, run the function on them, and then provide the outputs.
//   // Basically an RPC.
//   async run(runFn: (input: Input) => Output) {
//     const inputs = await this.onceAllInputs;
//     const outputs = runFn(inputs);
//     for (const [outputName, outputValue] of Object.entries(outputs)) {
//       this.output(outputName, outputValue);
//     }
//     this.finished();
//   }

//   output<Key extends keyof Output>(key: Key, value: Output[Key]) {
//     sendOutput(key as string, value);
//   }

//   finished() {
//     postMessage({ kind: 'finished' });
//     close();
//   }
// }

export class StatefulCell<
  Globals extends ValueStruct,
  Uses extends keyof Globals,
  Updates extends keyof Globals
> {
  space = new SignalSpace();
  onceFinishRequested: Promise<void>;
  inputPromises: PromisedSignalsFn<Subobj<Globals, Uses>>;
  stillExpectedInputs: Set<Uses>;
  inputSoFar: Partial<WritableStructFn<Subobj<Globals, Uses>>> = {};
  onceAllInputs: Promise<WritableStructFn<Subobj<Globals, Uses>>>;
  inputResolvers = {} as { [name: string]: (value: unknown) => void };

  constructor(public global: Partial<Globals>, spec: CellStateSpec<Globals, Uses, Updates>) {
    let onceFinishedFn: () => void;
    this.onceFinishRequested = new Promise<void>((resolve) => {
      onceFinishedFn = resolve;
    });

    addEventListener('message', ({ data }) => {
      const toWorkerMessage = data as ToWorkerMessage;
      if (toWorkerMessage.kind === 'finishRequest') {
        onceFinishedFn();
      }
      if (toWorkerMessage.kind === 'providingInput') {
        const signal = this.inputSoFar[toWorkerMessage.name as Uses];
        if (signal) {
          signal.set(toWorkerMessage.inputData as Globals[Uses]);
        } else {
          if (toWorkerMessage.name in this.inputResolvers) {
            this.inputResolvers[toWorkerMessage.name](toWorkerMessage.inputData);
          } else {
            console.warn('got sent an input we do not know about: ', data);
          }
        }
      } else {
        console.warn('unknown message from the main thread: ', data);
      }
    });

    this.inputPromises = {} as PromisedSignalsFn<Subobj<Globals, Uses>>;
    this.stillExpectedInputs = new Set(spec.uses);

    let onceAllInputsResolver: (allInput: WritableStructFn<Subobj<Globals, Uses>>) => void;
    this.onceAllInputs = new Promise<WritableStructFn<Subobj<Globals, Uses>>>((resolve, reject) => {
      onceAllInputsResolver = resolve;
    });

    for (const inputName of spec.uses) {
      const promisedInput = this.initOnceInput<Globals[typeof inputName]>(inputName as string);
      this.inputPromises[inputName] = promisedInput.then((inputValue) => {
        const signal = this.space.writable(inputValue);
        this.inputSoFar[inputName] = signal;
        this.stillExpectedInputs.delete(inputName);
        if (this.stillExpectedInputs.size === 0) {
          onceAllInputsResolver(this.inputSoFar as WritableStructFn<Subobj<Globals, Uses>>);
        }
        // New inputs should now simply update the existing signal.
        this.inputResolvers[inputName as string] = (value) => {
          signal.set(value as Globals[typeof inputName]);
        };
        return signal;
      });
    }
  }

  initOnceInput<T>(name: string): Promise<T> {
    // postMessage({ kind: 'requestInput', name });
    return new Promise<T>((resolve, reject) => {
      // TODO: consider allowing parent to send stuff before we ask for it..
      // this would just involved checking the inputResolvers here.
      this.inputResolvers[name] = resolve as (v: unknown) => void;
    });
  }

  // Note sure of the value of this separately... maybe handy if something isn't
  // initially set.
  requestInput<T>(name: string): Promise<T> {
    postMessage({ kind: 'requestInput', name });
    return new Promise<T>((resolve, reject) => {
      // TODO: consider allowing parent to send stuff before we ask for it..
      // this would just involved checking the inputResolvers here.
      this.inputResolvers[name] = resolve as (v: unknown) => void;
    });
  }

  // get all inputs, run the function on them, and then provide the outputs.
  // Basically an RPC.
  async run(runFn: (input: ExpandOnce<WritableStructFn<Subobj<Globals, Uses>>>) => void) {
    const inputs = await this.onceAllInputs;
    await runFn(inputs as ExpandOnce<WritableStructFn<Subobj<Globals, Uses>>>);
    this.finished();
  }

  output<Key extends Updates>(key: Key, value: Globals[Key]) {
    postMessage({ kind: 'providingOutput', key, value });
  }

  finished() {
    postMessage({ kind: 'finished' });
    close();
  }
}

// ============================================================================

type PromisedMetrics<Name extends string> = {
  batchId: number;
  values: { [name in Name]: Promise<number> };
};

export function makeMetricReporter<Name extends string>(
  space: SignalSpace,
  metrics: WritableSignal<Metrics<Name>>
): {
  reportMetrics: (batchId: number, tfScalarMetrics: { [names in Name]: tf.Scalar }) => void;
} {
  const promisedMetrics = space.writable({} as PromisedMetrics<Name>);

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
  space.effect(async () => {
    const promised = promisedMetrics();
    const metric = { batchId: promised.batchId, values: {} } as Metrics<Name>;
    for (const [metricName, promise] of Object.entries<Promise<number>>(promised.values)) {
      metric.values[metricName as Name] = await promise;
    }
    metrics.set(metric);
  });

  return { reportMetrics };
}
