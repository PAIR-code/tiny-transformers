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
import { addRuleApps, applyRules, nextRelDistrStats, RuleApp } from '../logic/stories';
import {
  RelName,
  TinyWorldTask,
  TinyWorldTaskConfig,
  TypeName,
  VarName,
  defaultTinyWorldTaskConfig,
} from './tiny_worlds';

describe('tiny_worlds', () => {
  beforeEach(() => {});

  it('genRandExample', () => {
    const initConfig: TinyWorldTaskConfig = { ...defaultTinyWorldTaskConfig };
    initConfig.maxOutputLen = 20;
    const tinyWorld = new TinyWorldTask(initConfig);

    const [example] = tinyWorld.exampleIter.takeOutN(1);
    expect(example.id).toEqual(0);
    expect(example.input.length).toEqual(initConfig.maxInputLen);
    console.log(JSON.stringify(example.input));
    expect(example.input.join('')).toEqual('is _a:monkey, is _b:');
    console.log(JSON.stringify(example.output));

    const [example2] = tinyWorld.exampleIter.takeOutN(1);
    expect(example2.id).toEqual(0);
    expect(example2.input.join('')).toEqual('is _a:flower, is _b:');
    expect(example2.output.join('')).toEqual('animal, is _c:animal, jumps _b, jumps _b, is _d:');
  });

  // Special case that causes "runsAway _a" to be generated more than once.
  it('bad world example', () => {
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
    console.log('scene0', tinyWorld.initStory.scene);
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
