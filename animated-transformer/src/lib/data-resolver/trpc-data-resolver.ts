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

import { CreateTRPCClient, createTRPCClient, httpBatchLink } from '@trpc/client';
import type { ExperimentServerRouter } from 'experiment-server/server';
import { AbstractDataResolver } from 'src/lib/data-resolver/data-resolver';
import { JsonValue } from 'src/lib/json/json';
import json5 from 'json5';
import { stringifyJsonValue } from 'src/lib/json/pretty_json';

export class tRpcDataResolver implements AbstractDataResolver<JsonValue> {
  trpc: CreateTRPCClient<ExperimentServerRouter>;

  constructor(url = 'http://localhost:9000') {
    this.trpc = createTRPCClient<ExperimentServerRouter>({
      links: [httpBatchLink({ url })],
    });
  }

  async loadArrayBuffer(path: string[]): Promise<ArrayBuffer> {
    const arr: Uint8Array = await this.trpc.loadArray.query(path);
    return arr.buffer as ArrayBuffer;
  }

  async load(path: string): Promise<JsonValue> {
    const str: string = await this.trpc.loadStr.query(path);
    return json5.parse(str);
  }
  async save(path: string, data: JsonValue): Promise<void> {
    const str = stringifyJsonValue(data, { arrWrapAt: 100, objWrapAt: 100, quoteAllKeys: true });
    await this.trpc.saveStr.mutate({ path, str });
  }
}
