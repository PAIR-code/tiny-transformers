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

/**
 * A set of class wrappers for channels that can be connected many remote points
 * at both ends (hyper-edges).
 */
import { AbstractSignal, SignalSpace } from '../signalspace/signalspace';
import { AsyncIterOnEvents } from './async-iter-on-events';
import {
  SignalReceiverFanIn,
  SignalSenderFanOut,
  StreamReceiverFanIn,
  StreamSenderFanOut,
} from './channel-fans';
import {
  CellMessage,
  CellMessageKind,
  EditRemoteMessageKind,
  Remote,
  RemoteKind,
} from './lab-message-types';

// ----------------------------------------------------------------------------

export type SignalSender<T> = {
  set(x: T): void;
  lastValue?: T;
};

export type StreamSender<T> = {
  send(x: T): Promise<void>;
  done(): void;
};

export type SignalReceiver<T> = Promise<AbstractSignal<T>>;

export type StreamReceiver<T> = AsyncIterable<T> &
  AsyncIterator<T> & {
    inputIter: AsyncIterOnEvents<T>;
  };

// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------
export abstract class CellChannelEnd {
  abstract space: SignalSpace;
  abstract cellId: string;
  abstract channelId: string;
  abstract remotes: Iterable<Remote>;
  abstract remoteConnection?: Remote;
  abstract cellPostFn: (message: CellMessage, transerables?: Transferable[]) => void;

  initRemote(kind: EditRemoteMessageKind): Remote {
    const channel = new MessageChannel();
    const message: CellMessage = {
      kind,
      recipientChannelId: this.channelId as string,
      remote: {
        kind: RemoteKind.MessagePort,
        remoteCellId: this.cellId + ':controller',
        remoteChannelId: this.channelId as string,
        messagePort: channel.port1,
      },
    };
    this.cellPostFn(message, [channel.port1]);

    const localRemoteForEnd = {
      kind: RemoteKind.MessagePort,
      remoteCellId: this.cellId + ':worker',
      remoteChannelId: this.channelId as string,
      messagePort: channel.port2,
    };
    return localRemoteForEnd;
  }
}

// Pipe everywhere that sends to recEnd, to now send to everywhere that this
// send end sends to.
function pipeFrom(recEnd: CellChannelEnd, sendEnd: CellChannelEnd): void {
  for (const remoteSender of recEnd.remotes) {
    for (const remoteReceiver of sendEnd.remotes) {
      const channel = new MessageChannel();
      const remoteSenderMessage: CellMessage = {
        kind: CellMessageKind.AddOutputRemote,
        recipientChannelId: remoteSender.remoteChannelId,
        remote: {
          kind: RemoteKind.MessagePort,
          remoteCellId: remoteReceiver.remoteCellId,
          remoteChannelId: remoteReceiver.remoteChannelId,
          messagePort: channel.port1,
        },
      };
      recEnd.cellPostFn(remoteSenderMessage, [channel.port1]);

      const remoteReceiverMessage: CellMessage = {
        kind: CellMessageKind.AddInputRemote,
        recipientChannelId: remoteReceiver.remoteChannelId,
        remote: {
          kind: RemoteKind.MessagePort,
          remoteCellId: remoteSender.remoteCellId,
          remoteChannelId: remoteSender.remoteChannelId,
          messagePort: channel.port2,
        },
      };
      sendEnd.cellPostFn(remoteReceiverMessage, [channel.port2]);
    }
  }
}

// ----------------------------------------------------------------------------
export class SignalReceiveChannel<T> extends CellChannelEnd {
  public remotes: Iterable<Remote>;
  public recEnd: SignalReceiverFanIn<T>;
  public remoteConnection?: Remote;

