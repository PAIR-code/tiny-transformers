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

export interface MnistSample {
  digit: number; // 0-9
  label: string; // '0', '1', ..., '9'
  pixels: number[]; // 784 numbers (28x28), values 0.0 to 1.0
  source?: 'canonical' | 'synthetic-font' | 'real-mnist';
}

const MNIST_IMAGES_SPRITE_URL = 'https://storage.googleapis.com/learnjs-data/model-builder/mnist_images.png';
const MNIST_LABELS_URL = 'https://storage.googleapis.com/learnjs-data/model-builder/mnist_labels_uint8';

/**
 * Helper to generate 28x28 canonical digit bitmaps procedurally.
 */
function createDigitBitmap(digit: number): number[] {
  const pixels = new Array(784).fill(0);
  const getIndex = (r: number, c: number) => r * 28 + c;

  const setPixel = (r: number, c: number, val: number = 1.0) => {
    if (r >= 0 && r < 28 && c >= 0 && c < 28) {
      const idx = getIndex(r, c);
      pixels[idx] = Math.max(pixels[idx], val);
    }
  };

  const drawLine = (r0: number, c0: number, r1: number, c1: number, thickness: number = 1.8) => {
    const dist = Math.hypot(r1 - r0, c1 - c0);
    const steps = Math.max(1, Math.ceil(dist * 2));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const r = r0 + t * (r1 - r0);
      const c = c0 + t * (c1 - c0);
      const rMin = Math.floor(r - thickness);
      const rMax = Math.ceil(r + thickness);
      const cMin = Math.floor(c - thickness);
      const cMax = Math.ceil(c + thickness);
      for (let rr = rMin; rr <= rMax; rr++) {
        for (let cc = cMin; cc <= cMax; cc++) {
          const d = Math.hypot(rr - r, cc - c);
          if (d <= thickness) {
            const alpha = Math.max(0, 1 - d / thickness);
            setPixel(rr, cc, alpha);
          }
        }
      }
    }
  };

  const drawArc = (
    centerR: number,
    centerC: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    thickness: number = 1.8
  ) => {
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const angle = startAngle + (i / steps) * (endAngle - startAngle);
      const r = centerR + radius * Math.sin(angle);
      const c = centerC + radius * Math.cos(angle);
      const rMin = Math.floor(r - thickness);
      const rMax = Math.ceil(r + thickness);
      const cMin = Math.floor(c - thickness);
      const cMax = Math.ceil(c + thickness);
      for (let rr = rMin; rr <= rMax; rr++) {
        for (let cc = cMin; cc <= cMax; cc++) {
          const d = Math.hypot(rr - r, cc - c);
          if (d <= thickness) {
            const alpha = Math.max(0, 1 - d / thickness);
            setPixel(rr, cc, alpha);
          }
        }
      }
    }
  };

  switch (digit) {
    case 0:
      drawArc(14, 14, 8, 0, Math.PI * 2, 2.0);
      break;
    case 1:
      drawLine(6, 12, 6, 14, 1.8);
      drawLine(6, 14, 22, 14, 2.0);
      drawLine(22, 10, 22, 18, 1.8);
      break;
    case 2:
      drawArc(10, 14, 5.5, -Math.PI * 0.5, Math.PI * 0.4, 1.8);
      drawLine(13, 18, 22, 9, 2.0);
      drawLine(22, 9, 22, 19, 2.0);
      break;
    case 3:
      drawArc(10, 14, 4.5, -Math.PI * 0.6, Math.PI * 0.5, 1.8);
      drawArc(18, 14, 5.0, -Math.PI * 0.4, Math.PI * 0.7, 1.8);
      break;
    case 4:
      drawLine(6, 17, 17, 7, 1.8);
      drawLine(17, 7, 17, 21, 2.0);
      drawLine(11, 17, 22, 17, 2.0);
      break;
    case 5:
      drawLine(7, 19, 7, 10, 2.0);
      drawLine(7, 10, 13, 10, 2.0);
      drawArc(17, 14, 5.0, -Math.PI * 0.4, Math.PI * 0.7, 1.8);
      break;
    case 6:
      drawLine(8, 18, 15, 10, 1.8);
      drawArc(17, 14, 5.0, 0, Math.PI * 2, 1.8);
      break;
    case 7:
      drawLine(7, 8, 7, 20, 2.0);
      drawLine(7, 20, 22, 11, 2.0);
      break;
    case 8:
      drawArc(10, 14, 4.5, 0, Math.PI * 2, 1.8);
      drawArc(18, 14, 5.5, 0, Math.PI * 2, 1.8);
      break;
    case 9:
      drawArc(11, 14, 5.0, 0, Math.PI * 2, 1.8);
      drawLine(11, 19, 22, 12, 2.0);
      break;
  }

  return pixels;
}

export const CANONICAL_MNIST_SAMPLES: MnistSample[] = Array.from({ length: 10 }, (_, digit) => ({
  digit,
  label: `${digit}`,
  pixels: createDigitBitmap(digit),
  source: 'canonical',
}));

const SYSTEM_FONTS = [
  'Arial',
  'Times New Roman',
  'Courier New',
  'Georgia',
  'Impact',
  'Trebuchet MS',
  'Verdana'
];

/**
 * Generate a synthetic sample using HTML5 Offscreen/HTML Canvas with font variations and spatial transformations.
 */
