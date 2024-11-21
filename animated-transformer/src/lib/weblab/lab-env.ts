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
  CellSpec,
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
import { SignalSpace } from '../signalspace/signalspace';

export type ItemMetaData = {
  timestamp: Date;
};

import { SignalInput, SignalInputStream, SignalOutputStream } from './signal-messages';

// class EnvCell<
//   Inputs extends ValueStruct = {},
//   InputStreams extends ValueStruct = {},
//   Outputs extends ValueStruct = {},
//   OutputStreams extends ValueStruct = {}
// > extends SignalCell<Inputs, InputStreams, Outputs, OutputStreams> {
//   public worker: Worker;

//   constructor(spec: CellSpec<Inputs, InputStreams, Outputs, OutputStreams>) {
//     super(spec, () => {});
//     this.worker = spec.data.workerFn();
//     this.defaultPostMessageFn = this.worker.postMessage;

//     this.onceFinishRequested

//     this.worker.addEventListener('message',
//       ({ data }) => {
//         // console.log('main thread got worker.onmessage', data);
//         const messageFromWorker: FromWorkerMessage = data;
//         switch (messageFromWorker.kind) {
//         case 'finished':
//           // TODO: what if there are missing outputs?
//           resolveWhenFinishedFn();
//           this.worker.terminate();

//           // resolveWithAllOutputsFn(this.outputSoFar as SignalStructFn<Subobj<Globals, O>>);
//           break;

//       this.onMessage(m));
//   }

//   requestStop() {
//     const message: ToWorkerMessage = {
//       kind: 'finishRequest',
//     };
//     this.worker.postMessage(message);
//   }
// }

// export function envCell<
//   Inputs extends ValueStruct = {},
//   InputStreams extends ValueStruct = {},
//   Outputs extends ValueStruct = {},
//   OutputStreams extends ValueStruct = {}
// >(
//   spec: CellSpec<Inputs, InputStreams, Outputs, OutputStreams>
// ): SignalCell<Inputs, InputStreams, Outputs, OutputStreams> {
//   const worker = spec.data.workerFn();
//   const cell = new SignalCell<Inputs, InputStreams, Outputs, OutputStreams>(
//     spec,
//     worker.postMessage
//   );
//   worker.addEventListener('message', (m) => cell.onMessage(m));
//   return cell;
// }

// Class wrapper to communicate with a cell in a webworker.
export class LabEnvCell<
  I extends ValueStruct,
  IStream extends ValueStruct,
  O extends ValueStruct,
  OStream extends ValueStruct
