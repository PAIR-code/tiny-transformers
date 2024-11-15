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

/// <reference lib="webworker" />

import { ValueStruct, CellSpec } from './cell-types';
import { SignalCell } from './signal-cell';

export function workerCell<
  Inputs extends ValueStruct = {},
  InputStreams extends ValueStruct = {},
  Outputs extends ValueStruct = {},
  OutputStreams extends ValueStruct = {}
>(
  spec: CellSpec<Inputs, InputStreams, Outputs, OutputStreams>
): SignalCell<Inputs, InputStreams, Outputs, OutputStreams> {
  const cell = new SignalCell<Inputs, InputStreams, Outputs, OutputStreams>(spec, postMessage);
  addEventListener('message', (m) => cell.onMessage(m));
  return cell;
}
