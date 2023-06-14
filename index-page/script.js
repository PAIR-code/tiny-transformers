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

console.clear()


var posts = [

  {
    slug: 'decision-boundary/05-sweep-vis',
    title: 'sweep vis',
    html: `
      What happens to accuracy across hyper parameters? How much can we simplify the architecture without it breaking?
    `,
  },

  {
    slug: 'decision-boundary/08-animate-vocab-embed',
    title: 'embedding over training',
    html: `
      Slightly changing the training setup creates discontinuities in the learned embedding — with significantly lower accuracy.
    `,
  },

  {
    slug: 'decision-boundary/12-circuit-sync',
    title: 'key-query output-value circuits',
    html: `
      Deleting almost everything — 1 layer, 1 head, no MLP, no layer norm, no softmax on attention — the model still gets 98.5% accuracy. 

      <br><br>This task has a very good linear approximation 😬
    `,
  },

  {
    slug: 'decision-boundary/13-train-slice',
    title: 'train linear',
    html: `
      For a single query token, the linear is model trains in a few seconds if we collapse the model into a single matrix. 
    `,
  },

  {
    slug: 'decision-boundary/14-rasp-hand-weights',
    html: `
      We wrote out weights by hand for an exact solution in three layers. Unlike the <a href='https://srush.github.io/raspy/'>Thinking Like a Transformer</a> paper, we're unable to train models from scratch that finds exact solution. Maybe the model falls into a local minimum around linear approximation?  
    `,
  },

  {
    slug: 'mlp-modular/00-sweep',
    title: 'hyper parameter sweep',
    html: `
      Grokking requires very specific hyper parameters. If the model is too small or the learning rate/weight decay is too high, it skips memorization and generalizes immediately. Going in the other direction, with more capacity and a low learning rate, the train loss takes a long time drop.    
    `,
  },

  {
    slug: 'mlp-modular/01-train-embedding',
    title: 'training vis',
    html: `
      What do the weights and activations of the model look like during training?
    `,
  },

  {
    slug: 'gridworld/02-training-scores',
    title: 'training scores',
    html: `
      Does the model learn to pick up As or avoid Bs first? What happens to the model embeddings when we retrain the model to pick up Bs instead of As?
    `,
  },


]

posts.forEach(d => {
  if (!d.shareimg){
    d.shareimg = 'index-page/thumbnail/' + d.slug.replaceAll('/', '__') + '.png'
  }
  d.url = d.url || d.slug

  d.topic = d.slug.split('/')[0]
})


var topicSel = d3.select('#posts').html('')
  .appendMany('div', d3.nestBy(posts, d => d.topic))


var topicH = {
  'gridworld': 'Mobility',
  'p': 'Modeling',
  'b': 'Brazil Testing',
  'o': 'Miscellaneous',
}

var topicP = {
  gridworld: `
    A 10×10 grid has several A, B and C items place on it. The model is trained on a series of "right" and "up" tokens that move from the lower-left to the upper-right while picking up A items and avoiding B items.  
    <br>
    <br>
    We want to use this as a playground for RLHF — does RL do something quantitative or qualitatively different to the model than SFT?
    <br>
  `,

  'mlp-modular': `Input two numbers and train a model to calculate their sum mod 113. Train on 30% of the possible pairs of inputs; "grokking" happens when training loss drops quickly and test loss only drops much later.`,

  'decision-boundary': `
    What's the simplest ICL task?
    <br><br>
    For each sequence, we pick a hidden decision boundary and output numbers 0-99 with left or right labels. The model is trained to predict the probability that last number is left or right of the decision boundary.
  `
}

topicSel.append('h3').text(d => d.key)
topicSel.append('p').html(d => topicP[d.key]).st({marginBottom: 30})

var postSel = topicSel.appendMany('div.post', d => d)
  .st({
    verticalAlign: 'top',
  })
  

var postLeftSel = postSel.append('a.left-col')
  .at({href: d => d.url})
  .at({
    textDecoration: 'none',
    cursor: 'pointer',
  })

postLeftSel.append('div.img')
  .at({src: d => d.shareimg})
  .st({
    width: '100%', 
    height: 150,
    backgroundImage: d => `url(${d.shareimg})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  })

postLeftSel.append('p.title')
  // .text(d => d.title)
  .text(d => d.slug)
  .st({
    verticalAlign: 'top',
    marginTop: 10,
    textDecoration: 'none',
  })

postSel.append('p.text')
  .html(d => d.html)
  .st({
    verticalAlign: 'top',
    marginTop: 10,
    textDecoration: 'none',
  })
