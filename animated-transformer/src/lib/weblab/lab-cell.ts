/// <reference lib="webworker" />

import { FromWorkerMessage, ToWorkerMessage } from './messages';
import { Signal, WritableSignal, SignalSpace } from './signalspace';
import { InputPromises, ValueStruct, CellSpec as CellSpec } from './cellspec';

export const space = new SignalSpace();

const initInputs = {} as { [name: string]: unknown };
// const recievedInputs = space.writable(initInputs);
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

export class Cell<Input extends ValueStruct, Output extends ValueStruct> {
  input: InputPromises<Input>;
  stillExpectedInputs: Set<keyof Input>;
  inputSoFar: Partial<Input> = {};
  onceAllInputs: Promise<Input>;

  constructor(spec: CellSpec<Input, Output>) {
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
  async runOnce(runFn: (input: Input) => Output) {
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
