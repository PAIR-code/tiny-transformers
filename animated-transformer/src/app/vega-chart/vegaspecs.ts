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


import * as vegaembed from 'vega-embed';

// export function populationSpec(data: { x: number, y: number, name: string }[])
//   : vegaembed.VisualizationSpec {
//   return {
//     '$schema': 'https://vega.github.io/schema/vega-lite/v3.json',
//     'width': 600,
//     'height': 200,
//     'padding': 0,
//     'description': 'x, y line chart, with many lines defined by `name`',
//     'data': { values: data },
//     'layer': [{
//       'mark': {
//         'type': 'rect',
//       },
//       'encoding': {
//         // 'filter': { 'field': 'actionId', 'equal': '0', },
//         'x': { 'field': 'colorRepId', 'type': 'ordinal' },
//         'y': { 'field': 'profileId', 'type': 'ordinal' },
//         'color': { 'field': 'color', 'type': 'quantitative' }
//       }
//     }]
//   };
// }

// export function historySpec(data: { step: number, loss: number, name: string }[])
//   : vegaembed.VisualizationSpec {
//   return {
//     '$schema': 'https://vega.github.io/schema/vega-lite/v3.json',
//     'width': 400,
//     'height': 200,
//     'padding': 0,
//     'description': 'x, y line chart, with many (colored) lines defined by `name`',
//     'data': data,
//     'layer': [{
//       'mark': {
//         'type': 'line',
//         'point': { 'fill': '#080', 'opacity': 0.8 },
//         'color': '#080',
//         'opacity': 0.8
//       },
//       'encoding': {
//         'x': { 'field': 'step', 'type': 'ordinal' },
//         'y': { 'field': 'loss', 'type': 'quantitative' },
//         'color': { 'field': 'name', 'type': 'nominal' }
//       }
//     }]
//   };
// }


export function lossSpec(data: { step: number, loss: number, name: string }[])
  : vegaembed.VisualizationSpec {
  return {
    '$schema': 'https://vega.github.io/schema/vega-lite/v4.json',
    'width': 400,
    'height': 200,
    'padding': 0,
    'description': 'x, y line chart, with many (colored) lines defined by `name`',
    'data': data,
    'layer': [{
      'mark': {
        'type': 'line',
        'point': { 'fill': '#080', 'opacity': 0.8 },
        'color': '#080',
        'opacity': 0.8
      },
      'encoding': {
        'x': { 'field': 'step', 'type': 'ordinal' },
        'y': { 'field': 'loss', 'type': 'quantitative' },
        'color': { 'field': 'name', 'type': 'nominal' }
      }
    }]
  };
}


export function accSpec(data: { step: number, acc: number, name: string }[])
  : vegaembed.VisualizationSpec {
  return {
    '$schema': 'https://vega.github.io/schema/vega-lite/v4.json',
    'width': 400,
    'height': 200,
    'padding': 0,
    'description': 'x, y line chart, with many (colored) lines defined by `name`',
    'data': data,
    'layer': [{
      'mark': {
        'type': 'line',
        'point': { 'fill': '#080', 'opacity': 0.8 },
        'color': '#080',
        'opacity': 0.8
      },
      'encoding': {
        'x': { 'field': 'step', 'type': 'ordinal' },
        'y': { 'field': 'acc', 'type': 'quantitative' },
        'color': { 'field': 'name', 'type': 'nominal' }
      }
    }]
  };
}
