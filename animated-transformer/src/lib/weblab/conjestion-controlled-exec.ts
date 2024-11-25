import { Signal } from '@angular/core';
import {
  AbstractSignal,
  DerivedSignal,
  promisifySignal,
  SetableSignal,
  SignalSpace,
} from '../signalspace/signalspace';

enum ConjestionControlState {
  Running,
  Paused,
  Stopped,
}

// Assumption: executions should happen in order. This is modelled on the signal
// abstraction, where as soon as a value is set, then we consider the downstream
// work on the other side of the webworker to be done.
//
// TODO: consider an abstraction that doesn't assume/require downstream
// execution to happen in order.
export class ConjestionControlledExec {
  public lastExecId: number;
  // public lastCompletedId: number;
  public state = ConjestionControlState.Stopped;
  // Indicates the currrnet last completed index, and has a promise to wait for
  // the next.
  public completed: DerivedSignal<{
    cur: number;
    next: Promise<number>;
    rejectFn: () => void;
  }>;

  constructor(
    public config: {
      initId: number;
      maxQueueLength: number;
      completedSignal: AbstractSignal<number>;
      execFn?: (queueId: number) => void;
      maxExecId?: number;
    }
  ) {
    this.lastExecId = config.initId;
    this.completed = promisifySignal(config.completedSignal);
  }

  // async exec() {
  //   this.running = true;
  //   while (this.running) {
  //     while (this.running) {
  //       const lastCompletedId = this.completedIdState().cur;
  //       const curQueueSize = this.lastExecId - lastCompletedId;
  //       if (this.maxExecId && lastCompletedId >= this.maxExecId) {
  //         this.running = false;
  //         return;
  //       }
  //       if (curQueueSize >= this.maxQueueLength) {
  //         break;
  //       }
  //       this.lastExecId++;
  //       this.execFn(this.lastExecId);
  //     }
  //     await this.completedIdState().next;
  //   }
  // }

  public start(fn: (nextExecId: number) => void): void {
    this.config.execFn = fn;
    this.continue();
  }

  public continue() {
    this.state = ConjestionControlState.Running;
    this.exec();
  }

  async pauseForConjestion() {
    this.state = ConjestionControlState.Paused;
    await this.completed().next;
    this.continue();
  }

  exec() {
    if (!this.config.execFn) {
      throw new Error('Exec called when no execFn was specified');
    }
    const lastCompletedId = this.completed().cur;
    const curQueueSize = this.lastExecId - lastCompletedId;
    if (this.config.maxExecId && lastCompletedId >= this.config.maxExecId) {
      this.state = ConjestionControlState.Stopped;
      return;
    }
    if (curQueueSize >= this.config.maxQueueLength) {
      this.pauseForConjestion();
    } else {
      this.lastExecId++;
      this.config.execFn(this.lastExecId);
      // Using set Timeout allows other work to happen, e.g. other JS events to
      // stop execution.
      setTimeout(() => {
        if (this.state === ConjestionControlState.Running) {
          this.exec();
        }
      }, 0);
    }
  }

  public stop() {
    this.state = ConjestionControlState.Stopped;
  }
}

// TODO: think about a canceller for this, e.g. return something like so:
//   { cancel() => void; done: boolean, onceDone: Promise<void> }
// export function asyncIterReduce<T, T2>(
//   iter: AsyncIterable<T>,
//   startFn: (firstValue: T) => T2,
//   nextFn: (nextValue: T, cur: T2) => T2
// ): { done: Promise<void>; cur: Promise<T2> } {
//   let resolveDoneFn: () => void;
//   const onceDone = new Promise<void>((resolve) => {
//     resolveDoneFn = resolve;
//   });
//   let resolveFirstFn: (first:T2) => void;
//   const onceFirst = new Promise<T2>((resolve) => {
//     resolveFirstFn = resolve;
//   });
//   setTimeout(async () => {
//     let first: T2 | undefined;
//     for await (const i of iter) {
//       if(!first) {
//         first = startFn(i);
//         resolveFirstFn(first);
//       } else {
//         signal.set(i);
//       }
//     }
//     resolveDoneFn();
//   }, 0);
//   return onceDone;
// }

// This class connects an event function (someone cal call the nextEvent(X))
// with an AsyncIter of the values that are called within nextEvent. It also
// exposes a done() funtcion that ends the AsyncIterator.
export class AsyncIterOnEvents<T> implements AsyncIterable<T>, AsyncIterator<T> {
  // If there is no queue, then async iter has completed.
  queue?: T[] = [];
  // resolveFn is set when next() is waiting for a promise to complete, which
  // will happen when the next event call is made providing the next value. This
  // happens when events come in more slower than next() is called. When next()
  // is called slower than events come in, then values are put on the queue, and
  // there is no resolveFn set.
  resolveFn?: (v: IteratorResult<T, null>) => void;

  constructor() {}

  public nextEvent(value: T) {
    // If done, return;
    if (!this.queue) {
      return;
    }
    if (this.resolveFn) {
      this.resolveFn({ value });
    } else {
      this.queue.push(value);
    }
  }

  public done() {
    if (this.resolveFn) {
      this.resolveFn({ done: true, value: null });
    }
    delete this.queue;
  }

  nextPromise(): Promise<IteratorResult<T, null>> {
    const p = new Promise<IteratorResult<T, null>>((resolve) => {
      this.resolveFn = resolve;
    });
    p.then(() => {
      delete this.resolveFn;
    });
    return p;
  }

  async next(): Promise<IteratorResult<T, null>> {
    if (!this.queue) {
      return { done: true, value: null };
    }
    const value = this.queue.shift();
    if (value) {
      return { value };
    } else {
      return this.nextPromise();
    }
  }

  public [Symbol.asyncIterator]() {
    return this;
  }
}

// async function f(a: AsyncIterOnEvents<number>) {
//   for await (const x of a) {
//   }
// }
