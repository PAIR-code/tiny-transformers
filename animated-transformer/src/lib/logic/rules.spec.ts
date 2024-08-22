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
import { universalType } from './relations';
import { parseRule, stringifyRule } from './rules';

describe('rules', () => {
  beforeEach(() => {});

  it('parseRule: no conditions', () => {
    const {
      rel,
      op,
      score,
      posConditions: conditions,
    } = parseRule('S(squishes _x _y:animal) += 1');
    expect(rel.relName).toEqual('squishes');
    expect(rel.args[0].varName).toEqual('_x');
    expect(rel.args[0].varTypes).toEqual(new Set(universalType));
    expect(rel.args[1].varName).toEqual('_y');
    expect(rel.args[1].varTypes).toEqual(new Set(['animal']));
    expect(op).toEqual('+=');
    expect(score).toEqual(1.0);
    expect(conditions).toEqual([]);
  });

  it('parseRule: one condition', () => {
    const {
      rel,
      op,
      score,
      posConditions: conditions,
    } = parseRule('S(squishes _x _y | jumps-over _x:monkey _y:flower) += 1');
    expect(rel.relName).toEqual('squishes');
    expect(rel.args[0].varName).toEqual('_x');
    expect(rel.args[0].varTypes).toEqual(new Set(universalType));
    expect(rel.args[1].varName).toEqual('_y');
    expect(rel.args[1].varTypes).toEqual(new Set(universalType));
    expect(op).toEqual('+=');
    expect(score).toEqual(1.0);
    expect(conditions.length).toEqual(1);
    expect(conditions[0].relName).toEqual('jumps-over');
    expect(conditions[0].args[0]).toEqual({ varName: '_x', varTypes: new Set(['monkey']) });
    expect(conditions[0].args[1]).toEqual({ varName: '_y', varTypes: new Set(['flower']) });
  });

  it('parseRule: one condition, no types', () => {
    const {
      rel,
      op,
      score,
      posConditions: conditions,
    } = parseRule('S(squishes ?x ?y | jumps-over ?x ?y) += 1');
    expect(rel.relName).toEqual('squishes');
    expect(rel.args[0].varName).toEqual('?x');
    expect(rel.args[0].varTypes).toEqual(new Set(universalType));
    expect(rel.args[1].varName).toEqual('?y');
    expect(rel.args[1].varTypes).toEqual(new Set(universalType));
    expect(op).toEqual('+=');
    expect(score).toEqual(1.0);
    expect(conditions.length).toEqual(1);
    expect(conditions[0].relName).toEqual('jumps-over');
    expect(conditions[0].args[0]).toEqual({ varName: '?x', varTypes: new Set(universalType) });
    expect(conditions[0].args[1]).toEqual({ varName: '?y', varTypes: new Set(universalType) });
  });

  // TODO: maybe no varType can mean any time, and we can skip the explicit type of all types?
  it('parseRule: 3 conditions', () => {
    const {
      rel,
      op,
      score,
      posConditions: conditions,
    } = parseRule(`
    S(squishes _x _y 
    | jumps-over _x _y, jumps-over _x _y, jumps-over _x _y) *= 0
    `);
    expect(rel.relName).toEqual('squishes');
    expect(rel.args[0]).toEqual({ varName: '_x', varTypes: new Set(universalType) });
    expect(rel.args[1]).toEqual({ varName: '_y', varTypes: new Set(universalType) });
    expect(op).toEqual('*=');
    expect(score).toEqual(0);
    expect(conditions.length).toEqual(3);
    expect(conditions[0].relName).toEqual('jumps-over');
    expect(conditions[0].args[0]).toEqual({ varName: '_x', varTypes: new Set(['*']) });
    expect(conditions[0].args[1]).toEqual({ varName: '_y', varTypes: new Set(['*']) });
    expect(conditions[1].relName).toEqual('jumps-over');
    expect(conditions[1].args[0]).toEqual({ varName: '_x', varTypes: new Set(['*']) });
    expect(conditions[1].args[1]).toEqual({ varName: '_y', varTypes: new Set(['*']) });
    expect(conditions[2].relName).toEqual('jumps-over');
    expect(conditions[2].args[0]).toEqual({ varName: '_x', varTypes: new Set(['*']) });
    expect(conditions[2].args[1]).toEqual({ varName: '_y', varTypes: new Set(['*']) });
  });

  // TODO: maybe no varType can mean any time, and we can skip the explicit type of all types?
  it('parseRule: 3 conditions and one neg', () => {
    const { rel, op, score, posConditions, negConditions } = parseRule(`
    S(squishes _x _y 
    | jumps-over _x _y, jumps-over _x _y, -is _y, jumps-over _x _y) *= 0
    `);
    expect(rel.relName).toEqual('squishes');
    expect(rel.args[0]).toEqual({ varName: '_x', varTypes: new Set(['*']) });
    expect(rel.args[1]).toEqual({ varName: '_y', varTypes: new Set(['*']) });
    expect(op).toEqual('*=');
    expect(score).toEqual(0);
    expect(posConditions.length).toEqual(3);
    expect(posConditions[0].relName).toEqual('jumps-over');
    expect(posConditions[0].args[0]).toEqual({ varName: '_x', varTypes: new Set(['*']) });
    expect(posConditions[0].args[1]).toEqual({ varName: '_y', varTypes: new Set(['*']) });
    expect(posConditions[1].relName).toEqual('jumps-over');
    expect(posConditions[1].args[0]).toEqual({ varName: '_x', varTypes: new Set(['*']) });
    expect(posConditions[1].args[1]).toEqual({ varName: '_y', varTypes: new Set(['*']) });
    expect(posConditions[2].relName).toEqual('jumps-over');
    expect(posConditions[2].args[0]).toEqual({ varName: '_x', varTypes: new Set(['*']) });
    expect(posConditions[2].args[1]).toEqual({ varName: '_y', varTypes: new Set(['*']) });
    expect(negConditions.length).toEqual(1);
    expect(negConditions[0].relName).toEqual('is');
    expect(negConditions[0].args[0]).toEqual({ varName: '_y', varTypes: new Set(['*']) });
  });

  // TODO: maybe no varType can mean any time, and we can skip the explicit type of all types?
  it('print and parseRule symmetry', () => {
    const initRuleStr = `S(squishes _x _y | jumps-over _x _y, jumps-over _x _y, jumps-over _x _y) *= 0`;
    const rule = parseRule(initRuleStr);
    const parsedRuleStr = stringifyRule(rule);
    expect(parsedRuleStr).toEqual(initRuleStr);
  });
});
