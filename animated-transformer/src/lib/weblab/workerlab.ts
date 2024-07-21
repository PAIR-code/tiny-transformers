/// <reference lib="webworker" />

import { FromWorkerMessage, ToWorkerMessage } from './messages';
import { Signal, WritableSignal, SignalSpace } from './signalspace';

export const space = new SignalSpace();

function workerToMainMessage(m: FromWorkerMessage) {
  postMessage(m);
}

const initInputs = {} as { [name: string]: unknown };
// const recievedInputs = space.writable(initInputs);
const inputResolvers = {} as { [name: string]: (value: unknown) => void };

addEventListener('message', ({ data }) => {
  const toWorkerMessage = data as ToWorkerMessage;
  if (toWorkerMessage.kind === 'providingInput') {
    initInputs[toWorkerMessage.name] = toWorkerMessage.inputData;
    if (toWorkerMessage.name in inputResolvers) {
      inputResolvers[toWorkerMessage.name](toWorkerMessage.inputData);
    }
  }
});

export function onceGetInput<T>(name: string): Promise<T> {
  workerToMainMessage({ kind: 'requestInput', name });
  return new Promise<T>((resolve, reject) => {
    // TODO: consider allowing parent to send stuff before we ask for it..
    // this would just involved checking the inputResolvers here.
    inputResolvers[name] = resolve as (v: unknown) => void;
  });
}

export function output<T>(name: string, outputData: T) {
  workerToMainMessage({ kind: 'providingOutput', name, outputData });
}

// export class WebLabCell {}
