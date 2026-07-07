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
import { parseToRational, simplify } from './berkovich';
import {
  PadicPoint,
  BerkovichPoint,
  ShiftOperator,
  ScaleOperator,
  SquareOperator,
  CubeOperator,
  AdditionOperator,
  MultiplicationOperator,
  SoftmaxOperator
} from './berkovich_gradients';

describe('Berkovich OOP Library', () => {
  it('should wrap and stringify PadicPoint correctly', () => {
    const p1 = new PadicPoint(parseToRational('5/3'));
    expect(p1.toString()).toBe('5/3');
    expect(p1.toFormatString(3n)).toBe('01.20');
  });

  it('should compute valuation distance correctly in BerkovichPoint', () => {
    const pt = new BerkovichPoint(parseToRational('1'), 0);
    const target = parseToRational('4'); // 1 - 4 = -3 -> valuation is 1 in base 3
    const dist = pt.valuationDistanceTo(target, 3n);
    expect(dist).toEqual({ type: 'finite', value: -1 });
  });

  it('should step Unary Operators using ShiftOperator', () => {
    const p = 3n;
    const targetY = parseToRational('3');
    const startX = new BerkovichPoint(parseToRational('1'), 0.0);
    const op = new ShiftOperator();

    const res = op.step(startX, targetY, p, 0.2);
    expect(res.nextX.center).toEqual(parseToRational('2'));
    expect(res.nextX.rho).toBeCloseTo(-0.2);
    expect(res.loss).toBeCloseTo(2.0); // |rho - d| + d - y_rho = |0 - 0| + 0 - (-2.0) = 2.0
  });

  it('should step Unary Operators using ScaleOperator', () => {
    const p = 3n;
    const targetY = parseToRational('3');
    const startX = new BerkovichPoint(simplify({ num: 1n, den: 3n }), 0.0);
    const op = new ScaleOperator(simplify({ num: 3n, den: 1n }));

    const res = op.step(startX, targetY, p, 0.2);
    expect(res.nextX.center).toEqual(simplify({ num: 1n, den: 3n }));
    expect(res.nextX.rho).toBeCloseTo(0.2);
  });

  it('should step Unary Operators using SquareOperator', () => {
    const p = 3n;
    const targetY = parseToRational('4');
    const startX = new BerkovichPoint(parseToRational('1'), 0.0);
    const op = new SquareOperator();

    const res = op.step(startX, targetY, p, 0.2);
    expect(res.nextX.center).toEqual(parseToRational('1'));
    expect(res.nextX.rho).toBeCloseTo(-0.2);
  });

  it('should step Binary Operators using AdditionOperator', () => {
    const p = 3n;
    const targetY = parseToRational('5/3');
    const startX1 = new BerkovichPoint(parseToRational('0'), 0.0);
    const startX2 = new BerkovichPoint(parseToRational('1'), -1.0);
    const op = new AdditionOperator();

    const res = op.step(startX1, startX2, targetY, p, 0.2, 'exact-per-coord');
    expect(res.nextX1.center).toEqual(parseToRational('0'));
    expect(res.nextX1.rho).toBeCloseTo(0.2);
  });

  it('should step Binary Operators using MultiplicationOperator', () => {
    const p = 3n;
    const targetY = parseToRational('3');
    const startX1 = new BerkovichPoint(parseToRational('1'), 0.0);
    const startX2 = new BerkovichPoint(parseToRational('3'), 0.0);
    const op = new MultiplicationOperator();

    const res = op.step(startX1, startX2, targetY, p, 0.2, 'exact-per-coord');
    expect(res.nextX1.center).toEqual(parseToRational('3'));
  });

  it('should step SoftmaxOperator', () => {
    const p = 3n;
    const targetY = parseToRational('3');
    const startX1 = new BerkovichPoint(parseToRational('1'), 0.0);
    const startX2 = new BerkovichPoint(parseToRational('3'), 0.0);
    const op = new SoftmaxOperator(1.0);

    const res = op.step(startX1, startX2, targetY, p, 0.2);
    expect(res.nextX1.center).toBeDefined();
  });
});
