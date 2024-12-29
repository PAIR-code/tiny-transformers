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
  // Initial message sending the worker it's ID for logging.
  InitIdMessage = 'InitIdMessage',
  // Sent from env to cell to tell is to start.
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
  PipeInputSignal = 'PipeInputSignal',
  // From env to cell to tell it to send outputs to a new source signal.
  PipeOutputSignal = 'PipeOutputSignal',
  // From env to cell to tell it to listen to instream from new source.
  PipeInputStream = 'PipeInputStream',
  // From env to cell to tell it to send to a new output stream.
  PipeOutputStream = 'PipeOutputStream',
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

export type PipeInputSignalMessage = {
  kind: LabMessageKind.PipeInputSignal;
  signalId: string;
  ports: MessagePort[];
};

export type PipeOutputSignalMessage = {
  kind: LabMessageKind.PipeOutputSignal;
  signalId: string;
  // TODO: add 'push values' option for the port.
  ports: MessagePort[];
  // false; Approx = transfer signal, true = add a new signal target.
  options?: { keepHereToo: boolean };
};

export type PipeInputStreamMessage = {
  kind: LabMessageKind.PipeInputStream;
  streamId: string;
  ports: MessagePort[];
};

export type PipeOutputStreamMessage = {
  kind: LabMessageKind.PipeOutputStream;
  streamId: string;
  // TODO: add 'push values' option for the port.
  ports: MessagePort[];
  // false; Approx = transfer signal, true = add a new signal target.
  options?: { keepHereToo: boolean };
};

// ----------------------------------------------------------------------------
export type LabMessage =
  | { kind: LabMessageKind.InitIdMessage; id: string }
  | { kind: LabMessageKind.StartCellRun }
  | { kind: LabMessageKind.ReceivedAllInputsAndStarting }
  | SetSignalValueMessage
  | AddStreamValueMessage
  | ConjestionFeedbackMessage
  | EndStreamMessage
  | PipeInputStreamMessage
  | PipeOutputStreamMessage
  | PipeInputSignalMessage
  | PipeOutputSignalMessage
  | { kind: LabMessageKind.FinishRequest }
  | { kind: LabMessageKind.Finished };
