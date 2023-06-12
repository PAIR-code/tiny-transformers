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
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 *
 * This file was branched from
 * https://github.com/tensorflow/tfjs-examples/blob/master/mnist-node/
 * to demostrate Tensorflow in tslab.
 */
 import * as tf from "@tensorflow/tfjs";
 /** Helper class to handle loading training and test data. */
 declare class MnistDataset {
     private dataset;
     private trainSize;
     private testSize;
     private trainBatchIndex;
     private testBatchIndex;
     constructor();
     /** Loads training and test data. */
     loadData(): Promise<void>;
     getTrainData(): {
         images: tf.Tensor4D;
         labels: tf.Tensor<tf.Rank>;
     };
     getTestData(): {
         images: tf.Tensor4D;
         labels: tf.Tensor<tf.Rank>;
     };
     getData_(isTrainingData: boolean): {
         images: tf.Tensor4D;
         labels: tf.Tensor<tf.Rank>;
     };
 }
 export declare const dataset: MnistDataset;
 export {};
