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

export enum FromClientMessageKind {
  Connect = 'Connect',
  StartWatchingFile = 'StartWatchingFile',
  StopWatchingFile = 'StopWatchingFile',
  Diconnect = 'Diconnect',
}

export type FromClientMessage =
  | {
      kind: FromClientMessageKind.Connect;
      clientId: string;
    }
  | {
      kind: FromClientMessageKind.Diconnect;
    }
  | {
      path: string;
      kind: FromClientMessageKind.StopWatchingFile | FromClientMessageKind.StartWatchingFile;
    };

export enum FromWatcherMessageKind {
  ErrorReadingFile = 'ErrorReadingFile',
  SendingFileContentsStart = 'SendingFileContents',
  SendingFileContentsEnd = 'SendingFileContentsEnd',
}
export type FromWatcherMessage =
  | {
      kind: FromWatcherMessageKind.SendingFileContentsStart;
      path: string;
      size: number; // in KB.
    }
  | {
      kind: FromWatcherMessageKind.ErrorReadingFile;
      path: string;
      error: string;
    }
  | {
      kind: FromWatcherMessageKind.SendingFileContentsEnd;
      path: string;
    };
