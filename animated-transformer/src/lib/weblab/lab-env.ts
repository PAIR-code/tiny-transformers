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

import {
  AbstractSignalStructFn,
  ValueStruct,
  CellKind,
  PromiseStructFn,
  PromisedSetableSignalsFn,
  SetableSignalStructFn,
  AsyncIterableFn,
  AsyncOutStreamFn,
} from './cell-types';
import {
  LabMessage,
  LabMessageKind,
  SetSignalValueMessage,
  StreamValue,
} from 'src/lib/weblab/lab-message-types';
import { AbstractSignal, SignalSpace } from '../signalspace/signalspace';

export type ItemMetaData = {
  timestamp: Date;
};

import {
  SignalInput,
  SignalInputStream,
  SignalOutput,
  SignalOutputStream,
} from './signal-messages';

// Class wrapper to communicate with a cell in a webworker.
export type LabEnvCellConfig = {
  // For printing error/debug messages, when provided.
  logCellMessages: boolean;
  // When true, logs all messages to/from worker.
  // logMessagesToCell: boolean;
  // logMessagesFromCell: boolean;
};

interface BasicWorker {
  set onmessage(m: ((ev: MessageEvent) => any) | null);
  postMessage(message: any, transfer?: Transferable[]): void;
  terminate(): void;
}

class LoggingMessagesWorker implements BasicWorker {
  constructor(public worker: Worker, public id: string) {}

  set onmessage(m: ((ev: MessageEvent) => any) | null) {
    if (m === null) {
      this.worker.onmessage = null;
    } else {
      this.worker.onmessage = (ev: MessageEvent) => {
        console.log(`from ${this.id} to env: `, ev);
        m(ev);
      };
    }
  }

  postMessage(message: any, transfer?: Transferable[]) {
    console.log(`from env to ${this.id}: `, message);
    this.worker.postMessage(message, transfer || []);
  }

  terminate() {
    this.worker.terminate();
  }
}

export class LabEnvCell<
  I extends ValueStruct,
  IStream extends ValueStruct,
  O extends ValueStruct,
  OStream extends ValueStruct
