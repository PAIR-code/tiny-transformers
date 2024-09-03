/// <reference lib="webworker" />

import { FromWorkerMessage, ToWorkerMessage } from './messages';
import { Signal, WritableSignal, SignalSpace } from './signalspace';
import {
  ValueStruct,
  CellFuncSpec as CellFuncSpec,
  CellStateSpec,
  PromiseStructFn,
  SignalsStructFn,
  PromisedSignalsFn,
} from './cellspec';

export const space = new SignalSpace();

const initInputs = {} as { [name: string]: unknown };
const inputResolvers = {} as { [name: string]: (value: unknown) => void };

addEventListener('message', ({ data }) => {
  const toWorkerMessage = data as ToWorkerMessage;
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

export class FuncCell<Input extends ValueStruct, Output extends ValueStruct> {
  input: PromiseStructFn<Input>;
  stillExpectedInputs: Set<keyof Input>;
  inputSoFar: Partial<Input> = {};
  onceAllInputs: Promise<Input>;

  constructor(spec: CellFuncSpec<Input, Output>) {
    this.input = {} as Input;
    this.stillExpectedInputs = new Set(spec.inputs);

    let onceAllInputsResolver: (allInput: Input) => void;
    this.onceAllInputs = new Promise<Input>((resolve, reject) => {
      onceAllInputsResolver = resolve;
    });

    for (const inputName of spec.inputs) {
      this.input[inputName] = onceGetInput(inputName as string);
      this.input[inputName].then((inputValue) => {
        this.inputSoFar[inputName] = inputValue;
        this.stillExpectedInputs.delete(inputName);
        if (this.stillExpectedInputs.size === 0) {
          onceAllInputsResolver(this.inputSoFar as Input);
        }
      });
    }
  }

  // get all inputs, run the function on them, and then provide the outputs.
  // Basically an RPC.
  async run(runFn: (input: Input) => Output) {
    const inputs = await this.onceAllInputs;
    const outputs = runFn(inputs);
    for (const [outputName, outputValue] of Object.entries(outputs)) {
      this.output(outputName, outputValue);
    }
    this.finished();
  }

  output<Key extends keyof Output>(key: Key, value: Output[Key]) {
    sendOutput(key as string, value);
  }

  finished() {
    postMessage({ kind: 'finished' });
    close();
  }
}

export class StatefulCell<
  Globals extends ValueStruct,
  Uses extends Globals,
  Updates extends Globals
> {
  input: PromisedSignalsFn<Uses>;
  stillExpectedInputs: Set<keyof Uses>;
  inputSoFar: Partial<SignalsStructFn<Uses>> = {};
  onceAllInputs: Promise<SignalsStructFn<Uses>>;

  constructor(spec: CellStateSpec<Uses & Updates, keyof Uses, keyof Updates>) {
    this.input = {} as PromisedSignalsFn<Uses>;
    this.stillExpectedInputs = new Set(spec.uses);

    let onceAllInputsResolver: (allInput: SignalsStructFn<Uses>) => void;
    this.onceAllInputs = new Promise<SignalsStructFn<Uses>>((resolve, reject) => {
      onceAllInputsResolver = resolve;
    });

    for (const inputName of spec.uses) {
      const promisedInput = onceGetInput<Uses[typeof inputName]>(inputName as string);
      this.input[inputName] = promisedInput.then((inputValue) => {
        const signal = space.writable(inputValue);
        this.inputSoFar[inputName] = signal;
        this.stillExpectedInputs.delete(inputName);
        if (this.stillExpectedInputs.size === 0) {
          onceAllInputsResolver(this.inputSoFar as SignalsStructFn<Uses>);
        }
        // New inputs should now simply update the existing signal.
        inputResolvers[inputName as string] = (value) => {
          signal.set(value as Uses[typeof inputName]);
        };
        return signal;
      });
    }
  }

  // get all inputs, run the function on them, and then provide the outputs.
  // Basically an RPC.
  async run(runFn: (input: SignalsStructFn<Uses>) => void) {
    const inputs = await this.onceAllInputs;
    runFn(inputs);
    this.finished();
  }

  output<Key extends keyof Updates>(key: Key, value: Updates[Key]) {
    sendOutput(key as string, value);
  }

  finished() {
    postMessage({ kind: 'finished' });
    close();
  }
}
