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

window.initGrid = function(){
  var vocab = []
  vocab.itemAlphabet = ' abcdefghijklmnopqrstuvwxyz'
    .slice(0, dataset_config.rand_item_scores.length + 1)
  d3.range(dataset_config.grid_size).forEach(i => vocab.push(i + ''))
  dataset_config.rand_item_scores
    .map((d, i) => vocab.push('pos_' + vocab.itemAlphabet[i + 1]))
  vocab.push(...['pos_start', 'pos_end', 'r', 'u', 'p'])
  vocab.str2index = {}
  vocab.forEach((d, i) => vocab.str2index[d] = i)

  var sel = d3.select('.trajectory-grid').html('')
  var seq = visState.seq

  var s = 30

  var c = d3.conventions({
    sel: sel.append('div'),
    width: s*dataset_config.grid_size,
    height: s*dataset_config.grid_size,
    margin: {bottom: 130}
  })

  var boxes = d3.range(dataset_config.grid_size)
    .map(i => d3.range(dataset_config.grid_size).map(j => ([i, j])))
  var boxesFlat = _.flatten(boxes)

  var pos2px = ([i, j]) => [i*s, (dataset_config.grid_size - 1 - j)*s]
  var centerPos = ([i, j]) => [i + .5, j - .5]

  function calcWalkPositions(seq){
    var curPos = [0, 0]
    var positions = [curPos]
    seq.map(d => vocab[d]).forEach((d, seqIndex) => {
      if (d != 'r' && d != 'u') return

      curPos = curPos.slice()
      curPos.seqIndex = seqIndex
      d == 'r' ? curPos[0]++ : curPos[1]++
      positions.push(curPos)
    })

    return positions
  }

  c.svg.appendMany('rect', boxesFlat)
    .at({width: s - 1, height: s - 1, fill: '#eee'})
    .translate(pos2px)

  // TODO: fix hard coding
  var pathData = d3.range(21).map(i => ({i}))
  var pathSel = c.svg.appendMany('path', pathData)
    .at({stroke: '#000', fill: 'none', strokeWidth: .8})
    // .st({pointerEvents: 'none'})

  var boxTextSel = c.svg.appendMany('text.item', boxesFlat)
    .translate(d => pos2px(centerPos(d)))
    .at({textAnchor: 'middle', dy: '.33em'})
    .st({pointerEvents: 'none'})

  var bs = 14

  var stepSel = c.svg.append('g.axis').translate(c.height + 25, 1)
  stepSel.append('text').text('Training Step →')
    .at({textAnchor: 'middle', x: c.width/2})
  var indexRectSel = stepSel
    .appendMany('rect', pathData)
    .translate(d => [d.i*bs, 3])
    .at({width: bs - .5, height: 5})
  stepSel.append('g.axis').appendMany('text', pathData)
    .text(d => d.i % 4 == 0 ? (d.i + 1)*5 + 'k' : '')
    .at({textAnchor: 'middle', x: d => d.i*bs + bs/2, y: 18, fontSize: 9})

  var scoreSel = c.svg.append('g.axis').translate(c.height + 65, 1)
  scoreSel.append('text.title')
    .text('Score').at({textAnchor: 'middle', x: c.width/2})
  var scoreRectSel = scoreSel
    .appendMany('rect', pathData)
    .translate(d => [d.i*bs, 3])
    .at({width: bs - .5, height: 5})
  var scoreTextSel = scoreSel.append('g.axis').appendMany('text', pathData)
    .at({textAnchor: 'middle', x: d => d.i*bs + bs/2, y: 18, fontSize: 9})


  var scoreTitleSel = scoreSel.append('text.title')
    .text('Score').at({textAnchor: 'middle', x: c.width/2, y: 32, fontSize: 11})
    .attr('xml:space', 'preserve')


  function render(seqs){
    var offsetScale = d3.scaleLinear()
      .domain([0, seqs.length -1]).range([-s/5, s/5])

    pathData.forEach(d => {
      d.s = seqs[d.i]

      if (!d.s) return d.pathStr = ''
      d.pathStr = 'M' + calcWalkPositions(d.s.generated_seq)
        .map(centerPos)
        .map(pos2px)
        .map(([px, py]) => [px + offsetScale(d.i), py + offsetScale(d.i)])
        .join('L')

    })

    pathSel
      .at({d: d => d.pathStr})
      .at({display: d => d.s ? '' : 'none'}).filter(d => d.s)
      .at({stroke: d => d3.interpolatePlasma(d.i/seqs.length)})
      // .at({stroke: d => color.score(d.s.score.total_score)})

    scoreRectSel
      .at({display: d => d.s ? '' : 'none'}).filter(d => d.s)
      .at({fill: d => color.score(d.s.score[visState.scoring])})

    scoreTextSel
      .text(d => d3.format('+')(d.s.score[visState.scoring]))

    scoreTitleSel.text(seqs.scoringTitle)

    indexRectSel
      .at({display: d => d.s ? '' : 'none'}).filter(d => d.s)
      .at({fill: d => d3.interpolatePlasma(d.i/seqs.length)})


    var seq = seqs[0].generated_seq
    boxesFlat.forEach(d => d.val = ' ')
    seq.forEach((d, i) => {
      var str = vocab[d]
      if (!str.includes('pos_')) return

      var pos = [seq[i + 1], seq[i + 2]]
      boxes[seq[i + 1]][seq[i + 2]].val = str.replace('pos_', '')
    })
    boxTextSel.text(d => d.val.length == 1 ? d.val.toUpperCase() : d.val)
  }
  if (visState.seqs) render(visState.seqs)

  return {render}
}

window.init?.()
