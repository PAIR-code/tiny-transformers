/* Copyright 2026 Google LLC. All Rights Reserved.

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

import { describe, it, expect } from 'vitest';
import {
  CANONICAL_MNIST_SAMPLES,
  generateFontBasedMnistSample,
  generateSyntheticMnistDataset,
  extractPatches,
  loadRealMnistDataset
} from './mnist-data';

describe('MNIST Data Module', () => {
  it('should initialize canonical digit samples for digits 0-9', () => {
    expect(CANONICAL_MNIST_SAMPLES.length).toBe(10);
    for (let d = 0; d < 10; d++) {
      expect(CANONICAL_MNIST_SAMPLES[d].digit).toBe(d);
      expect(CANONICAL_MNIST_SAMPLES[d].pixels.length).toBe(784);
    }
  });

  it('should generate synthetic font samples with valid pixel dimensions', () => {
    const sample = generateFontBasedMnistSample(5);
    expect(sample.digit).toBe(5);
    expect(sample.pixels.length).toBe(784);
    expect(sample.pixels.every(p => p >= 0 && p <= 1)).toBe(true);
  });

  it('should generate a synthetic dataset of requested size', () => {
    const dataset = generateSyntheticMnistDataset(20);
    expect(dataset.length).toBe(20);
    expect(dataset[0].pixels.length).toBe(784);
  });

  it('should extract patch averages correctly for 4x4 grid', () => {
    const sample = CANONICAL_MNIST_SAMPLES[0];
    const patches = extractPatches(sample.pixels, 4);
    expect(patches.length).toBe(16);
    expect(patches.every(p => p >= 0 && p <= 1)).toBe(true);
  });

  it('should load real dataset or fallback to synthetic dataset gracefully', async () => {
    const samples = await loadRealMnistDataset(10);
    expect(samples.length).toBeGreaterThan(0);
    expect(samples[0].pixels.length).toBe(784);
  });
});
