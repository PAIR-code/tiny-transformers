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


// --------------------------------------------------------------------------
/* Some ideas for special layout algorithms.

Intended to be used with Tubes make very fancy auto-formatting.

Unused
---------------------------------------------------------------------------- */


function arraySum(arr: number[]): number {
  let sum = 0;
  arr.forEach(n => { sum += n; });
  return sum;
}

export function gridLayoutColumnSizes(
  rawLengths: number[], columnsCount: number
): number[] {
  const columnWidths: number[] = new Array(columnsCount);
  for (let i = 0; i < columnsCount; i++) {
    columnWidths[i] = 0;
  }

  for (let i = 0; i < rawLengths.length; i++) {
    const columnPos = i % columnsCount;
    columnWidths[columnPos] = Math.max(columnWidths[columnPos], rawLengths[i]);
  }

  return columnWidths;
}

function columnsWidthSum(columnWidths: number[], sepLen: number,): number {
  return arraySum(columnWidths) + (columnWidths.length - 1) * sepLen;
}

export function gridLayoutToMaxWidth(
  rawLengths: number[], sepLen: number, maxWidth: number
): number[] {
  // This is a niave generate and test implementation (tries each size).
  // There is a more efficient algorithm that does a single pass.
  let numColumns = rawLengths.length;
  let columnWidths = gridLayoutColumnSizes(rawLengths, numColumns);
  while (columnsWidthSum(columnWidths, sepLen) > maxWidth && numColumns > 1) {
    numColumns -= 1;
    columnWidths = gridLayoutColumnSizes(rawLengths, numColumns);
  }
  return columnWidths;
}
