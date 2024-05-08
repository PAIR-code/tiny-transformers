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

/*
Bundle lib/ into a single file:

  npx esbuild index.ts --bundle --sourcemap --outfile=lib.js
*/

import * as tf from '@tensorflow/tfjs';
import * as gtensor from './gtensor/gtensor';
import * as transformer from './transformer/transformer_gtensor';
import * as param_map from './gtensor/gtensor_tree';

import { embed } from './tokens/token_gemb';
import { gtensorTrees } from './gtensor/gtensor_tree';

import * as abtask from './seqtasks/ab_task';
const seqtaks = { abtask };

export { tf, gtensor, transformer, embed, param_map, gtensorTrees, seqtaks };
