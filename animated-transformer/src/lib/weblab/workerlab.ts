/// <reference lib="webworker" />

import { Signal, WritableSignal, SignalSpace } from './signalspace';

export const space = new SignalSpace();

export function inputting<T>(name: string, defaultValue: T): Signal<T> {
  const inputSignal = space.writable(defaultValue);
  addEventListener('message', ({ data }) => {
    inputSignal.set(data);
  });
  return inputSignal;
}

export function outputting<T>(
  name: string,
  defaultValue: T
): WritableSignal<T> {
  const outputSignal = space.writable(defaultValue);
  space.effect(() => {
    const outputValue = outputSignal();
    postMessage(outputValue);
  });
  return outputSignal;
}

// export class WebLabCell {}