> {
  // Resolved once the webworker says it has finished.
  public onceFinished: Promise<void>;
  public onceAllOutputs: Promise<AbstractSignalStructFn<O>>;
  public worker: BasicWorker;

  inputs: { [Key in keyof I]: AbstractSignal<I[Key]> | SignalInput<I[Key]> };

  // { [Key in keyof I]: AbstractSignal<I[Key]> };

  // inputStreams: SignalStructFn<IStream>;
  // streamsFromEnv = {} as {
  //   [Key in keyof IStream]: SignalOutputStream<Key & string, IStream[Key]>;
  // };
  public inStream = {} as {
    [Key in keyof IStream]: SignalOutputStream<IStream[Key]>;
  };

  // {} as AsyncOutStreamFn<IStream>;

  // signalsInToEnv = {} as {
  //   [Key in keyof O]: SignalInput<O[Key]>;
  // };
  public outputs = {} as {
    [Key in keyof O]: SignalInput<O[Key]>;
  };

  // PromiseStructFn<AbstractSignalStructFn<O>>;

  // streamsInToEnv = {} as {
  //   [Key in keyof OStream]: SignalInputStream<OStream[Key]>;
  // };
  public outStream = {} as {
    [Key in keyof OStream]: SignalInputStream<OStream[Key]>;
  };

  // SignalInputStream<OStream[Key]>  AsyncIterableFn<OStream>;

  public outputSoFar: Partial<AbstractSignalStructFn<O>>;
  public stillExpectedOutputs: Set<keyof O>;

  constructor(
    public id: string,
    public space: SignalSpace,
    public cellKind: CellKind<I, IStream, O, OStream>,
    public uses: {
      // TODO: make better types: Maybe<SignalStructFn<I>> that is undefined when I={}
      inputs?: { [Key in keyof I]: AbstractSignal<I[Key]> | SignalInput<I[Key]> };
      // inStreams?: AsyncIterableFn<IStream>;
    },
    config?: LabEnvCellConfig
  ) {
    let resolveWithAllOutputsFn: (output: AbstractSignalStructFn<O>) => void;
    this.onceAllOutputs = new Promise<AbstractSignalStructFn<O>>((resolve, reject) => {
      resolveWithAllOutputsFn = resolve;
    });
    let resolveWhenFinishedFn: () => void;
    this.onceFinished = new Promise<void>((resolve, reject) => {
      resolveWhenFinishedFn = resolve;
    });

    if (config && config.logCellMessages) {
      this.worker = new LoggingMessagesWorker(cellKind.data.workerFn(), this.id);
    } else {
      this.worker = cellKind.data.workerFn();
    }

    this.outputSoFar = {};
    this.stillExpectedOutputs = new Set(cellKind.outputNames);

    for (const streamName of cellKind.inStreamNames) {
      const stream = new SignalOutputStream<IStream[keyof IStream]>(
        this.space,
        streamName as keyof O & string,
        {
          conjestionControl: {
            maxQueueSize: 20,
            resumeAtQueueSize: 10,
          },
          defaultPostMessageFn: (v, transerables) => this.worker.postMessage(v, transerables),
        }
      );
      // this.streamsFromEnv[streamName] = stream;
      this.inStream[streamName] = stream;
    }

    for (const oName of cellKind.outputNames) {
      const envInput = new SignalInput<O[keyof O]>(
        this.space,
        oName as keyof O & string,
        (v, transerables) => this.worker.postMessage(v, transerables)
      );
      this.outputs[oName] = envInput;

      // this.outputs[oName] = envInput.onceReady;
      envInput.onceReady.then((signal) => {
        this.outputSoFar[oName] = signal;
        this.stillExpectedOutputs.delete(oName);
        if (this.stillExpectedOutputs.size === 0) {
          resolveWithAllOutputsFn(this.outputSoFar as SetableSignalStructFn<O>);
        }
      });
    }

    for (const oStreamName of cellKind.outStreamNames) {
      const envStreamInput = new SignalInputStream<OStream[keyof OStream]>(
        this.space,
        oStreamName as keyof OStream & string,
        (m) => this.worker.postMessage(m)
      );
      this.outStream[oStreamName] = envStreamInput;
    }

    // Protocall of stuff a worker can send us, and we respond to...
    this.worker.onmessage = ({ data }) => {
      // console.log('main thread got worker.onmessage', data);
      const messageFromWorker: LabMessage = data;
      switch (messageFromWorker.kind) {
        case LabMessageKind.Finished:
          // TODO: what if there are missing outputs?
          resolveWhenFinishedFn();
          this.worker.terminate();
          // resolveWithAllOutputsFn(this.outputSoFar as SignalStructFn<Subobj<Globals, O>>);
          break;
        case LabMessageKind.SetSignalValue: {
          const oName = messageFromWorker.signalId as keyof O & string;
          this.outputs[oName].onSetInput(messageFromWorker.value as O[keyof O & string]);
          break;
        }
        case LabMessageKind.AddStreamValue: {
          const oStreamName = messageFromWorker.streamId as keyof OStream & string;
          this.outStream[oStreamName].onAddValue(
            null,
            messageFromWorker.value as StreamValue<OStream[keyof OStream & string]>
          );
          break;
        }
        case LabMessageKind.EndStream: {
          const oStreamName = messageFromWorker.streamId as keyof OStream & string;
          this.outStream[oStreamName].onDone();
          break;
        }
        case LabMessageKind.ConjestionControl: {
          const id = messageFromWorker.streamId as keyof OStream & string;
          this.inStream[id].conjestionFeedbackStateUpdate(messageFromWorker);
          break;
        }
        default:
          console.error('main thread go unknown worker message: ', data);
          break;
      }
    };

    // Inputs either are pipes, or signal values... make sure to connect stuff.
    this.inputs = uses.inputs || ({} as AbstractSignalStructFn<I>);
    for (const k of Object.keys(this.inputs)) {
      const input = this.inputs[k];
      if (input instanceof SignalInput) {
        const channel = new MessageChannel();
        // Note: ports are transferred to the worker.
        const message: LabMessage = {
          kind: LabMessageKind.PipeOutputSignal,
          signalId: k,
          ports: [channel.port2],
        };
        input.defaultPostMessageFn(message, message.ports);
        this.pipeInputSignal(k, [channel.port1]);
      } else {
        //
        this.space.derived(() => {
          const value = input(); // Note signal dependency.
          const message: SetSignalValueMessage = {
            kind: LabMessageKind.SetSignalValue,
            signalId: k,
            value,
          };
          this.worker.postMessage(message);
        });
      }
    }

    // // In addition, whenever any of the "uses" variables are updated, we send
    // // the update to the worker.
    // for (const key of spec.inputNames) {
    //   this.space.derived(() => {
    //     const value = this.inputs[key as keyof I](); // Note signal dependency.
    //     const message: SetSignalValueMessage = {
    //       kind: LabMessageKind.SetSignalValue,
    //       signalId: key as keyof I & string,
    //       value,
    //     };
    //     this.worker.postMessage(message);
    //   });
    // }
  }

  start() {
    const message: LabMessage = {
      kind: LabMessageKind.StartCellRun,
    };
    this.worker.postMessage(message);
  }

  requestStop() {
    const message: LabMessage = {
      kind: LabMessageKind.FinishRequest,
    };
    this.worker.postMessage(message);
  }

  public pipeInputSignal(signalId: keyof I, ports: MessagePort[]) {
    const message: LabMessage = {
      kind: LabMessageKind.PipeInputSignal,
      signalId: signalId as string,
      ports,
    };
    // Note: ports are transferred to the worker.
    this.worker.postMessage(message, ports);
  }
  public pipeOutputSignal(
    signalId: keyof O,
    ports: MessagePort[],
    options?: { keepHereToo: boolean }
  ) {
    const message: LabMessage = {
      kind: LabMessageKind.PipeOutputSignal,
      signalId: signalId as string,
      ports,
      options,
    };
    // Note ports are transferred to the worker.
    this.worker.postMessage(message, ports);
  }

  public pipeInputStream(streamId: keyof IStream, ports: MessagePort[]) {
    const message: LabMessage = {
      kind: LabMessageKind.PipeInputStream,
      streamId: streamId as string,
      ports,
    };
    // Note: ports are transferred to the worker.
    this.worker.postMessage(message, ports);
  }
  public pipeOutputStream(
    streamId: keyof OStream,
    ports: MessagePort[],
    options?: { keepHereToo: boolean }
  ) {
    const message: LabMessage = {
      kind: LabMessageKind.PipeOutputStream,
      streamId: streamId as string,
      ports,
      options,
    };
    // Note ports are transferred to the worker.
    this.worker.postMessage(message, ports);
  }
  // TODO: add some closing cleanup?
}

