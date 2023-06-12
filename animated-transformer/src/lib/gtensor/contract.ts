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


import * as tf from '@tensorflow/tfjs';
import { Tensor } from '@tensorflow/tfjs';

export type DName = string | number | symbol;

const FIRST_CHAR_CODE = 'A'.charCodeAt(0);

// Captures the contraction behaviour for two tensors, and can express it as an
// einsum strings, along with the co-contractions (to get da and db).
export class ContractSpec<
  A extends DName, B extends DName, C extends A & B>
{
  public aCharNames: string[];
  public bCharNames: string[];
  public contractCharNames: string[];
  public contractSet: Set<C>;
  public resultNames: Exclude<A | B, C>[];

  // Assumes: ALL n. n in contractOn ==> n in aNames && a in bNames.
  constructor(
    aNames: A[], bNames: B[], public contractOn: C[]
  ) {
    // CONSIDER: definsive check could be removed to speed up code.
    // Checks assumption: ALL n. n in contractOn ==> n in aNames && a in bNames
    const aNameSet = new Set<A | C>(aNames);
    const bNameSet = new Set<B | C>(bNames);
    const contractCharSet = new Set<string>();
    this.contractSet = new Set(contractOn);
    contractOn.forEach(n => {
      if (!aNameSet.has(n)) {
        throw new Error(`${String(n)} should be in aNames: ${aNames}`);
      } else if (!bNameSet.has(n)) {
        throw new Error(`${String(n)} should be in bNames: ${bNames}`);
      }
    });
    const charInvMap = new Map<string, A | B>();

    const aNameCharMap = new Map<DName, string>();
    this.aCharNames = aNames.map(
      (n, i) => {
        const charName = String.fromCharCode(FIRST_CHAR_CODE + i);
        aNameCharMap.set(n, charName);
        charInvMap.set(charName, n);
        if (this.contractSet.has(n as never as C)) {
          contractCharSet.add(charName);
        }
        return charName;
      });
    const aNameCharSet = new Set(this.aCharNames);
    const bFirstCharCode = FIRST_CHAR_CODE + this.aCharNames.length;

    let j = 0;
    this.bCharNames = bNames.map(
      (n) => {
        let bName = aNameCharMap.get(n);
        if (!bName) {
          bName = String.fromCharCode(bFirstCharCode + j++);
        }
        charInvMap.set(bName, n);
        return bName;
      });
    this.contractCharNames = this.aCharNames
      .filter(c => !contractCharSet.has(c))
      .concat(this.bCharNames.filter(c => !aNameCharSet.has(c)));

    this.resultNames = this.contractCharNames.map(c =>
      charInvMap.get(c) as Exclude<A | B, C>);

    if ((this.aCharNames.length + j) > 52) {
      console.warn('too many dimensions for einsum, things may go wrong...');
      console.warn(`${this.aCharNames.join('')},${this.bCharNames.join('')}->${this.contractCharNames.join('')}`);
    }
  }

  public einsumContractStr(): string {
    return `${this.aCharNames.join('')},${this.bCharNames.join('')}->${this.contractCharNames.join('')}`;
  }

  public einsumCocontractStrs(): [string, string] {
    return [
      `${this.bCharNames.join('')},${this.contractCharNames.join('')}->${this.aCharNames.join('')}`,
      `${this.aCharNames.join('')},${this.contractCharNames.join('')}->${this.bCharNames.join('')}`
    ];
  }
}

type CustomGradFunc = (dy: Tensor, saved: Tensor[]) => Tensor | Tensor[];

// tf.registerGradient(contractGradConfig);
function makeGradFn_<A extends DName, B extends DName, C extends A & B>(
  spec: ContractSpec<A, B, C>
): CustomGradFunc {
  function gradFn(dy: Tensor, saved: Tensor[]): Tensor[] {
    const [a, b, y] = saved;
    const [einsumDaStr, einsumDbStr] = spec.einsumCocontractStrs();
    const da = tf.einsum(einsumDaStr, b, dy);
    const db = tf.einsum(einsumDbStr, a, dy);
    return [da, db];
  }
  return gradFn;
}

function contractOp_<A extends DName, B extends DName, C extends A & B>(
  xa: Tensor, xb: Tensor,
  // Index pairs is a set of pairs of indexes to contract against.
  // The dimensionality of each index m
  spec: ContractSpec<A, B, C>
  // commonIndexes: IndexPair[]
  // contractIndexes: IndexPair[]
): Tensor {

  const customOp = tf.customGrad((ax, bx, savefn) => {
    const a = ax as tf.Tensor;
    const b = bx as tf.Tensor;
    const save = savefn as tf.GradSaveFunc;
    const y = tf.einsum(spec.einsumContractStr(), xa, xb);
    save([a, b, y]);
    return {
      value: y,
      gradFunc: makeGradFn_(spec)
    };
  });

  return customOp(xa, xb);
}

export const contract = tf.op({ contractOp_ });
