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

window.initModel = async function(){

  // Load model weights
  const modelPath = `${sharedUtil.getRoot()}/decision_boundary/${visState.sweepSlug}/${visState.modelSlug}/`

  const weights = await util.getFile(modelPath + 'weights.json')
  const hyper   = await util.getFile(modelPath + 'hyper.json')

  // Copy tied weights to token_unembedding_matrix
  if (!weights.language_model.token_unembedding_matrix){
    weights.language_model.token_unembedding_matrix = weights.language_model.token_embedding_matrix
  }

  // Default new hyperparameters to true
  hyper.has_softmax = hyper.has_softmax === false ? false : true
  hyper.has_residual = hyper.has_residual === false ? false : true

  const embeddingMatrix   = tf.tensor(weights.language_model.token_embedding_matrix)
  const unembeddingMatrix = tf.tensor(weights.language_model.token_unembedding_matrix)
  const keyW    = tf.tensor(weights['transformer/multi_head_attention/key'].w)
  const queryW  = tf.tensor(weights['transformer/multi_head_attention/query'].w)
  const valueW  = tf.tensor(weights['transformer/multi_head_attention/value'].w)
  const linearW = tf.tensor(weights['transformer/multi_head_attention/linear'].w)

  const params = {embeddingMatrix, unembeddingMatrix, keyW, queryW, valueW, linearW}

  // d3.entries(params).forEach(({key, value}) => {
  //   console.log(value.shape[0]*value.shape[1], value.shape, key)
  // })


  // 1-layer attn only transformer forward pass; returns intermediate activations
  function _model(inputs){
    // B: Batch
    // T: Token
    // M: Model size
    // H: Head
    // K: KQV head size
    // W: H*K; the keyW matrix is [M, W]

    // Convert tokens to embedding
    const h = tf.einsum('btv,vm->btm', tf.oneHot(inputs, 103), embeddingMatrix)

    // Project kqv heads and reshape to [B, T, H, K]
    const kqvHeadShape = [inputs.length, hyper.sequence_length, hyper.num_heads, hyper.key_size]
    const keyHeads   = tf.einsum('btm,mw->btw', h, keyW).reshape(kqvHeadShape)
    const queryHeads = tf.einsum('btm,mw->btw', h, queryW).reshape(kqvHeadShape)
    const valueHeads = tf.einsum('btm,mw->btw', h, valueW).reshape(kqvHeadShape)

    // Compute attention weights
    const attnLogits = tf.einsum('bthk,bThk->bhtT', queryHeads, keyHeads)
      .div(Math.sqrt(hyper.key_size))
    // TODO: add causal mask
    const attnWeights = hyper.has_softmax ? attnLogits.softmax() : attnLogits

    // Weight valueHeads by the attnWeights and flatten out the heads to [B, T, W]
    const attnWV = tf.einsum('bhtT,bThk->bthk', attnWeights, valueHeads)
      .reshape([inputs.length, hyper.sequence_length, hyper.num_heads*hyper.key_size])

    // Project back to token embedding space
    const attn = tf.einsum('btw,wm->btm', attnWV, linearW) 

    const hOut = hyper.has_residual ? tf.add(h, attn) : attn
    const logits = tf.einsum('btm,mv->btv', hOut, unembeddingMatrix.transpose())
    const softmax = logits.softmax()

    return {keyHeads, queryHeads, valueHeads, attnWeights, attnWV, attn, hOut, logits, softmax}
  }

  function tidy(inputs){
    return tf.tidy(() => _model(inputs).softmax)
  }

  return {weights, params, hyper, tidy, _model}



  // TODO
  // - layer norm
  // - MLP
  // - projection bias
  // - untied embedding matrix 
  // - causal masking
  // - multiple layers
}


window.init?.()