> {
  // Resolved once the webworker says it has finished.
  public onceFinished: Promise<void>;
  public onceAllOutputs: Promise<AbstractSignalStructFn<O>>;
  public worker: Worker;

  inputs: AbstractSignalStructFn<I>;

  // inputStreams: SignalStructFn<IStream>;
  // streamsFromEnv = {} as {
  //   [Key in keyof IStream]: SignalOutputStream<Key & string, IStream[Key]>;
  // };
  public inStream = {} as {
    [Key in keyof IStream]: SignalOutputStream<IStream[Key]>;
  };

  // {} as AsyncOutStreamFn<IStream>;

  signalsInToEnv = {} as {
    [Key in keyof O]: SignalInput<Key & string, O[Key]>;
  };
  public outputs: PromiseStructFn<AbstractSignalStructFn<O>>;

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
    public space: SignalSpace,
    public spec: CellSpec<I, IStream, O, OStream>,
    public uses: {
      // TODO: make better types: Maybe<SignalStructFn<I>> that is undefined when I={}
      inputs?: AbstractSignalStructFn<I>;
      // inStreams?: AsyncIterableFn<IStream>;
    }
  ) {
    this.inputs = uses.inputs || ({} as AbstractSignalStructFn<I>);
    // this.inputStreams = uses.inputStreams || ({} as SignalStructFn<IStream>);

    let resolveWithAllOutputsFn: (output: AbstractSignalStructFn<O>) => void;
    this.onceAllOutputs = new Promise<AbstractSignalStructFn<O>>((resolve, reject) => {
      resolveWithAllOutputsFn = resolve;
    });
    let resolveWhenFinishedFn: () => void;
    this.onceFinished = new Promise<void>((resolve, reject) => {
      resolveWhenFinishedFn = resolve;
    });
    this.worker = spec.data.workerFn();
    this.outputs = {} as PromisedSetableSignalsFn<O>;

    this.outputSoFar = {};
    this.stillExpectedOutputs = new Set(spec.outputNames);

    for (const streamName of spec.inStreamNames) {
      const stream = new SignalOutputStream<IStream[keyof IStream]>(
        this.space,
        streamName as keyof O & string,
        {
          conjestionControl: {
            maxQueueSize: 20,
            resumeAtQueueSize: 10,
          },
          defaultPostMessageFn: (v) => this.worker.postMessage(v),
        }
      );
      // this.streamsFromEnv[streamName] = stream;
      this.inStream[streamName] = stream;
    }

    for (const oName of spec.outputNames) {
      const envInput = new SignalInput<keyof O & string, O[keyof O]>(
        this.space,
        oName as keyof O & string
      );
      this.signalsInToEnv[oName] = envInput;
      this.outputs[oName] = envInput.onceReady;
      envInput.onceReady.then((signal) => {
        this.outputSoFar[oName] = signal;
        this.stillExpectedOutputs.delete(oName);
        if (this.stillExpectedOutputs.size === 0) {
          resolveWithAllOutputsFn(this.outputSoFar as SetableSignalStructFn<O>);
        }
      });
    }

    for (const oStreamName of spec.outStreamNames) {
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
        case LabMessageKind.SetSignalValue:
          const oName = messageFromWorker.signalId as keyof O & string;
          this.signalsInToEnv[oName].onSetInput(messageFromWorker.value as O[keyof O & string]);
          break;
        case LabMessageKind.AddStreamValue:
          const oStreamName = messageFromWorker.streamId as keyof OStream & string;
          this.outStream[oStreamName].onAddValue(
            null,
            messageFromWorker.value as StreamValue<OStream[keyof OStream & string]>
          );
          break;
        case LabMessageKind.ConjestionControl:
          const id = messageFromWorker.streamId as keyof OStream & string;
          this.inStream[id].conjestionFeedbackStateUpdate(messageFromWorker);
          break;
        default:
          console.error('main thread go unknown worker message: ', data);
          break;
      }
    };

    // In addition, whenever any of the "uses" variables are updated, we send
    // the update to the worker.
    for (const key of spec.inputNames) {
      this.space.derived(() => {
        const value = this.inputs[key as keyof I](); // Note signal dependency.
        const message: SetSignalValueMessage = {
          kind: LabMessageKind.SetSignalValue,
          signalId: key as keyof I & string,
          value,
        };
        this.worker.postMessage(message);
      });
    }
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
    options?: { keepSignalPushesHereToo: boolean }
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

  public pipeInputStream(signalId: keyof IStream, ports: MessagePort[]) {
    const message: LabMessage = {
      kind: LabMessageKind.PipeInputStream,
      streamId: signalId as string,
      ports,
    };
    // Note: ports are transferred to the worker.
    this.worker.postMessage(message, ports);
  }
  public pipeOutputStream(
    signalId: keyof OStream,
    ports: MessagePort[],
    options?: { keepSignalPushesHereToo: boolean }
  ) {
    const message: LabMessage = {
      kind: LabMessageKind.PipeOutputStream,
      streamId: signalId as string,
      ports,
      options,
    };
    // Note ports are transferred to the worker.
    this.worker.postMessage(message, ports);
  }
  // TODO: add some closing cleanup?
}

type SomeCellStateSpec = CellSpec<ValueStruct, ValueStruct, ValueStruct, ValueStruct>;
type SomeLabEnvCell = LabEnvCell<ValueStruct, ValueStruct, ValueStruct, ValueStruct>;

// TODO: maybe define a special type of serializable
// object that includes things with a toSerialise function?

export class LabEnv {
  space = new SignalSpace();
  // metadata: Map<string, ItemMetaData> = new Map();
  public runningCells: {
    [name: string]: SomeCellStateSpec;
  } = {};
  // cellChannels: {
  //   [port1CellName: string]: {
  //     port2CellName: string;
  //     signalName: string;
  //   };
  // } = {};

  start<
    I extends ValueStruct,
    IStreams extends ValueStruct,
    O extends ValueStruct,
    OStreams extends ValueStruct
  >(
    spec: CellSpec<I, IStreams, O, OStreams>,
    inputs?: AbstractSignalStructFn<I>
  ): LabEnvCell<I, IStreams, O, OStreams> {
    this.runningCells[spec.data.cellName] = spec as SomeCellStateSpec;
    const envCell = new LabEnvCell(this.space, spec, { inputs });
    envCell.onceFinished.then(() => delete this.runningCells[spec.data.cellName]);
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
