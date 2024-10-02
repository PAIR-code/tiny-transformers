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

import {
    GTensor,
  } from '../gtensor/gtensor';

  import {dropout as tf_dropout} from '@tensorflow/tfjs';
  
  // Wrapper for tf ts dropout.
  export function dropout<G extends string, D extends G>(
    dropoutRate: number,
    g: GTensor<G>,
    seed?: number,
    dimNames?: string[],
  ): GTensor<G> {
    if (dropoutRate = 0) {
      return g;
    }

    let dimensions: number[] = g.tensor.shape;
    if (dimNames) {
      dimensions = [];
      for (const d of g.dimNames) {
        if (dimNames.includes(d)) {
          dimensions = dimensions.concat(g.dim[d].size);
        }
        else {
          dimensions = dimensions.concat(1);
        }
      }
    }
    return new GTensor(tf_dropout(g.tensor, dropoutRate, dimensions, seed), g.dimNames);
  }
  