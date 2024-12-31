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

// ----------------------------------------------------------------------------
// Messages sent between cells and environments.
export enum LabMessageKind {
  // Sent from env to cell to tell is to start & give it it's id.
  StartCellRun = 'StartCellRun',
  // Sent from cell to env to tell it that it has started with all inputs.
  // TODO: think about required vs lazy inputs...
  ReceivedAllInputsAndStarting = 'ReceivedAllInputsAndStarting',
  // From env or cell to env to cell, when adding a value to a stream send end.
  AddStreamValue = 'AddStreamValue',
  // From env or cell to env to cell, when ending a stream.
  EndStream = 'EndStream',
  // From env or cell to env to cell, when setting a value via a signal send
  // end.
  SetSignalValue = 'SetSignalValue',
  // From env to cell to tell it to listen to inputs from new source signal.
  AddInputRemote = 'PipeInputSignal',
  // From env to cell to tell it to send outputs to a new source signal.
  AddOutputRemote = 'PipeOutputSignal',
  // From env to cell to tell it to listen to instream from new source.
  AddInStreamRemote = 'PipeInputStream',
  // From env to cell to tell it to send to a new output stream.
  AddOutStreamRemote = 'PipeOutputStream',
  // From a receive end of a stream to tell the sender it has received stuff.
  ConjestionControl = 'ConjestionControl',
  // From Env to cell to tell it to finish.
  FinishRequest = 'FinishRequest',
  // From Cell to env to tell it that it has finished.
  Finished = 'Finished',
}

// Used to send feedback to a port that is sending stuff on which example was
// last processed, so that internal queues don't explode.
export type ConjestionFeedbackMessage = {
  kind: LabMessageKind.ConjestionControl;
  idx: number;
  streamId: string;
};

// null Indicates the end of the stream;
// TODO: consider a "pause value".
export type StreamValue<T> = { idx: number; value: T };

export type AddStreamValueMessage = {
  kind: LabMessageKind.AddStreamValue;
  // The name of the signal stream having its next value set.
  streamId: string;
  // A unique incremental number indicating the sent-stream value.
  value: StreamValue<unknown>;
};

export type EndStreamMessage = {
  kind: LabMessageKind.EndStream;
  // The name of the signal stream having its next value set.
  streamId: string;
};

export type SetSignalValueMessage = {
  kind: LabMessageKind.SetSignalValue;
  // The name of the signal stream having its next value set.
  signalId: string;
  // A unique incremental number indicating the sent-stream value.
  value: unknown;
};

export enum RemoteKind {
  MessagePort = 'MessagePort',
}

export type Remote = {
  kind: RemoteKind.MessagePort;
  messagePort: MessagePort;
  // The message port above uniquely identifies, sends messages to, and gets
  // messages from, this remoteCellId, on the specified remoteChannelId.
  remoteCellId: string;
  // A channel can be a stream of a signal.
  remoteChannelId: string;
};

export type AddInputRemoteMessage = {
  kind: LabMessageKind.AddInputRemote;
  recipientSignalId: string;
  // Remote w.r.t. the reciever of the message: this is the target of the
  // intended piping.
  remoteSignal: Remote;
  // remoteCellId: string;
  // signalId: string;
  // ports: MessagePort[];
};

export type AddOutputRemoteMessage = {
  kind: LabMessageKind.AddOutputRemote;
  recipientSignalId: string;
  // Remote w.r.t. the reciever of the message: this is the target of the
  // intended piping.
  remoteSignal: Remote;
  // remoteCellId: string;
  // signalId: string;
  // // TODO: add 'push values' option for the port.
  // ports: MessagePort[];
  // false; Approx = transfer signal, true = add a new signal target.
  options?: { keepHereToo: boolean };
};

export type AddInStreamRemoteMessage = {
  kind: LabMessageKind.AddInStreamRemote;
  recipientStreamId: string;
  // Remote w.r.t. the reciever of the message: this is the target of the
  // intended piping.
  remoteStream: Remote;
  // remoteCellId: string;
  // streamId: string;
  // ports: MessagePort[];
};

export type AddOutStreamRemoteMessage = {
  kind: LabMessageKind.AddOutStreamRemote;
  recipientStreamId: string;
  remoteStream: Remote;

  // remoteCellId: string;
  // streamId: string;
  // // TODO: add 'push values' option for the port.
  // ports: MessagePort[];
  // false; Approx = transfer signal, true = add a new signal target.
  // options?: { keepHereToo: boolean };
};

// ----------------------------------------------------------------------------
export type LabMessage =
  | { kind: LabMessageKind.StartCellRun; id: string }
  | { kind: LabMessageKind.ReceivedAllInputsAndStarting }
  | SetSignalValueMessage
  | AddStreamValueMessage
  | ConjestionFeedbackMessage
  | EndStreamMessage
  // CONSIDER: add some RemoveRemotes also?
  | AddInStreamRemoteMessage
  | AddOutStreamRemoteMessage
  | AddInputRemoteMessage
  | AddOutputRemoteMessage
  | { kind: LabMessageKind.FinishRequest }
  | { kind: LabMessageKind.Finished };
