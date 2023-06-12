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


import { Component, OnInit, Input } from '@angular/core';
import * as vegaembed from 'vega-embed';

// Maybe update to the style of:
// https://github.com/kristina-albrecht/angular5-vega-examples/blob/master/src/app/vega-viz/vega-viz.component.ts
// import * as vega from 'vega';
// {View, Parse, parse, Spec}
@Component({
  selector: 'app-vega-chart',
  templateUrl: './vega-chart.component.html',
  styleUrls: ['./vega-chart.component.scss']
})
export class VegaChartComponent implements OnInit {
  onceHistroyVegaResult?: Promise<vegaembed.Result>;
  @Input() spec?: vegaembed.VisualizationSpec;
  lastDataLen = 0;

  // TODO: figure out the right way to tie into Angular's event/update loop.
  // Maybe a setter for the
  // data?
  @Input()
  set data(value: {}[]) {
    if (!this.spec) {
      console.error('data was set, but there was no spec.');
      return;
    }
    if (!this.onceHistroyVegaResult) {
      this.spec.data = { values: value };
      return;
    }

    this.onceHistroyVegaResult.then(res => {
      const changeset = vegaembed.vega.changeset()
        .remove(() => true)
        .insert(value);
      // For some reason source_0 is the default dataset name
      res.view.change('source_0', changeset).run();
      // if (this.lastDataLen === 0) {
      res.view.resize();
      // }
      this.lastDataLen = value.length
    });

  };

  constructor() { }
  ngOnInit() {
    if (this.spec) {
      this.onceHistroyVegaResult = vegaembed.default('#vegaembed', this.spec);
    }
  }
}


