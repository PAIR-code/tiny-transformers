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

 
window.init = async function(){
  console.clear()

  window.gridA = initGrid('train-a')
  var scores = initScores()
}
window.init()


d3.select('.radio-group').html('')
  .appendMany('div.radio-option', ['total_score', 'pos_score', 'neg_score'])
  .append('input')
  .at({type: 'radio', name: 'score', id: d => d})
  .property('checked', d => d == visState.scoring)
  .on('change', d => {
    visState.scoring = d
    init()
  })
  .parent().append('label').text(d => d.replace('_', ' ')).at({for: d => d})



d3.json('slugs.json', (err, res) => {
  var buttonSel = d3.select('.model-picker').html('')
    .appendMany('div.button', res)
    .text(d => d)
    .classed('active', e => e == visState.slug)
    .on('click', d => {
      visState.slug = d
      buttonSel.classed('active', e => e == visState.slug)

      window.init()
      window.initEmbeddings()
    })

})

// modelPickerSel.append('input')
//   .at({type: 'text', list: 'options', value: visState.slug})

// modelPickerSel.append('datalist')
//   .attr('id', 'options')
//   .appendMany('option',  ['train_reload_100k', 'pretraining_100k', 'pretraining_100k_3m'])
//   .attr('value', d => d)

// modelPickerSel.append('button')
//   .text('Update')
//   .on('click', function() {
//     visState.slug = d3.select('input').node().value;
//     console.log(visState.slug);
//   });