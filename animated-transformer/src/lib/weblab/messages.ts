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

export type FromWorkerMessage =
  | {
      kind: 'requestInput';
      signalId: string;
    }
  | {
      kind: 'setSignal';
      signalId: string;
      signalValue: unknown;
    }
  | {
      kind: 'finished';
    };

export enum ConjestionFeedbackMessageKind {
  ConjestionIndex,
}

// Used to send feedback to a port that is sending stuff on which example was
// last processed, so that internal queues don't explode.
export type ConjestionFeedbackMessage = {
  kind: ConjestionFeedbackMessageKind;
  idx: number;
};

export type StreamValue<T> = { idx: number; value: T };

export type ToWorkerMessage =
  | {
      kind: 'finishRequest';
    }
  | {
      kind: 'pipeInputSignal';
      signalId: string;
      port: MessagePort;
    }
  | {
      kind: 'pipeOutputSignal';
      signalId: string;
      // TODO: add 'push values' option for the port.
      port: MessagePort;
      // false; Approx = transfer signal, true = add a new signal target.
      options?: { keepSignalPushesHereToo: boolean };
    }
  | {
      kind: 'conjestionState';
      // The name of an output of the worker that
      outputSignalId: string;
      // A number representing the index of the last consumed value from the
      // worker for the worker's outputSignalId output.
      stateIdx: number;
    }
  | {
      kind: 'setSignal';
      // The name of the signal being set.
      signalId: string;
      // The value to set that signal to have.
      signalValue: unknown;
    }
  | {
      kind: 'setStream';
      // The name of the signal stream having its next value set.
      streamId: string;
      // A unique incremental number indicating the sent-stream value.
      value: StreamValue<unknown>;
    }
  | {
      kind: 'providingInputStreamEntry';
      signalId: string;
      inputData: unknown;
    };
