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

window.initScores = async function(){
  var options = [
    'scores_model-orig_seq-seq-a_config-orig.json',
    'scores_model-orig_seq-seq-rand_config-orig.json',
    'scores_model-ft_seq-seq-b_config-ft.json',
    'scores_model-ft_seq-seq-rand_config-ft.json',

    // 'scores_model-orig_seq-seq-a_config-ft.json',
    // 'scores_model-orig_seq-seq-b_config-orig.json',
    // 'scores_model-orig_seq-seq-b_config-ft.json',
    // 'scores_model-orig_seq-seq-rand_config-ft.json',
    // 'scores_model-ft_seq-seq-a_config-orig.json',
    // 'scores_model-ft_seq-seq-a_config-ft.json',
    // 'scores_model-ft_seq-seq-b_config-orig.json',
    // 'scores_model-ft_seq-seq-rand_config-orig.json',
  ].map(file => {
      var [_, modelId, seqId, configId] = file.replace('.json', '').split('_')

      seqId = seqId.replace('seq-', '')
      configId = configId.replace('config', 'scoring')
        .replace('ft', 'b')
        .replace('orig', 'a')
      var isOOD = modelId == 'model-orig' ? seqId == 'seq-b' : seqId == 'seq-a'

      modelId = modelId.replace('ft', 'finetune b').replace('orig', 'train a')
      return {modelId, seqId, configId, file, isOOD}
    })

  var root = `../../local-data/gridworld/js-data/${visState.slug}`
  for (option of options){
    option.data = await util.getFile(`${root}/${option.file}`)
    option.data = option.data.filter(d => d.seq_index < 512)
    option.data.forEach(d => d.option = option)
  }

  var flatData = window.flatData = _.flatten(options.map(d => d.data))
  d3.nestBy(flatData, d => d.option.file).forEach(data => {
    var bySeqIndex = d3.nestBy(data, d => d.seq_index + d.option)
    bySeqIndex.forEach(seqData => {
      seqData.lastScore = seqData.at(-1).score[visState.scoring]
      var i = seqData.length - 1
      while (seqData[i]?.score[visState.scoring] == seqData.lastScore) i--
      seqData.solveTime = i 

      // TODO: need a max possible score for OOD data 
      seqData.allP = seqData[0].score.all_p

      seqData.meanEnd = d3.mean(seqData.slice(-1), d => d.score[visState.scoring])
    })

    // _.sortBy(bySeqIndex, d => d3.max(d, e => e.score[visState.scoring]) - d.solveTime/100)
    _.sortBy(bySeqIndex, d => d.meanEnd - d.solveTime/100)
      .forEach((seqData, sortedSeqIndex) => {
        seqData.forEach(d => d.sortedSeqIndex = sortedSeqIndex)
      })
  })

  var byIsRand = d3.nestBy(flatData, d => d.option.file.includes('rand'))
  var optionSel = d3.select('.scores').html('')
    .appendMany('div', byIsRand)
    .appendMany('div', (d, i) => d3.nestBy(d, e => e.option.file))
    .st({display: 'inline-block'})
    .each(drawOption)


  function drawOption(data, i){
    // if (i) return
    // console.log(option)
    // var data = option.data

    var {modelId, seqId, configId, file} = data[0].option

    var nSteps = d3.max(data, d => d.model_index)
    var nSeqs = d3.max(data, d => d.sortedSeqIndex)
    var sx = 10
    var sy = 1

    var c = d3.conventions({
      sel: d3.select(this),
      width: sx*(nSteps + 1),
      height: sy*(nSeqs + 1),
      layers: 'cs',
      margin: {left: 5, right: 5, top: 25, bottom: 30}
    })

    // c.rootsvg.st({over})
    var modelStr = modelId.includes('train a') ? 'Train A+' : 'Finetune A+ to B+'
    var textCols = [modelStr, seqId.includes('rand') ? 'OOD Input' : ''].filter(d => d)
    c.svg.append('g.axis-label').append('text')
      .at({x: c.width/2, textAnchor: 'middle', y: -5})
      .text(textCols.join(' — ').replaceAll('-', ': '))
      .st({fontWeight: 600})

    var ctx = c.layers[0]

    data.forEach(d => {
      ctx.beginPath()
      ctx.fillStyle = color.score(d.score[visState.scoring])
      ctx.rect(d.model_index*sx, d.sortedSeqIndex*sy, sx - .1, sy)
      ctx.fill()
    })

    c.svg.append('rect').st({})
      .at({width: c.width, height: c.height, opacity: 0, cursor: 'pointer'})
      .on('mousemove', function(){
        if (visState.isClicked) return
        var [x, y] = d3.mouse(this)
        draw(Math.floor(x/sx), Math.floor(y/sy))
      })
      .on('click', function(){
        visState.isClicked = true
        var [x, y] = d3.mouse(this)
        draw(Math.floor(x/sx), Math.floor(y/sy))
      })
      .on('mouseleave', () => {
        visState.isClicked = false
      })

    function draw(stepIndex, seqIndex){
      var seqs = data.filter(d => d.sortedSeqIndex == seqIndex)
      seqs.scoringTitle = {
        'scoring-a': 'A: +1      B: -1      C: +0',
        'scoring-b': 'A: -1      B: +1      C: +0',
      }[seqs[0].option.configId]
      window.gridA.render(seqs)
      visState.seqs = seqs
    }

    if (!visState.seqs) draw(50, 500)


    function drawAxii(){
      var bs = c.width/21
      var seqs = data.filter(d => d.sortedSeqIndex == 0)
      var stepSel = c.svg.append('g.axis').translate(c.height + 10, 1)
      stepSel.append('text').text('Training Step →').at({y: 13})
        .at({textAnchor: 'middle', x: c.width/2})
      stepSel.append('g.axis').appendMany('text', seqs)
        .text((d,i) => i % 4 == 0 ? (i + 1)*5 + 'k' : '')
        .at({textAnchor: 'middle', x: (d, i) => i*bs + bs/2, y: 0, fontSize: 9})

      if (i) return
      c.svg
        .append('g.axis')
        .translate([-5, c.height/2])
        .append('text.xaxis-label')
        .text('← Higher Scoring Inputs')
        .at({textAnchor: 'middle', fill: '#000', transform: 'rotate(-90)'})
    }
    drawAxii()



  }


}

window.init?.()
