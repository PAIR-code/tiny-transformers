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
 * Common transformer functions.
 */
import { oneHot } from '@tensorflow/tfjs';
import * as tf from '@tensorflow/tfjs';
import {
    GTensor,
    makeTriangularMatrix,
} from '../gtensor/gtensor';

export type BatchAttnHeadComputation = {
    seqInput: GTensor<'batch' | 'pos' | 'inputRep'>;
    keys: GTensor<'batch' | 'heads' | 'pos' | 'kq'>;
    queries: GTensor<'batch' | 'heads' | 'pos' | 'kq'>;
    attention: GTensor<'batch' | 'heads' | 'keyPos' | 'queryPos'>;
    values: GTensor<'batch' | 'heads' | 'pos' | 'value'>;
    attendedValues: GTensor<'batch' | 'heads' | 'pos' | 'value'>;
    inputToFF: GTensor<'batch' | 'pos' | 'inputRep'>;
    seqOutput: GTensor<'batch' | 'pos' | 'inputRep'>;
};

export type TransformerComputation = {
    layers: BatchAttnHeadComputation[];
};

export function causalMask(
    qk: GTensor<'batch' | 'heads' | 'keyPos' | 'queryPos'>,
): GTensor<'batch' | 'heads' | 'keyPos' | 'queryPos'> {
    const triangularMatrix = makeTriangularMatrix(
        qk.dim['queryPos'].size,
        'keyPos',
        'queryPos',
        0,
        -Infinity,
    ).broadcastToCombinedShape(qk);
    return qk.pointwiseAdd(triangularMatrix).softmax('queryPos');
}

/** Batch compute the loss for the last token of a transformer.
 *
 * params: transformer parameters.
 * tokenEmb: embeddings for all tokens.
 * targetTokenIdxs: a one-hot token vector for the correct token.
 */
export function lastTokenLogits(
    model: {
        params: { tokenEmbedding: GTensor<'tokenId' | 'inputRep'> };
    },
    computation: TransformerComputation,
): GTensor<'batch' | 'tokenId'> {
    const lastLayer = computation.layers[computation.layers.length - 1];
    const positionParams = lastLayer.seqOutput.unstack('pos');
    const lastPosParams = positionParams[positionParams.length - 1];
    const logits = lastPosParams.contract(model.params.tokenEmbedding, ['inputRep']);
    return logits;
}

/**
 * Returns the average per example loss for the last token prediction.
 */
export function lastTokenCrossEntropyLoss(
    model: {
        params: { tokenEmbedding: GTensor<'tokenId' | 'inputRep'> };
    },
    computation: TransformerComputation,
    targetTokenIdxs: GTensor<'batch'>,
): tf.Scalar {
    const logits = lastTokenLogits(model, computation);
    const logProbs = logits.softmax('tokenId').log();
    const nTokens = model.params.tokenEmbedding.dim.tokenId.size;
    const oneHotToken = new GTensor(oneHot(targetTokenIdxs.tensor, nTokens), ['batch', 'tokenId']);
    const crossEntopy = logProbs.pointwiseMul(oneHotToken);
    return (
        crossEntopy
            .sumOverDims(['batch', 'tokenId'])
            // ._tfScalarMul(tf.scalar(-1))
            ._tfScalarDiv(tf.scalar(targetTokenIdxs.dim.batch.size * -1)).tensor as tf.Scalar
    );
}

/** Batch compute the top prediction from the last token of a transformer.
 *
 * params: transformer parameters.
 * tokenEmb: embeddings for all tokens.
 * targetTokenIdxs: a one-hot token vector for the correct token.
 */
export function transformerTopPrediction(
    model: {
        params: { tokenEmbedding: GTensor<'tokenId' | 'inputRep'> };
    },
    computation: TransformerComputation
): GTensor<'batch'> {
    const dotProd = lastTokenLogits(model, computation);
    return dotProd.argMax('tokenId');
}

export function transformerAccuracy(
    model: {
        params: { tokenEmbedding: GTensor<'tokenId' | 'inputRep'> };
    },
    computation: TransformerComputation,
    targetTokenIdxs: GTensor<'batch'>
): tf.Scalar {
    const predictions = transformerTopPrediction(model, computation);
    return predictions
        .pointwiseEqual(targetTokenIdxs)
        .sumOverDims(['batch'])
        .tensor.div(tf.scalar(targetTokenIdxs.dim.batch.size));
}

/**
 * Compute the logits for all the past tokens of a transformer
 */
export function allPastTokensLogits(
    model: {
        params: { tokenEmbedding: GTensor<'tokenId' | 'inputRep'> };
    },
    computation: TransformerComputation,
): GTensor<'batch' | 'pos' | 'tokenId'> {
    const lastLayer = computation.layers[computation.layers.length - 1];
    const logits = lastLayer.seqOutput.contract(model.params.tokenEmbedding, ['inputRep']);
    return logits;
}

/**
 * Returns the Softmax Cross Entropy Loss between the logits and the oneHotEncoded targets
 * Batch compute the loss for all the past tokens of a transformer.
 */
export function allPastTokensCrossEntropyLoss(
    model: {
        params: { tokenEmbedding: GTensor<'tokenId' | 'inputRep'> };
    },
    computation: TransformerComputation,
    oneHotToken: GTensor<'batch' | 'pos' | 'tokenId'>,
): tf.Scalar {
    const logits = allPastTokensLogits(model, computation);
    const crossEntropyLoss = logits.softmaxCrossEntropy(oneHotToken);
    return crossEntropyLoss.tensor.asScalar();
}

/**
 * Returns Softmax Cross Entropy Loss with integer labels instead of requiring one hot encoded targets.
 */
export function allPastTokensCrossEntropyLossWithIntegerLabels(
    model: {
        params: { tokenEmbedding: GTensor<'tokenId' | 'inputRep'> };
    },
    computation: TransformerComputation,
    labels: GTensor<'batch' | 'pos'>,
): tf.Scalar {
    // A workaround is needed in this function:
    //  - the gradient on the gather function from tfjs does not work
    //    if there are more than 1 batch dimension. This means that we need
    //    to merge the batch dimensions and then split them back.
    const logits = allPastTokensLogits(model, computation);
    const crossEntropyLoss = logits.mergeDims(['batch', 'pos'], 'new_batch').softmaxCrossEntropyWithIntegerLabels(
        labels.mergeDims(['batch', 'pos'], 'new_batch'), 'tokenId');
    return crossEntropyLoss.sumOverDims(crossEntropyLoss.dimNames).tensor.asScalar();
}

export function computeMaxInputLength(
    posEncodingSeqLength: number,
    inputs: string[][] | number[][]
) {
    const maxInputLength = inputs.reduce(
        (max, curInput) => (max >= curInput.length ? max : curInput.length),
        0,
    );
    const inputLength = Math.max(posEncodingSeqLength, maxInputLength);
    return inputLength;
}

