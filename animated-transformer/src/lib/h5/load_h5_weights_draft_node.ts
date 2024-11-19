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


// const h5wasm = await import("h5wasm");
// await h5wasm.ready;
import {File} from 'h5wasm';
import * as tf from '@tensorflow/tfjs';

// this below fails, because it can't import stuff inside the library:
// let f = new File("/Users/afm/Downloads/sans59510.nxs.ngv", "w");
console.log("ran this?")
console.log(tf.cos(0.05))

// export { };
/*
File {
  path: '/',
  file_id: 72057594037927936n,
  filename: '/home/brian/Downloads/sans59510.nxs.ngv',
  mode: 'r'
} 
*/