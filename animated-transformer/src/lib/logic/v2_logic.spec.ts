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
import { FreshNames } from '../names/simple_fresh_names';
import { TypeConstructor, createTypeContext } from './v2_logic';

describe('v2_logic of peano natural numbers', () => {
  beforeEach(() => {});

  it('simple construction', () => {
    const suc: TypeConstructor = {
      constructorName: 'suc',
      createdTypeName: 'nat',
      arguments: { num: 'nat' },
    };
    const zero: TypeConstructor = {
      constructorName: '0',
      createdTypeName: 'nat',
      arguments: {},
    };

    const ctxt = createTypeContext([suc, zero]);

    expect(ctxt).toEqual({
      types: {
        nat: {
          constructors: {
            suc: suc,
            zero: zero,
          },
        },
      },
    });
  });
});
