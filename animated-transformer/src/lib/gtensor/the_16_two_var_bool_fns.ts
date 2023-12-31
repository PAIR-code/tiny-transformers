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


import * as gtensor from './gtensor';
import * as tf from '@tensorflow/tfjs'

const basicGatesAsArrays: { name: string, arr: number[][] }[] = [
  {
    name: 'gate00_c_0', arr: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 0, 0],
      [1, 1, 0],
    ]
  },
  {
    name: 'gate01_AND', arr: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 0, 0],
      [1, 1, 1],
    ]
  },
  {
    name: 'gate02_a_and_not_b', arr: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 0, 1],
      [1, 1, 0],
    ]
  },
  {
    name: 'gate03_a', arr: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 0, 1],
      [1, 1, 1],
    ]
  },
  {
    name: 'gate04_b_and_not_a', arr: [
      [0, 0, 0],
      [0, 1, 1],
      [1, 0, 0],
      [1, 1, 0],
    ]
  },
  {
    name: 'gate05_b', arr: [
      [0, 0, 0],
      [0, 1, 1],
      [1, 0, 0],
      [1, 1, 1],
    ]
  },
  {
    name: 'gate06_xor', arr: [
      [0, 0, 0],
      [0, 1, 1],
      [1, 0, 1],
      [1, 1, 0],
    ]
  },
  {
    name: 'gate07_or', arr: [
      [0, 0, 0],
      [0, 1, 1],
      [1, 0, 1],
      [1, 1, 1],
    ]
  },
  {
    name: 'gate08_not_or', arr: [
      [0, 0, 1],
      [0, 1, 0],
      [1, 0, 0],
      [1, 1, 0],
    ]
  },
  {
    name: 'gate09_not_xor', arr: [
      [0, 0, 1],
      [0, 1, 0],
      [1, 0, 0],
      [1, 1, 1],
    ]
  },
  {
    name: 'gate10_not_b', arr: [
      [0, 0, 1],
      [0, 1, 0],
      [1, 0, 1],
      [1, 1, 0],
    ]
  },
  {
    name: 'gate11_a_and_not_b', arr: [
      [0, 0, 1],
      [0, 1, 0],
      [1, 0, 1],
      [1, 1, 1],
    ]
  },
  {
    name: 'gate12_not_a', arr: [
      [0, 0, 1],
      [0, 1, 1],
      [1, 0, 0],
      [1, 1, 0],
    ]
  },
  {
    name: 'gate13_not_a_or_b', arr: [
      [0, 0, 1],
      [0, 1, 1],
      [1, 0, 0],
      [1, 1, 1],
    ]
  },
  {
    name: 'gate14_not_and', arr: [
      [0, 0, 1],
      [0, 1, 1],
      [1, 0, 1],
      [1, 1, 0],
    ]
  },
  {
    name: 'gate15_c_1', arr: [
      [0, 0, 1],
      [0, 1, 1],
      [1, 0, 1],
      [1, 1, 1],
    ]
  }
];

function mkInputOutputDataset() {
  for (let e of basicGatesAsArrays) {
    e.arr
  }
}

export interface TwoVarBoolListDataset {
  name: string,
  inputs: [[number, number], [number, number],
    [number, number], [number, number]],
  outputs: [[number], [number], [number], [number]]
}

export const xorListDataset: TwoVarBoolListDataset = {
  name: 'gate07_xor',
  inputs: [[0, 0], [0, 1], [1, 0], [1, 1]],
  outputs: [[0], [1], [1], [0]],
};

export interface TwoVarGTensorDataset {
  name: string;
  inputs: gtensor.GTensor<'example' | 'inputRepSize'>;
  outputs: gtensor.GTensor<'example' | 'outputRepSize'>;
}

export const xorGTensorDataset: TwoVarGTensorDataset = {
  name: xorListDataset.name,
  inputs: new gtensor.GTensor(tf.tensor(xorListDataset.inputs),
    ['example', 'inputRepSize']),
  outputs: new gtensor.GTensor(tf.tensor(xorListDataset.outputs),
    ['example', 'outputRepSize'])
}

export const basicGatesAsIoArrays =
  basicGatesAsArrays.map(d => {
    return {
      name: d.name,
      inputs: d.arr.map(a => [a[0], a[1]]),
      outputs: d.arr.map(a => [a[2]])
    }
  }) as TwoVarBoolListDataset[];

export const basicGatesAsGTensor: TwoVarGTensorDataset[] =
  basicGatesAsArrays.map(d => {
    return {
      name: d.name,
      inputs: new gtensor.GTensor(tf.tensor(d.arr.map(a => [a[0], a[1]])),
        ['example', 'inputRepSize']),
      outputs: new gtensor.GTensor(tf.tensor(d.arr.map(a => [a[2]])),
        ['example', 'outputRepSize']),
    }
  });

export const basicGatesMap: { [name: string]: TwoVarGTensorDataset } = {};
basicGatesAsGTensor.forEach(ds => basicGatesMap[ds.name] = ds);
