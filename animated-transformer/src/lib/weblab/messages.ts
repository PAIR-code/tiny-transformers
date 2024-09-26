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
      kind: 'setSignal';
      signalId: string;
      signalValue: unknown;
    }
  | {
      kind: 'providingInputStreamEntry';
      signalId: string;
      inputData: unknown;
    };
