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

import { stringifyRule } from '../logic/rules';
import {
  TinyWorldTask,
  TinyWorldTaskConfig,
  bayesianV1TinyWorldTaskConfig,
  defaultTinyWorldTaskConfig,
} from './tiny_worlds';

describe('tiny_worlds', () => {
  beforeEach(() => {});

  it('test_bayesianV1TinyWorldTaskConfig', () => {
    const initConfig = { ...bayesianV1TinyWorldTaskConfig };
    const len = 1500; // sample many for counting
    initConfig.maxInputLen = len;
    initConfig.maxOutputLen = 1;
    const tinyWorld = new TinyWorldTask(initConfig);
    const [example] = tinyWorld.exampleIter.takeOutN(1);

    function count<T>(list: T[], elem: T) {
      return list.filter((x: T) => x === elem).length;
    }
    const input_count_i0 = count(example.input, 'i0');
    const input_count_11 = count(example.input, 'i1');
    const input_count_ratio = (input_count_i0 * 1.0) / input_count_11;
    const mean = 0.5,
      eps = 0.05; // eps is determined by len
    expect(input_count_ratio).toBeGreaterThanOrEqual(mean - eps);
    expect(input_count_ratio).toBeLessThanOrEqual(mean + eps);
  });

  it('genRandExampleWithSameAndDifferentSeeds', () => {
    const commonConfig: TinyWorldTaskConfig = {
      ...defaultTinyWorldTaskConfig,
      maxInputLen: 100,
      maxOutputLen: 1,
    };
    const initConfig_1: TinyWorldTaskConfig = { ...commonConfig, seed: 0 };
    const initConfig_2: TinyWorldTaskConfig = { ...commonConfig, seed: 0 };
    const initConfig_3: TinyWorldTaskConfig = { ...commonConfig, seed: 1 };

    const tinyWorld_1 = new TinyWorldTask(initConfig_1);
    const tinyWorld_2 = new TinyWorldTask(initConfig_2);
    const tinyWorld_3 = new TinyWorldTask(initConfig_3);
    const [example_1] = tinyWorld_1.exampleIter.takeOutN(1);
    const [example_2] = tinyWorld_2.exampleIter.takeOutN(1);
    const [example_3] = tinyWorld_3.exampleIter.takeOutN(1);

    expect(example_1.input.join('')).toEqual(example_2.input.join(''));
    expect(example_1.input.join('')).not.toEqual(example_3.input.join(''));
  });

  it('genRandExample', () => {
    const initConfig: TinyWorldTaskConfig = { ...defaultTinyWorldTaskConfig };
    initConfig.maxOutputLen = 20;
    const tinyWorld = new TinyWorldTask(initConfig);

    const [example] = tinyWorld.exampleIter.takeOutN(1);
    expect(example.id).toEqual(0);
    expect(example.input.length).toEqual(initConfig.maxInputLen);
    expect(example.input.join('')).toEqual('is _a:monkey, is _b:');
    expect(example.output.join('')).toEqual('cat, is _c:tree, is _d:elephant, jumps _a, jumps ');

    const [example2] = tinyWorld.exampleIter.takeOutN(1);
    expect(example2.id).toEqual(1);
    console.log('INPUT:' + JSON.stringify(example2.input.join('')));
    console.log('OUTPUT' + JSON.stringify(example2.output.join('')));

    expect(example2.input.join('')).toEqual('is _a:flower, is _b:');
    // TODO: make types get printed as their most general form...
    expect(example2.output.join('')).toEqual(
      'cat|elephant|monkey, is _c:flower|rock|tree, jumps _b, '
    );
  });

  // Special case that causes "runsAway _a" to be generated more than once.
  xit('bad world example', () => {
    const initConfig: TinyWorldTaskConfig = { ...defaultTinyWorldTaskConfig };
    initConfig.maxInputLen = 0;
    initConfig.maxOutputLen = 50;
    initConfig.baseStory = [
      'is _a:squishable',
      'is _b:rock',
      'is _c:animal',
      'jumps _c',
      'squishes _c:cat _c:cat',
    ];
    const tinyWorld = new TinyWorldTask(initConfig);
    console.log('scene0', tinyWorld.initStory.relSeq);
    console.log('varTypes0', tinyWorld.initStory.varTypes);

    // const ruleApps = applyRules(tinyWorld.rules, tinyWorld.initStory);

    console.log('rules', tinyWorld.rules);
    // console.log('ruleApps', ruleApps);

    console.log('types', tinyWorld.initStory.types);

    console.log('rule: ', stringifyRule(tinyWorld.rules[23]));
    const match = tinyWorld.initStory.matchRule(tinyWorld.rules[23]);
    console.log('match', match);

    // const nextRuleApps = new Map<
    //   string, // string version of the new relation.
    //   RuleApp<TypeNames, VarNames, RelNames>[]
    // >();

    // addRuleApps(tinyWorld.rules[23], tinyWorld.initStory, nextRuleApps);

    // const distr = nextRelDistrStats(ruleApps);

    // const [example] = tinyWorld.exampleIter.takeOutN(1);
    // expect(example.id).toEqual(0);
    // expect(example.input.length).toEqual(initConfig.maxInputLen);
    // console.log(JSON.stringify(example.input));
    // expect(example.input.join('')).toEqual('is _a:monkey, is _b:');
    // console.log(JSON.stringify(example.output));
    // // expect(example.output.join('')).toEqual(
    // //   'cat, is _c:tree, is _d:elephant, jumps _a, jumps '
    // // );

    // // console.log(tinyWorld.rns.state.curSeedVal);
    // tinyWorld.rns.state.curSeedVal = 21978789756;
    // // tinyWorld.rns.state.curSeedVal = 32968184634;
    // const example2 = tinyWorld.genRandExample(tinyWorld.rns);
    // expect(example2.id).toEqual(0);
    // expect(example2.input.join('')).toEqual('');
    // console.log(example2.output.join(''));
    // expect(example2.output.join('')).toEqual('runsAway _a, jumps _c, ');
  });

  // fit('genRandExample', () => {
  //   const initConfig: TinyWorldTaskConfig = { ...defaultTinyWorldTaskConfig };
  //   initConfig.maxOutputLen = 50;
  //   const tinyWorld = new TinyWorldTask(initConfig);
  //   const [example] = tinyWorld.exampleIter.takeOutN(1);
  //   expect(example.id).toEqual(0);
  //   expect(example.input.length).toEqual(initConfig.maxInputLen);
  //   console.log(JSON.stringify(example.input));
  //   expect(example.input.join('')).toEqual('is _a:monkey, is _b:');
  //   console.log(JSON.stringify(example.output));
  //   // expect(example.output.join('')).toEqual(
  //   //   'cat, is _c:tree, is _d:elephant, jumps _a, jumps '
  //   // );

  //   const [example2] = tinyWorld.exampleIter.takeOutN(1);
  //   expect(example2.id).toEqual(1);
  //   expect(example2.input.join('')).toEqual('is _a:flower, is _b:');
  //   expect(example2.output.join('')).toEqual(
  //     'animal, is _c:animal, jumps _b, jumps _b, is _d:'
  //   );
  // });
});
