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


// https://colab.research.google.com/drive/1NZbBUxVpqDeKvl6m-gVtFf_ZwxPChYuc?resourcekey=0-M2Ac8ikYbWV9TBjxbFtTCQ#scrollTo=X8GQoTH-5m_y


window.visState = {
  seq: [14,  9,  9, 12,  2,  7, 11,  5,  3, 13,  0,  0, 16, 16, 15, 16,
             16, 15, 15, 16, 16, 15, 16, 16, 15, 15, 15, 15, 15, 16, 17, 17,
             17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17,
             17, 17, 17, 17, 17, 17],
}

window.dataset_config = {
  'grid_size': 10,
  'max_rand_items': 10,
  'min_rand_items': 2,
  'name': 'gridworld',
  'pad_token': 17,
  'rand_item_scores': [1, -1, 0],
  'vocab_size': 18,
  'seq_length': visState.seq.length,
}

var vocab = []
vocab.itemAlphabet = ' abcdefghijklmnopqrstuvwxyz'
  .slice(0, dataset_config.rand_item_scores.length + 1)
d3.range(dataset_config.grid_size).forEach(i => vocab.push(i + ''))
dataset_config.rand_item_scores
  .map((d, i) => vocab.push('pos_' + vocab.itemAlphabet[i + 1]))
vocab.push(...['pos_start', 'pos_end', 'r', 'u', 'p'])
vocab.str2index = {}
vocab.forEach((d, i) => vocab.str2index[d] = i)

window.initTokenSeqPP = function(){
  var sel = d3.select('.token-seq-pp').html('')

  function render(){
    sel.html(`
      <div><b>print print seq</b></div>
      ${visState.seq.map(d => vocab[d]).join(', ')}

      <br>
      <br>
      <div><b>raw seq</b></div>
      ${visState.seq.join(', ')}
    `)
  }

  return {render}
}


window.initGrid = function(renderAll){
  var sel = d3.select('.grid').html('')
  var seq = visState.seq

  var s = 30

  var c = d3.conventions({
    sel: sel.append('div'),
    width: s*dataset_config.grid_size,
    height: s*dataset_config.grid_size,
  })

  var boxes = d3.range(dataset_config.grid_size)
    .map(i => d3.range(dataset_config.grid_size).map(j => ([i, j])))
  var boxesFlat = _.flatten(boxes)
  boxesFlat.forEach(d => d.val = ' ')

  visState.seq.forEach((d, i) => {
    var str = vocab[d]
    if (!str.includes('pos_')) return

    var pos = [visState.seq[i + 1], visState.seq[i + 2]]
    boxes[visState.seq[i + 1]][visState.seq[i + 2]].val = str.replace('pos_', '')
  })

  var pos2px = ([i, j]) => [i*s, (dataset_config.grid_size - 1 - j)*s]
  var centerPos = ([i, j]) => [i + .5, j - .5]

  // removed deleted tokens and adjust pad tokens to keep fixed length
  function tidySeq(){
    visState.seq = visState.seq
      .filter(d => d != undefined)
      .concat(d3.range(dataset_config.seq_length).map(d => vocab.str2index['p']))
      .slice(0, dataset_config.seq_length)
  }

  function calcWalkPositions(){
    var curPos = [0, 0]
    curPos.seqIndex = visState.seq.indexOf(vocab.str2index['pos_start']) + 2
    var positions = [curPos]
    visState.seq.map(d => vocab[d]).forEach((d, seqIndex) => {
      if (d != 'r' && d != 'u') return

      curPos = curPos.slice()
      curPos.seqIndex = seqIndex
      d == 'r' ? curPos[0]++ : curPos[1]++
      positions.push(curPos)

      boxTextSel.text(d => d.val)
    })

    return positions
  }

  c.svg.appendMany('rect', boxesFlat)
    .at({width: s - 1, height: s - 1, fill: '#eee'})
    .translate(pos2px)
    .on('click', d => {
      var seq = visState.seq

      var prevIndex = vocab.itemAlphabet.indexOf(d.val)
      if (prevIndex == -1) return // don't mutate start/end
      d.val = vocab.itemAlphabet[(prevIndex + 1) % vocab.itemAlphabet.length]

      if (prevIndex){
        // mutate existing item
        seq.forEach((token, i) => {
          var str = vocab[token]
          if (!str?.includes('pos_')) return
          if (d[0] == seq[i + 1] && d[1] == seq[i +2 ]){
            seq[i] = vocab.str2index['pos_' + d.val]
            if (seq[i] == undefined) seq[i + 1] = seq[i + 2] = undefined
          }
        })
      } else {
        // insert new item + position tokens
        var startIndex = seq.indexOf(vocab.str2index['pos_start'])
        seq.splice(startIndex, 0, ...[vocab.str2index['pos_' + d.val], d[0], d[1]])
      }
      
      tidySeq()
      renderAll()
    })

  c.svg.on('mousemove', function(){
    if (!d3.event.shiftKey) return
      
    var i = Math.floor(d3.mouse(this)[0]/s)
    var j = dataset_config.grid_size - 1 - Math.floor(d3.mouse(this)[1]/s)

    var lastPos = calcWalkPositions()
      .filter(d => d[0] <= i && d[1] <= j)
      .at(-1)

    visState.seq = visState.seq.slice(0, lastPos.seqIndex + 1)
    while (lastPos[0] < i || lastPos[1] < j){
      if (lastPos[0] < i){
        visState.seq.push(vocab.str2index['r'])
        lastPos[0]++
      }
      if (lastPos[1] < j){
        visState.seq.push(vocab.str2index['u'])
        lastPos[1]++
      }
    }

    tidySeq()
    renderAll()
  })

  var pathSel = c.svg.append('path')
    .at({stroke: '#aaa', fill: 'none', strokeWidth: 2})
    .st({pointerEvents: 'none'})

  var boxTextSel = c.svg.appendMany('text', boxesFlat)
    .translate(d => pos2px(centerPos(d)))
    .at({textAnchor: 'middle', dy: '.33em'})
    .st({pointerEvents: 'none'})

  function render(){

    pathSel.at({
      d: 'M' + calcWalkPositions().map(centerPos).map(pos2px).join('L')
    })
  }
  return {render}

}
 
window.init = async function(){
  console.clear()

  function renderAll(){
    renderAll.fns.forEach(d => d())
  }
  renderAll.fns = []

  var tokenSeqPP = window.initTokenSeqPP()
  renderAll.fns.push(tokenSeqPP.render)

  var grid = initGrid(renderAll)
  renderAll.fns.push(grid.render)


  renderAll()
}
window.init()



