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
    },
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
