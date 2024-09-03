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

/// <reference lib="webworker" />

import * as tf from '@tensorflow/tfjs';
import {
  BasicTaskTokenRep,
  singleNextTokenIdxOutputPrepFn,
  strSeqPrepFn,
} from 'src/lib/tokens/token_gemb';
import * as lab from '../../../lib/weblab/lab-cell';
import { trainerCell } from './ailab';
import {
  computeDecoder,
  TransformerComputation,
  TransformerConfig,
  transformerLastTokenCrossEntropyLoss,
  TransformerParams,
} from 'src/lib/transformer/transformer_gtensor';

function computeLoss(
  batchId: number,
  batchInput: string[][],
  batchOutput: string[][],
  tokenRep: BasicTaskTokenRep,
  transformerConfig: TransformerConfig,
  decoderParamsTree: TransformerParams
): tf.Scalar {
  const computation: TransformerComputation = computeDecoder(
    tokenRep,
    strSeqPrepFn,
    transformerConfig.spec,
    decoderParamsTree,
    batchInput
  );
  const singleNextTokenIdx = singleNextTokenIdxOutputPrepFn(tokenRep, batchOutput);
  const entropyLoss: tf.Scalar = transformerLastTokenCrossEntropyLoss(
    computation,
    decoderParamsTree.tokenEmbedding,
    singleNextTokenIdx
  );
  if (batchId % printEveryNBatches === 0) {
    const accuracy: tf.Scalar = transformerAccuracy(
      computation,
      decoderParamsTree.tokenEmbedding,
      singleNextTokenIdx
    );
    console.log(
      `batch: ${batchId} `.padEnd(15) +
        ('entropyLoss: ' + entropyLoss.arraySync().toFixed(8)).padEnd(25) +
        ('accuracy: ' + accuracy.arraySync().toFixed(8)).padEnd(25)
    );
  }
  return entropyLoss;
}

const cell = new lab.FuncCell(trainerCell);
cell.func((inputs) => {
  const toyOutput = `webworker got input! ${inputs.toyInput}`;

  // TODO: consider using the packr for transfers too...
  return {
    toyOutputStr: toyOutput,
    toyOutputNumber: 3,
  };
});
