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
import { StateIter } from './state-iter';

// ----------------------------------------------------------------------------
// Randomness
// ----------------------------------------------------------------------------
/**
 * A library to create an iterable streams of random numbers from a given seed.
 * This allows deterministic random processes. Random numbers are floats
 * between 0 and 1.
 *
 * e.g.
 *
 * const initSeedValue = 42; // a random number seed
 * const s = makeRandomIter({ curSeedVal: initSeedValue });
 * console.log(s.random()); // generates the next value (between 0 and 1)
 * of the random sequence.
 *
 * const s2 = s.copy() // creates a parallel set of random numbers from s.
 */

export type RandomState = { curSeedVal: number };
// export type RandomStream = StateIter<RandomState, number>;

export class RandomStream extends StateIter<RandomState, number> {
  random(): number {
    return nextRandom(this.state);
  }
  uniformFloatInRange(min: number, max: number): number {
    return asFloatInRange(this.random(), min, max);
  }
  uniformIntInRange(min: number, max: number): number {
    return asIntInRange(this.random(), min, max);
  }
  randomEntryFromList<T>(l: T[]): T {
    return asEntryFromList(this.random(), l);
  }
  substream() {
    new RandomStream(substream(this.state), this.iterFn);
  }
}

export function asFloatInRange(
  zeroToOneNumber: number,
  min: number,
  max: number
): number {
  return min + zeroToOneNumber * (max - min);
}

export function asIntInRange(
  zeroToOneNumber: number,
  min: number,
  max: number
): number {
  return Math.floor(asFloatInRange(zeroToOneNumber, min, max));
}

export function asEntryFromList<T>(zeroToOneNumber: number, l: T[]): T {
  return l[Math.floor(zeroToOneNumber * l.length)];
}

// Note: Number.MAX_VALUE / 0x6D2B79F5 === 9.815061637986119e+298
// So, we have can generate up to 9.815061637986119e+298 numbers
// before things go wrong. e.g. in JS:
// Number.MAX_VALUE + 1 === Number.MAX_VALUE (tested 10 Mar 2023).
export function nextRandom(state: RandomState): number {
  state.curSeedVal += 0x6d2b79f5; // === 1831565813
  let x = state.curSeedVal;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61); // 61 = prime number.
  return ((x ^ (x >>> 14)) >>> 0) / 0x100000000; // 2 ^^ 32 === 4294967296
}

export function substream(state: RandomState) {
  return { curSeedVal: nextRandom(state) };
}

export function* randomItor(state: RandomState): Iterator<number> {
  while (true) {
    yield nextRandom(state);
  }
}

export function makeRandomStream(initState: {
  curSeedVal: number;
}): RandomStream {
  return new RandomStream(initState, randomItor);
}