  constructor(
    public space: SignalSpace,
    public cellId: string,
    public channelId: string,
    public cellPostFn: (message: CellMessage, transerables?: Transferable[]) => void,
  ) {
    super();
    this.recEnd = new SignalReceiverFanIn<T>(cellId, space, channelId);
    this.remotes = this.recEnd.remotes;
  }
  pipeTo(sendChannel: SignalSendChannel<T>): void {
    pipeFrom(this, sendChannel);
  }

  connect(): SignalReceiver<T> {
    this.remoteConnection = this.initRemote(CellMessageKind.AddOutputRemote);
    this.recEnd.addRemote(this.remoteConnection);

    this.initRemote(CellMessageKind.AddInputRemote);
    return this.recEnd.onceReady;
  }

  disconnect(): void {
    if (this.remoteConnection) {
      this.recEnd.removeRemote(this.remoteConnection);
    }
  }
}

export class SignalSendChannel<T> extends CellChannelEnd {
  public remotes: Iterable<Remote>;
  public sendEnd: SignalSenderFanOut<T>;
  public remoteConnection?: Remote;

  constructor(
    public space: SignalSpace,
    public cellId: string,
    public channelId: string,
    public cellPostFn: (message: CellMessage, transerables?: Transferable[]) => void,
  ) {
    super();
    this.sendEnd = new SignalSenderFanOut<T>(cellId, space, channelId);
    this.remotes = this.sendEnd.remotes;
  }
  pipeFrom(recChannel: SignalReceiveChannel<T>): void {
    pipeFrom(recChannel, this);
  }

  connect(): SignalSender<T> {
    this.remoteConnection = this.initRemote(CellMessageKind.AddInputRemote);
    this.sendEnd.addRemote(this.remoteConnection);
    return this.sendEnd;
  }

  disconnect(): void {
    if (this.remoteConnection) {
      this.sendEnd.removeRemote(this.remoteConnection);
      delete this.remoteConnection;
    }
  }
}

export class StreamReceiveChannel<T> extends CellChannelEnd {
  public remotes: Iterable<Remote>;
  public recEnd: StreamReceiverFanIn<T>;
  public remoteConnection?: Remote;

  constructor(
    public space: SignalSpace,
    public cellId: string,
    public channelId: string,
    public cellPostFn: (message: CellMessage, transerables?: Transferable[]) => void,
  ) {
    super();
    this.recEnd = new StreamReceiverFanIn<T>(cellId, space, channelId);
    this.remotes = this.recEnd.remotes;
  }

  pipeTo(sendChannel: StreamSendChannel<T>): void {
    pipeFrom(this, sendChannel);
  }

  connect(): StreamReceiver<T> {
    this.remoteConnection = this.initRemote(CellMessageKind.AddOutStreamRemote);
    this.recEnd.addRemote(this.remoteConnection);
    return this.recEnd;
  }

  disconnect(): void {
    if (this.remoteConnection) {
      this.recEnd.removeRemote(this.remoteConnection);
      delete this.remoteConnection;
    }
  }
}

export class StreamSendChannel<T> extends CellChannelEnd {
  public remotes: Iterable<Remote>;
  public sendEnd: StreamSenderFanOut<T>;
  public remoteConnection?: Remote;

  constructor(
    public space: SignalSpace,
    public cellId: string,
    public channelId: string,
    public cellPostFn: (message: CellMessage, transerables?: Transferable[]) => void,
  ) {
    super();
    this.sendEnd = new StreamSenderFanOut<T>(cellId, space, channelId);
    this.remotes = this.sendEnd.remotes;
  }
  pipeFrom(recChannel: StreamReceiveChannel<T>): void {
    pipeFrom(recChannel, this);
  }

  connect(): StreamSender<T> {
    this.remoteConnection = this.initRemote(CellMessageKind.AddInStreamRemote);
    this.sendEnd.addRemote(this.remoteConnection);
    return this.sendEnd;
  }

  disconnect(): void {
    if (this.remoteConnection) {
      this.sendEnd.removeRemote(this.remoteConnection);
      delete this.remoteConnection;
    }
  }
}
