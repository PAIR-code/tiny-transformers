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

// Messages sent between cells and environments.

// ----------------------------------------------------------------------------
export enum RemoteKind {
  MessagePort = 'MessagePort',
}

// CONSIDER: Subtype of MessagePort? (to provide more typing for message kinds?)
// export type RemoteMessagePort {
//
// }

export type Remote = {
  kind: RemoteKind.MessagePort;
  messagePort: MessagePort;
  // The message port above uniquely identifies, sends messages to, and gets
  // messages from, this remoteCellId, on the specified remoteChannelId.
  remoteCellId: string;
  // A channel can be a stream of a signal.
  remoteChannelId: string;
};

// ----------------------------------------------------------------------------
export enum CellMessageKind {
  // Sent from env to cell to tell is to start & give it it's id.
  StartCellRun = 'StartCellRun',
  // Sent from cell to env to tell it that it has started with all inputs.
  // TODO: think about required vs lazy inputs...
  ReceivedAllInputsAndStarting = 'ReceivedAllInputsAndStarting',

  // From env to cell to tell it to listen to inputs from new source signal.
  AddInputRemote = 'AddInputRemote',
  // From env to cell to tell it to send outputs to a new source signal.
  AddOutputRemote = 'AddOutputRemote',
  // From env to cell to tell it to listen to instream from new source.
  AddInStreamRemote = 'AddInStreamRemote',
  // From env to cell to tell it to send to a new output stream.
  AddOutStreamRemote = 'AddOutStreamRemote',

  // From Env to cell to tell it to finish.
  FinishRequest = 'FinishRequest',
  // From Cell to env to tell it that it has finished.
  Finished = 'Finished',
}

export type EditRemoteMessageKind =
  | CellMessageKind.AddInputRemote
  | CellMessageKind.AddOutputRemote
  | CellMessageKind.AddInStreamRemote
  | CellMessageKind.AddOutStreamRemote;

export type EditRemotesMessage = {
  kind: EditRemoteMessageKind;
  recipientChannelId: string;
  // Remote w.r.t. the reciever of the message: this is the target of the
  // intended piping.
  remote: Remote;
};

export type CellMessage =
  | { kind: CellMessageKind.StartCellRun; id: string }
  | { kind: CellMessageKind.ReceivedAllInputsAndStarting }
  | EditRemotesMessage
  | { kind: CellMessageKind.FinishRequest }
  | { kind: CellMessageKind.Finished };
