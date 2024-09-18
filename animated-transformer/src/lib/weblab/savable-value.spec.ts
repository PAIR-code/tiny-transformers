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

import { SignalSpace } from './signalspace';
import { WritableSValue } from './savable-value';
import { GTensor } from '../gtensor/gtensor';
import {
  initDecoderParams,
  savableTransformerParamsKind,
  transformerModelKind,
} from '../transformer/transformer_gtensor';

// type MaybeReturn<T, F> = undefined extends F ? void : T;
type MaybeReturn<T> = void extends T ? void : T;

describe('signalspace-value', () => {
  async function waitTick<T>(f?: () => T): Promise<MaybeReturn<T>> {
    return new Promise<T | void>((resolve) => {
      setTimeout(() => {
        if (f) {
          resolve(f());
        } else {
          resolve();
        }
      }, 0);
    }) as Promise<MaybeReturn<T>>;
  }

  it('Simple signal compute', () => {
    const s = new SignalSpace();
    const { writable, computed, effect } = s;

    const configS = writable(transformerModelKind.defaultConfig);

    effect(() => {
      const config = configS();

      initDecoderParams(config);
    });

    const paramsS = writable(initDecoderParams(transformerModelKind.defaultConfig));
    const paramsV = new WritableSValue(savableTransformerParamsKind, paramsS);

    expect(paramsV).toEqual(paramsV);
  });
});
