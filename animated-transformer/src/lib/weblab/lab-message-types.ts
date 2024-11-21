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
export enum LabMessageKind {
  ConjestionControl = 'ConjestionIndex',
  RequestInput = 'RequestInput',
  AddStreamValue = 'AddStreamValue',
  SetSignalValue = 'SetSignalValue',
  Finished = 'Finished',
  FinishRequest = 'FinishRequest',
  PipeInputSignal = 'PipeInputSignal',
  PipeOutputSignal = 'PipeOutputSignal',
  PipeInputStream = 'PipeInputStream',
  PipeOutputStream = 'PipeOutputStream',
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
export type StreamValue<T> = { idx: number; value: T } | null;

export type AddStreamValueMessage = {
  kind: LabMessageKind.AddStreamValue;
  // The name of the signal stream having its next value set.
  streamId: string;
  // A unique incremental number indicating the sent-stream value.
  value: StreamValue<unknown>;
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
  options?: { keepSignalPushesHereToo: boolean };
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
  options?: { keepSignalPushesHereToo: boolean };
};

// ----------------------------------------------------------------------------
export type LabMessage =
  | SetSignalValueMessage
  | AddStreamValueMessage
  | ConjestionFeedbackMessage
  | { kind: LabMessageKind.FinishRequest }
  | { kind: LabMessageKind.Finished }
  | PipeInputStreamMessage
  | PipeOutputStreamMessage
  | PipeInputSignalMessage
  | PipeOutputSignalMessage;