export function generateFontBasedMnistSample(digit: number): MnistSample {
  if (typeof document === 'undefined') {
    return generateNoisyMnistSample(digit);
  }

  const canvas = document.createElement('canvas');
  canvas.width = 28;
  canvas.height = 28;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return generateNoisyMnistSample(digit);
  }

  // Clear to black
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 28, 28);

  const fontName = SYSTEM_FONTS[Math.floor(Math.random() * SYSTEM_FONTS.length)];
  const fontSize = 20 + Math.floor(Math.random() * 6); // 20px to 25px
  const angle = (Math.random() - 0.5) * (Math.PI / 6); // -15 deg to +15 deg
  const dx = (Math.random() - 0.5) * 4;
  const dy = (Math.random() - 0.5) * 4;

  ctx.save();
  ctx.translate(14 + dx, 14 + dy);
  ctx.rotate(angle);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${fontSize}px ${fontName}, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(digit.toString(), 0, 0);
  ctx.restore();

  const imgData = ctx.getImageData(0, 0, 28, 28);
  const pixels: number[] = new Array(784);
  const data = imgData.data;

  for (let i = 0; i < 784; i++) {
    // Red channel / alpha normalized to 0..1
    let val = data[i * 4] / 255;
    // Add subtle pixel noise
    if (Math.random() < 0.05) {
      val = Math.max(0, Math.min(1, val + (Math.random() - 0.5) * 0.2));
    }
    pixels[i] = val;
  }

  return { digit, label: `${digit}`, pixels, source: 'synthetic-font' };
}

/**
 * Generate a noisy sample of a digit for training/validation.
 */
export function generateNoisyMnistSample(digit: number, noiseLevel: number = 0.15): MnistSample {
  const base = CANONICAL_MNIST_SAMPLES[digit].pixels;
  const pixels = base.map((p) => {
    if (Math.random() < noiseLevel) {
      const shift = (Math.random() - 0.5) * 0.4;
      return Math.max(0, Math.min(1, p + shift));
    }
    return p;
  });
  return { digit, label: `${digit}`, pixels, source: 'canonical' };
}

/**
 * Generate a synthetic dataset of N MNIST samples with font variations & programmatic adjustments.
 */
export function generateSyntheticMnistDataset(numSamples: number = 100): MnistSample[] {
  const dataset: MnistSample[] = [];
  for (let i = 0; i < numSamples; i++) {
    const digit = i % 10;
    dataset.push(generateFontBasedMnistSample(digit));
  }
  return dataset;
}

// In-memory cache for real MNIST dataset samples once loaded
let cachedRealMnistSamples: MnistSample[] | null = null;

/**
 * Asynchronously fetch and parse real MNIST dataset samples from Web Storage URLs.
 */
export async function loadRealMnistDataset(numSamples: number = 200): Promise<MnistSample[]> {
  if (cachedRealMnistSamples && cachedRealMnistSamples.length >= numSamples) {
    return cachedRealMnistSamples.slice(0, numSamples);
  }

  try {
    // Fetch labels buffer
    const labelsResp = await fetch(MNIST_LABELS_URL);
    if (!labelsResp.ok) {
      throw new Error(`Failed to fetch MNIST labels: ${labelsResp.statusText}`);
    }
    const labelsBuf = new Uint8Array(await labelsResp.arrayBuffer());

    // Fetch images sprite sheet
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = MNIST_IMAGES_SPRITE_URL;

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (err) => reject(err);
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context not available');
    }
    ctx.drawImage(img, 0, 0);

    const imgData = ctx.getImageData(0, 0, img.width, img.height);
    const data = imgData.data;

    // Total images in sprite sheet (sprite sheet is 28x28 per image)
    const numImagesTotal = labelsBuf.length / 10; // 1-hot vectors of size 10
    const limit = Math.min(numSamples, Math.floor(numImagesTotal));

    const realSamples: MnistSample[] = [];
    const imageSize = 784;

    for (let i = 0; i < limit; i++) {
      // Find digit class index from 1-hot vector
      let label = 0;
      for (let k = 0; k < 10; k++) {
        if (labelsBuf[i * 10 + k] === 1) {
          label = k;
          break;
        }
      }

      const pixels: number[] = new Array(imageSize);
      const offset = i * imageSize * 4;

      for (let j = 0; j < imageSize; j++) {
        pixels[j] = data[offset + j * 4] / 255;
      }

      realSamples.push({
        digit: label,
        label: `${label}`,
        pixels,
        source: 'real-mnist'
      });
    }

    cachedRealMnistSamples = realSamples;
    return realSamples;
  } catch (err) {
    console.warn('Real MNIST dataset fetch failed, falling back to synthetic dataset:', err);
    return generateSyntheticMnistDataset(numSamples);
  }
}

/**
 * Extract patch intensities (e.g. 16 patches of 7x7 pixels in a 4x4 grid).
 */
export function extractPatches(pixels: number[], gridSize: number = 4): number[] {
  const patchDim = 28 / gridSize;
  const patchMeans: number[] = [];

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      let sum = 0;
      let count = 0;
      for (let pr = 0; pr < patchDim; pr++) {
        for (let pc = 0; pc < patchDim; pc++) {
          const pixelR = r * patchDim + pr;
          const pixelC = c * patchDim + pc;
          sum += pixels[pixelR * 28 + pixelC];
          count++;
        }
      }
      patchMeans.push(sum / count);
    }
  }

  return patchMeans;
}