type SomeCellStateSpec = CellKind<ValueStruct, ValueStruct, ValueStruct, ValueStruct>;
type SomeLabEnvCell = LabEnvCell<ValueStruct, ValueStruct, ValueStruct, ValueStruct>;

// TODO: maybe define a special type of serializable
// object that includes things with a toSerialise function?

export class LabEnv {
  space = new SignalSpace();
  // metadata: Map<string, ItemMetaData> = new Map();
  public runningCells: {
    [name: string]: SomeCellStateSpec;
  } = {};

  init<
    I extends ValueStruct,
    IStreams extends ValueStruct,
    O extends ValueStruct,
    OStreams extends ValueStruct
  >(
    spec: CellKind<I, IStreams, O, OStreams>,
    inputs?: { [Key in keyof I]: AbstractSignal<I[Key]> | SignalInput<I[Key]> }
  ): LabEnvCell<I, IStreams, O, OStreams> {
    this.runningCells[spec.data.cellName] = spec as SomeCellStateSpec;
    const envCell = new LabEnvCell(
      spec.data.cellName,
      this.space,
      spec,
      { inputs }
      // { logCellMessagesName: spec.data.cellName }
    );
    envCell.onceFinished.then(() => delete this.runningCells[spec.data.cellName]);
    return envCell;
  }

  start<
    I extends ValueStruct,
    IStreams extends ValueStruct,
    O extends ValueStruct,
    OStreams extends ValueStruct
  >(
    spec: CellKind<I, IStreams, O, OStreams>,
    inputs?: AbstractSignalStructFn<I>
  ): LabEnvCell<I, IStreams, O, OStreams> {
    const envCell = this.init(spec, inputs);
    envCell.start();
    return envCell;
  }

  pipeSignal<
    SourceOut extends ValueStruct,
    TargetIn extends ValueStruct,
    SignalId extends keyof SourceOut & keyof TargetIn & string
  >(
    sourceCell: LabEnvCell<ValueStruct, ValueStruct, SourceOut, ValueStruct>,
    signalId: SignalId,
    targetCell: LabEnvCell<TargetIn, ValueStruct, ValueStruct, ValueStruct>,
    options?: { keepHereToo: boolean }
  ) {
    const channel = new MessageChannel();
    sourceCell.pipeOutputSignal(signalId, [channel.port1], options);
    targetCell.pipeInputSignal(signalId, [channel.port2]);
    // TODO: keep track of channels between cells.
  }

  pipeStream<
    SourceOut extends ValueStruct,
    TargetIn extends ValueStruct,
    SignalId extends keyof SourceOut & keyof TargetIn & string
  >(
    sourceCell: LabEnvCell<ValueStruct, ValueStruct, ValueStruct, SourceOut>,
    signalId: SignalId,
    targetCell: LabEnvCell<ValueStruct, TargetIn, ValueStruct, ValueStruct>,
    options?: { keepHereToo: boolean }
  ) {
    const channel = new MessageChannel();
    sourceCell.pipeOutputStream(signalId, [channel.port1], options);
    targetCell.pipeInputStream(signalId, [channel.port2]);
    // TODO: keep track of channels between cells.
  }
}
