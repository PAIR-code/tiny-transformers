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

export interface BasicWorker {
  set onmessage(m: ((ev: MessageEvent) => any) | null);
  postMessage(message: any, transfer?: Transferable[]): void;
  terminate(): void;
}

export class LoggingMessagesWorker implements BasicWorker {
  constructor(
    public worker: Worker,
    public localCellId: string,
    public remoteCellId: string,
  ) {}

  set onmessage(m: ((ev: MessageEvent) => any) | null) {
    if (m === null) {
      this.worker.onmessage = null;
    } else {
      this.worker.onmessage = (ev: MessageEvent) => {
        console.log(`from ${this.remoteCellId} to ${this.localCellId}: `, ev);
        m(ev);
      };
    }
  }

  postMessage(message: any, transfer?: Transferable[]) {
    console.log(`from ${this.localCellId} to ${this.remoteCellId}: `, message);
    this.worker.postMessage(message, transfer || []);
  }

  terminate() {
    this.worker.terminate();
  }
}
