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

window.initModel = async function(weights, hyper){
  weights.layers.forEach(layer => d3.values(layer.params).forEach(v => v.t = tf.tensor(v)))
  const embeddingMatrix = {t: tf.tensor(weights.embeddingMatrix)}

  // 1-layer attn only transformer forward pass; returns intermediate activations
  function _model(inputs){
    // B: Batch
    // T: Token
    // M: Model size
    // H: Head
    // K: KQV head size
    // W: H*K; the keyW matrix is [M, W]

    // Convert tokens to embedding
    const initH = tf.einsum('btv,vm->btm', tf.oneHot(inputs, hyper.vocab_size), embeddingMatrix.t)
    let h = initH
    const layerActivations = weights.layers.map(layer => {
      var rv = layer.type == 'attn' ? attnLayer(layer, h) : mlpLayer(layer, h)
      h = rv.hOut
      return rv
    })

    function attnLayer(layer, h){
      const {queryW, keyW, valueW, linearW} = layer.params

      // Project kqv heads and reshape to [B, T, H, K]
      const kqvHeadShape = [inputs.length, hyper.sequence_length, hyper.num_heads, hyper.key_size]
      const queryHeads = tf.einsum('btm,mw->btw', h, queryW.t).reshape(kqvHeadShape)
      const keyHeads   = tf.einsum('btm,mw->btw', h, keyW.t).reshape(kqvHeadShape)
      const valueHeads = tf.einsum('btm,mw->btw', h, valueW.t).reshape(kqvHeadShape)

      // Compute attention weights
      const attnLogits = tf.einsum('bthk,bThk->bhtT', queryHeads, keyHeads)
        // .div(Math.sqrt(hyper.key_size))
      // const attnWeights = attnLogits.softmax()
      const attnWeights = attnLogits

      // Weight valueHeads by the attnWeights and flatten out the heads to [B, T, W]
      const attnWV = tf.einsum('bhtT,bThk->bthk', attnWeights, valueHeads)
        .reshape([inputs.length, hyper.sequence_length, hyper.num_heads*hyper.key_size])

      // Project back to token embedding space
      const attn = tf.einsum('btw,wm->btm', attnWV, linearW.t) 
      const hOut = tf.add(h, attn)

      return {queryHeads, keyHeads, valueHeads, attnWeights, attnWV, attn, h, hOut} 
    }

    function mlpLayer(layer, h){
      const {hiddenW, outputW} = layer.params

      const hidden = h.matMul(hiddenW).relu()
      const output = hidden.matMul(outputW)
      const hOut = tf.add(h, output)

      return {h, hidden, output, hOut}
    }

    const hOut = _.last(layerActivations).hOut

    const logits = tf.einsum('btm,mv->btv', hOut, embeddingMatrix.t.transpose())
    const softmax = logits//.softmax()

    return {initH, layerActivations, hOut, logits, softmax}
  }

  function tidy(inputs){
    return tf.tidy(() => _model(inputs).softmax)
  }

  return {weights, hyper, tidy, _model}



  // TODO
  // - layer norm
  // - MLP
  // - projection bias
  // - untied embedding matrix 
  // - causal masking
  // - multiple layers
}


window.init?.()