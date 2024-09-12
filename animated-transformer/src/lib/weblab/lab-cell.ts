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
  SignalsStructFn,
  PromisedSignalsFn,
  Metrics,
} from './cellspec';
import { ExpandOnce } from '../ts-type-helpers';

export const space = new SignalSpace();

const initInputs = {} as { [name: string]: unknown };
const inputResolvers = {} as { [name: string]: (value: unknown) => void };
let onceFinishedFn: () => void;
const onceFinished = new Promise<void>((resolve) => {
  onceFinishedFn = resolve;
});

addEventListener('message', ({ data }) => {
  const toWorkerMessage = data as ToWorkerMessage;
  if (toWorkerMessage.kind === 'finishRequest') {
    onceFinishedFn();
  }
  if (toWorkerMessage.kind === 'providingInput') {
    initInputs[toWorkerMessage.name] = toWorkerMessage.inputData;
    if (toWorkerMessage.name in inputResolvers) {
      inputResolvers[toWorkerMessage.name](toWorkerMessage.inputData);
    } else {
      console.warn('got sent an input we do not know about: ', data);
    }
  } else {
    console.warn('unknown message from the main thread: ', data);
  }
});

export function onceGetInput<T>(name: string): Promise<T> {
  postMessage({ kind: 'requestInput', name });
  return new Promise<T>((resolve, reject) => {
    // TODO: consider allowing parent to send stuff before we ask for it..
    // this would just involved checking the inputResolvers here.
    inputResolvers[name] = resolve as (v: unknown) => void;
  });
}

export function sendOutput<T>(name: string, outputData: T) {
  postMessage({ kind: 'providingOutput', name, outputData });
}

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

export type Subobj<Globals extends ValueStruct, Name extends keyof Globals> = {
  [Key in Name]: Globals[Key];
};

export class StatefulCell<
  Globals extends ValueStruct,
  Uses extends keyof Globals,
  Updates extends keyof Globals
> {
  onceFinishRequested: Promise<void> = onceFinished;
  input: PromisedSignalsFn<Subobj<Globals, Uses>>;
  stillExpectedInputs: Set<Uses>;
  inputSoFar: Partial<SignalsStructFn<Subobj<Globals, Uses>>> = {};
  onceAllInputs: Promise<SignalsStructFn<Subobj<Globals, Uses>>>;

  constructor(public global: Partial<Globals>, spec: CellStateSpec<Globals, Uses, Updates>) {
    this.input = {} as PromisedSignalsFn<Subobj<Globals, Uses>>;
    this.stillExpectedInputs = new Set(spec.uses);

    let onceAllInputsResolver: (allInput: SignalsStructFn<Subobj<Globals, Uses>>) => void;
    this.onceAllInputs = new Promise<SignalsStructFn<Subobj<Globals, Uses>>>((resolve, reject) => {
      onceAllInputsResolver = resolve;
    });

    for (const inputName of spec.uses) {
      const promisedInput = onceGetInput<Globals[typeof inputName]>(inputName as string);
      this.input[inputName] = promisedInput.then((inputValue) => {
        const signal = space.writable(inputValue);
        this.inputSoFar[inputName] = signal;
        this.stillExpectedInputs.delete(inputName);
        if (this.stillExpectedInputs.size === 0) {
          onceAllInputsResolver(this.inputSoFar as SignalsStructFn<Subobj<Globals, Uses>>);
        }
        // New inputs should now simply update the existing signal.
        inputResolvers[inputName as string] = (value) => {
          signal.set(value as Globals[typeof inputName]);
        };
        return signal;
      });
    }
  }

  // get all inputs, run the function on them, and then provide the outputs.
  // Basically an RPC.

  async run(runFn: (input: ExpandOnce<SignalsStructFn<Subobj<Globals, Uses>>>) => void) {
    const inputs = await this.onceAllInputs;
    await runFn(inputs as ExpandOnce<SignalsStructFn<Subobj<Globals, Uses>>>);
    this.finished();
  }

  output<Key extends Updates>(key: Key, value: Globals[Key]) {
    sendOutput(key as string, value);
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
  names: Name[]
): {
  lastMetrics: Signal<Metrics<Name>>;
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

  const lastMetrics = space.writable({ batchId: -1, values: {} } as Metrics<Name>);
  space.effect(async () => {
    const promised = promisedMetrics();
    const metric = { batchId: promised.batchId, values: {} } as Metrics<Name>;
    for (const [metricName, promise] of Object.entries<Promise<number>>(promised.values)) {
      metric.values[metricName as Name] = await promise;
    }
    lastMetrics.set(metric);
  });

  return { lastMetrics, reportMetrics };
}
