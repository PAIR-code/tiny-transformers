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

window.initWeights = function(){
  var seqLength = 7

  var hyper = {
    n_num_tokens: 10,
    sequence_length: 7, 
    num_layers: 3,
    num_heads: 1,
  }
  hyper.key_size = hyper.n_num_tokens

  var embedVals = {
    'fixed_one': 1,
    'is_left': 1,
    'is_num': 1,
    'continuous_num': 1,
    'one_hot_num': hyper.n_num_tokens,
    'left_count': 1,
    'smaller_count': 1,
    'smaller_eq_count': 1,
    'one_hot_smaller_count': (hyper.sequence_length + 1)/2,
    'is_uncertain': 1,
    'is_certain_prob': 1,
    'prev_smaller_num': 1,
    'next_bigger_num': 1,
    'one_hot_numerator': hyper.n_num_tokens,
    'one_hot_denominator_inv': hyper.n_num_tokens,
    'left_prob': 1,
  }
  var mini_inf = hyper.n_num_tokens * 10
  var macro_inf = mini_inf * hyper.n_num_tokens

  // Map of named value to index in the residual stream
  var namedIndices = {}
  var prev = 0
  d3.entries(embedVals).forEach(({key, value}) => {
    namedIndices[key] = d3.range(prev, prev + value)
    prev += value
  })
  var indToName = []
  d3.entries(namedIndices).forEach(({key, value}) => {
    value.forEach((d, j) => {
      indToName.push({key, j})
    })
  })

  hyper.namedIndices = namedIndices
  hyper.indToName = indToName
  hyper.vocab_size = hyper.n_num_tokens + 2 
  hyper.model_size = indToName.length
  hyper.mlp_size = indToName.length


  var embeddingMatrix = d3.range(hyper.vocab_size).map(tokenIndex => {
    var isLeft = tokenIndex == hyper.n_num_tokens
    var isNum = tokenIndex < hyper.n_num_tokens

    return d3.range(hyper.model_size).map(i => {
      var m = indToName[i]
      if (m.key == 'fixed_one') return 1
      if (m.key == 'is_left') return isLeft
      if (m.key == 'is_num') return isNum
      if (m.key == 'continuous_num') return isNum && tokenIndex // /hyper.n_num_tokens
      if (m.key == 'one_hot_num') return isNum && m.j == tokenIndex
      return 0
    }).map(d => +d)
  })


  function makeLayerAttn(fns){
    var queryW = d3.range(hyper.model_size).map(ri => {
      return d3.range(hyper.key_size)
        .map(ki => fns.queryW(ri, ki, indToName[ri]))
        .map(mapTo0)
    })

    var keyW = d3.range(hyper.model_size).map(ri => {
      return d3.range(hyper.key_size)
        .map(ki => fns.keyW(ri, ki, indToName[ri]))
        .map(mapTo0)
    })

    var valueW = d3.range(hyper.model_size).map(ri => {
      return d3.range(hyper.key_size)
        .map(ki => fns.valueW(ri, ki, indToName[ri]))
        .map(mapTo0)
    })

    var linearW = d3.range(hyper.key_size).map(ki => {
      return d3.range(hyper.model_size)        
        .map(ri => fns.linearW(ri, ki, indToName[ri]))
        .map(mapTo0)
    })

    return {params: {queryW, keyW, valueW, linearW}, name: fns.name, fns, type: 'attn'}
  }

  function makeLayerMLP(fns){
    var hiddenW = d3.range(hyper.model_size).map(ri => {
      return d3.range(hyper.mlp_size)
        .map(mi => fns.hiddenW(ri, mi, indToName[ri]))
        .map(mapTo0)
    })

    var outputW = d3.range(hyper.mlp_size).map(mi => {
      return d3.range(hyper.model_size)
        .map(ri => fns.outputW(ri, mi, indToName[ri]))
        .map(mapTo0)
    })

    return {params: {hiddenW, outputW}, name: fns.name, fns, type: 'mlp'}
  }

  function mapTo0(d){ return isFinite(d) ? +d : 0 }
  function relu(d){ return d<0 ? -d : 0 }

  var layers = [
    {
      name: 'init_embedding',
      queryW:   (ri, ki, m) => 0,
      keyW:     (ri, ki, m) => 0,
      valueW:   (ri, ki, m) => 0,
      linearW:  (ri, ki, m) => 0,
    },
    // L1 - Attn - 2 heads
    {
      name: 'left_count',
      queryW:   (ri, ki, m) => m.key == 'is_num' && ki == 0,
      keyW:     (ri, ki, m) => m.key == 'is_left' && ki == 0,
      valueW:   (ri, ki, m) => m.key == 'is_left' && ki == 0,
      linearW:  (ri, ki, m) => ki == 0 && m.key == 'left_count',
    },
    {
      name: 'smaller_count',
      queryW:   (ri, ki, m) => m.key == 'one_hot_num' && m.j == ki,
      keyW:     (ri, ki, m) => m.key == 'one_hot_num' && m.j < ki, 
      valueW:   (ri, ki, m) => ki == 0 && m.key == 'is_num' ? 1 : 0,
      linearW:  (ri, ki, m) => m.key == 'smaller_count',
    },
    {
      name: 'smaller_eq_count',
      queryW:   (ri, ki, m) => m.key == 'one_hot_num' && m.j == ki,
      keyW:     (ri, ki, m) => m.key == 'one_hot_num' && m.j <= ki, 
      valueW:   (ri, ki, m) => ki == 0 && m.key == 'is_num' ? 1 : 0,
      linearW:  (ri, ki, m) => m.key == 'smaller_eq_count',
    },
    // L1 - MLP
    {
      // https://colab.research.google.com/drive/1cal0QwfnG8IOfhaGPfgZ3snjjPb1cc8D?resourcekey=0-TUBmzUFsNeRRCrPf-uvxxA#scrollTo=cP8zLTFHDsYD
      name: 'utils', //one_hot_smaller_count-- special cases -- is_uncertain -- is_certain_prob',
      hiddenW: (ri, mi, m) => 
        //one_hot_smaller_count
        (m.key == 'fixed_one' && mi<hyper.sequence_length) ? mi : 
        (m.key == 'smaller_count' && mi<hyper.sequence_length) ? -1 : 
        //special cases of prev smaller
        (m.key == 'smaller_count' && mi==hyper.sequence_length) ? -1: 
        (m.key == 'fixed_one' && mi==hyper.sequence_length) ? 1 : 
        //special cases of next bigger
        (m.key == 'smaller_eq_count' && mi==hyper.sequence_length+1) ? 1 : 
        (m.key == 'fixed_one' && mi==hyper.sequence_length+1) ? -(hyper.sequence_length + 1)/2 + 1 : 

        // to calculate is_certain, here are how the hidden dimensions look:
        // the first 4 dimensions show left_count v smaller_count
        // 0 1   0 1      if left_count = smaller_count
        // x x+1 0 0      if left_count > smaller_count
        // 0 0   x x+1    if left_count < smaller_count
        // Dimensions 7-8 show: right_count vs bigger_count. Note that right_count: len/2 - left_count, bigger_count: len/2 - smaller_eq_count
        // 0 1   0 1      if right_count = bigger_count
        // 0 0   y y+1    if right_count < bigger_count
        // y y+1 0 0      if right_count > bigger_count
        // the sum of pair-wise differences can have 3 possible values: 2, 3, 4. Adding a fixed bias of -3, we'll have:
        // -1: point outside of boundary, 0: point on the boundary, 1: point inside boundary
        // we clean this up into a binary variable in the MLP of the next layer (replacing -1 with a 0)
        // is_uncertain
          // left_count > smaller_count
        (m.key == 'left_count' && mi>=hyper.sequence_length+2 && mi <=hyper.sequence_length+3) ? 1 : 
        (m.key == 'smaller_count' && mi>=hyper.sequence_length+2 && mi <=hyper.sequence_length+3) ? -1 : 
        (m.key == 'fixed_one' && mi>=hyper.sequence_length+2 && mi <=hyper.sequence_length+3) ? mi-hyper.sequence_length-2 : 
          // left_count < smaller_count
        (m.key == 'left_count' && mi>=hyper.sequence_length+4 && mi <=hyper.sequence_length+5) ? -1 : 
        (m.key == 'smaller_count' && mi>=hyper.sequence_length+4 && mi <=hyper.sequence_length+5) ? 1 : 
        (m.key == 'fixed_one' && mi>=hyper.sequence_length+4 && mi <=hyper.sequence_length+5) ? mi-hyper.sequence_length-4 :
          // left_count > smaller_eq_count-1
        (m.key == 'left_count' && mi>=hyper.sequence_length+6 && mi <=hyper.sequence_length+7) ? 1 : 
        (m.key == 'smaller_eq_count' && mi>=hyper.sequence_length+6 && mi <=hyper.sequence_length+7) ? -1 : 
        (m.key == 'fixed_one' && mi>=hyper.sequence_length+6 && mi <=hyper.sequence_length+7) ? mi-hyper.sequence_length-6+1: 
          // left_count < smaller_eq_count-1
        (m.key == 'left_count' && mi>=hyper.sequence_length+8 && mi <=hyper.sequence_length+9) ? -1 : 
        (m.key == 'smaller_eq_count' && mi>=hyper.sequence_length+8 && mi <=hyper.sequence_length+9) ? 1 : 
        (m.key == 'fixed_one' && mi>=hyper.sequence_length+8 && mi <=hyper.sequence_length+9) ? mi-hyper.sequence_length-8-1: 
          // offset
        (m.key == 'fixed_one' && mi==hyper.sequence_length+10) ? 3 : 

        //is_certain_prob
        (m.key == 'left_count' && mi>=hyper.sequence_length+11 && mi<=hyper.sequence_length+12) ? 1 : 
        (m.key == 'smaller_eq_count' && mi>=hyper.sequence_length+11 && mi<=hyper.sequence_length+12) ? -1 : 
        (m.key == 'fixed_one' && mi>=hyper.sequence_length+11 && mi<=hyper.sequence_length+12) ? mi-hyper.sequence_length-11+1 : 0,
      
      outputW: (ri, mi, m) => 
        //one_hot_smaller_count
        (m.key == 'one_hot_smaller_count' && mi<hyper.sequence_length) ? [1, -2, 1][m.j-mi+1]:
        //special cases of prev smaller
        (m.key == 'prev_smaller_num' && mi==hyper.sequence_length) ? -1 :
        //special cases of next bigger
        (m.key == 'next_bigger_num' && mi==hyper.sequence_length+1) ? hyper.n_num_tokens : 
        // is_uncertain
        (m.key == 'is_uncertain' && mi>=hyper.sequence_length+2 && mi<=hyper.sequence_length+10) ? [-1, 1, -1, 1, -1, 1, -1, 1, -1][mi-hyper.sequence_length-2] : 
        //is_certain_prob
        (m.key == 'is_certain_prob' && mi>=hyper.sequence_length+11 && mi<=hyper.sequence_length+12) ? [-1, 1][mi-hyper.sequence_length-11] : 0,
    },
    // L2 - Attn - 2 heads
    {
      name: 'prev_smaller_num',
      queryW:   (ri, ki, m) => m.key == 'one_hot_smaller_count' && m.j == ki,
      keyW:     (ri, ki, m) => m.key == 'one_hot_smaller_count' && m.j+1 == ki,
      valueW:   (ri, ki, m) => m.key == 'one_hot_num' && ki == 0 ? m.j : 0,
      linearW:  (ri, ki, m) => m.key == 'prev_smaller_num',
    },
    {
      name: 'next_bigger_num',
      queryW:   (ri, ki, m) => m.key == 'one_hot_smaller_count' && m.j == ki,
      keyW:     (ri, ki, m) => m.key == 'one_hot_smaller_count' && m.j-1 == ki,
      valueW:   (ri, ki, m) => m.key == 'one_hot_num' && ki == 0 ? m.j : 0,
      linearW:  (ri, ki, m) => m.key == 'next_bigger_num',
    },
    // L2 - MLP
    {
      name: 'one_hot division setup',
      hiddenW: (ri, mi, m) => 
        // one_hot_numerator
        (m.key == 'next_bigger_num' && mi <= hyper.n_num_tokens) ? -1 : 
        (m.key == 'continuous_num' && mi <= hyper.n_num_tokens) ? 1 : 
        (m.key == 'fixed_one' && mi <=hyper.n_num_tokens) ? mi : 
        //one_hot_denominator_inv which is one_hot_denominator * 1/denominator
        (m.key == 'next_bigger_num' && mi > hyper.n_num_tokens && mi <= (2*hyper.n_num_tokens+1)) ? -1 : 
        (m.key == 'prev_smaller_num' && mi > hyper.n_num_tokens && mi <= (2*hyper.n_num_tokens+1)) ? 1 : 
        (m.key == 'fixed_one' && mi > hyper.n_num_tokens && mi <= (2*hyper.n_num_tokens+1)) ? mi-(hyper.n_num_tokens+1) : 
        // make is_uncertain binary
        (m.key == 'is_uncertain' && mi==2*hyper.n_num_tokens+2) ? -1 : 0,

      outputW: (ri, mi, m) => 
        // one_hot_numerator
        (m.key == 'one_hot_numerator' && mi <= hyper.n_num_tokens) ? [1, -2, 1][m.j-mi+1] : 
        // one_hot_denominator_inv which is one_hot_denominator * 1/denominator
        (m.key == 'one_hot_denominator_inv' && mi > hyper.n_num_tokens && mi <= (2*hyper.n_num_tokens+1)) ? [1/m.j, -2/m.j, 1/m.j][m.j-mi+hyper.n_num_tokens+2] : 
        // make is_uncertain binary
        (m.key == 'is_uncertain' && mi==2*hyper.n_num_tokens+2) ? 1 : 0,
    },
    // L3 - MLP
    {
      name: 'left_prob',
      hiddenW: (ri, mi, m) => 
        (m.key == 'one_hot_denominator_inv' && mi < hyper.n_num_tokens) ? mi : 
        (m.key == 'one_hot_numerator' && mi < hyper.n_num_tokens) ? (m.j == mi ? 0 : -mini_inf) : 
        //Zero out numerator/denominator if it is a certain prediction
        (m.key == 'is_uncertain' && mi < hyper.n_num_tokens) ? macro_inf :
        (m.key == 'fixed_one' && mi < hyper.n_num_tokens) ? -macro_inf : 
        //Add the certain prediction probability
        (m.key == 'is_uncertain' && mi == hyper.n_num_tokens) ? -mini_inf :
        (m.key == 'is_certain_prob' && mi == hyper.n_num_tokens) ? 1 : 0,

      outputW: (ri, mi, m) => 
        (m.key == 'left_prob' && mi <= hyper.n_num_tokens) ? 1 : 0,
    },
  ].map(d => d.keyW ? makeLayerAttn(d) : makeLayerMLP(d))
  console.log(layers)

  // ppLayer(layers[3])
  function ppLayer(layer){
    console.log(layer.name)
    d3.entries(layer.params).forEach(({key, value}) => {
      console.log('\n')
      console.log(key)

      var str = ''
      value.forEach(row => {
        str += row.join(',  ') + '\n'
      })
      console.log(str)
    })
  }

  return {weights: {embeddingMatrix, layers}, hyper}
}


window.init?.()