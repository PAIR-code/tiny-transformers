import { expect } from 'vitest';

export function expectArraysClose(
  actual: any,
  expected: any,
  epsilon = 0.001
) {
  const actualArr = flatten(actual);
  const expectedArr = flatten(expected);

  expect(actualArr.length).toBe(expectedArr.length);
  for (let i = 0; i < actualArr.length; i++) {
    const a = actualArr[i];
    const e = expectedArr[i];
    if (isNaN(a) && isNaN(e)) {
      continue;
    }
    const diff = Math.abs(a - e);
    if (diff > epsilon) {
      throw new Error(`expected ${a} to be close to ${e} +/- ${epsilon} (diff: ${diff}) at index ${i}`);
    }
  }
}

export function expectArraysEqual(
  actual: any,
  expected: any
) {
  const actualArr = flatten(actual);
  const expectedArr = flatten(expected);
  expect(actualArr).toEqual(expectedArr);
}

function flatten(val: any): number[] {
  if (val === null || val === undefined) {
    return [];
  }
  if (typeof val === 'number') {
    return [val];
  }
  if (Array.isArray(val)) {
    return val.reduce((acc, item) => acc.concat(flatten(item)), []);
  }
  if (val.dataSync && typeof val.dataSync === 'function') {
    return Array.from(val.dataSync());
  }
  if (val.arraySync && typeof val.arraySync === 'function') {
    return flatten(val.arraySync());
  }
  if (ArrayBuffer.isView(val)) {
    return Array.from(val as any);
  }
  return [val];
}
