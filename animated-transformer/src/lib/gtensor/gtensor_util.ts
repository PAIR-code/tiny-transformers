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


import { ValueError, GTensor, DName, Dims, Dimension } from './gtensor';

export function range(start: number, end: number, inc?: number): number[] {
  if (!inc) {
    inc = 1;
  }
  const rangeValues: number[] = [];
  for (let i = start; i < end; i += inc) {
    rangeValues.push(i);
  }
  return rangeValues;
}

// start and end are inclusive.
export function grid(start: number[], end: number[], inc: number[]): number[][] {
  if (start.length !== inc.length || end.length !== inc.length) {
    throw new ValueError('All arguments much have the same array size.');
  }

  const gridValues = [start];
  const current = [...start];
  let i = 0;
  while (i < current.length) {

    // Carry case.
    const carryStart = i;
    while (current[i] + inc[i] > end[i] && i < current.length) {
      i += 1;
    }
    if (i < current.length) {
      current[i] = current[i] + inc[i];
      for (let j = carryStart; j < i; j++) {
        current[j] = start[j];
      }
      gridValues.push([...current]);
      i = 0;
    }
  }

  return gridValues;
}
