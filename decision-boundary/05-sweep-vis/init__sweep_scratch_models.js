!(function(){
  var sweepSlug = 'sweep_scratch_models'
  d3.loadData(`data__${sweepSlug}.json`, (err, res) => {

    var models = res[0]
    models = models.map(d => {
      var rv = {...d, ...d.hyper, ...d.metrics}
      rv.slug = {name: d.slug}
      return rv
    })
    models = _.sortBy(models, d => d.MAE)

    var sel = d3.select(`.${sweepSlug}`).html('')
    sel.append('div').appendMany('div', models)
      .st({display: 'inline-block', width: 200, marginBottom: 20, padding: 5, outline: '1px solid #ccc', margin: 5})
      .each(function(d){
        d.slug_id = d.slug.name
        d.MAE = d3.round(d.MAE, 4)
        var keys = ['vocab_embedding', 'model_size', 'num_heads', 'MAE', 'slug_id']
        d3.select(this).html(keys.map(key => `<div>${key}: <b>${d[key]}</b></div>`).join(''))
      })
  })
})()


!(function(){
  var sweepSlug = 'batch_64models'
  d3.loadData(`data__${sweepSlug}.json`, (err, res) => {

    var models = res[0]
    models = models.map(d => {
      var rv = {...d, ...d.hyper, ...d.metrics}
      rv.slug = {name: d.slug}
      return rv
    })

    models = models.filter(d => d.slug.name != '2023-03-30-04h50m24s')
    models = models.filter(d => d.slug_id != '2023-03-30-04h50m24s')

    models = _.sortBy(models, d => d.num_heads)
    models = _.sortBy(models, d => d.num_layers)
    // models = _.sortBy(models, d => d.MAE)
    models = _.sortBy(models, d => -d.sequence_length)

    var sel = d3.select(`.${sweepSlug}`).html('')
    sel.append('div')
      .st({width: 900})
      .appendMany('div', d3.nestBy(models, d => d.sequence_length))
      .st({marginBottom: 40}).append('h3').text(d => 'sequence_length ' + d.key).st({fontWeight: 800})
      .parent()
      .appendMany('div', d => d)
      .st({display: 'inline-block', width: 200, marginBottom: 20, padding: 5, outline: '1px solid #ccc', margin: 5})
      .each(function(d){
        d.slug_id = d.slug.name
        d.MAE = d3.round(d.MAE, 4)
        var keys = ['num_layers', 'num_heads', 'MAE', 'slug_id']
        d3.select(this).html(keys.map(key => `<div>${key}: <b>${d[key]}</b></div>`).join(''))
      })
  })
})()
