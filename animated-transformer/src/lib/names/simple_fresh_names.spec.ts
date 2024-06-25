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
/**
 * A simple library for creating fresh names.
 */

import { FreshNames } from './simple_fresh_names';

describe('simple_fresh_names', () => {
  it('FreshNames', () => {
    const names = new FreshNames();
    names.addNames(['_a', '_b', '_d']);
    const firstNextName = names.makeAndAddNextName();
    const secondNextName = names.makeAndAddNextName();
    const thirdNextName = names.makeAndAddNextName({
      prefix: '?',
      postfix: 'Bar',
    });
    expect(firstNextName).toEqual('_c');
    expect(secondNextName).toEqual('_e');
    expect(thirdNextName).toEqual('?eBar');
  });
});
