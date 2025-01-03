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

import { tf } from 'src/lib';
import { SerializedGTensor, GTensor } from 'src/lib/gtensor/gtensor';
import { LabState } from './unused-lab-state';

export type Name = string;
export type TensorValue = {
  t: SerializedGTensor<'a'>;
  v: number;
} | null;

// if (!localStorage) {
//   let store: { [key: string]: string } = {};
//   const mockLocalStorage = {
//     getItem: (key: string): string | null => {
//       return key in store ? store[key] : null;
//     },
//     setItem: (key: string, value: string) => {
//       store[key] = `${value}`;
//     },
//     removeItem: (key: string) => {
//       delete store[key];
//     },
//     clear: () => {
//       store = {};
//     },
//   };
//   localStorage = mockLocalStorage;
// }

describe('lab-state', () => {
  beforeEach(async () => {});

  it('simple lab state saving and loading', async () => {
    localStorage.clear();
    const t = new GTensor(tf.tensor([1, 2, 3]), ['foo']);
    const state = new LabState();
    const x = await state.loadValue('foo');
    expect(x).toBeNull();
    state.saveValue('foo', t);
    const foo = await state.loadValue<typeof t>('foo');
    expect(foo!.data.tensor.arraySync()).toEqual(t.tensor.arraySync());
  });
});
