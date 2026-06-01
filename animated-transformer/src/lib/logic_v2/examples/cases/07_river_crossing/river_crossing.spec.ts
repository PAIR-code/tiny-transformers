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

import { getApplicableActions } from '../../../linear';
import { Story } from '../../../story';
import { parseContext } from '../../../logic';

export const RIVER_CROSSING_STORY_SRC = [
  'type bank = left | right;',
  'type animal = dog | cat | mouse;',
  'type entity = human | cargo(kind: animal);',
  'type state = at(who: entity, where: bank) | fight(attacker: animal, victim: animal, where: bank) | eaten(predator: animal, prey: animal, where: bank);',
  'fun opposite(left) = right | fun opposite(right) = left;',
  'action row_alone: { ?h: at(human, ?from) } -o { ?h2: at(human, opposite(?from)) };',
  'action row_with: { ?h: at(human, ?from), ?c: at(cargo(?a), ?from) } -o { ?h2: at(human, opposite(?from)), ?c2: at(cargo(?a), opposite(?from)) };',
  'action dog_chases_cat_left: { ?h: at(human, right), ?d: at(cargo(dog), left), ?c: at(cargo(cat), left) } -o { ?h2: at(human, right), ?f: fight(dog, cat, left) };',
  'action dog_chases_cat_right: { ?h: at(human, left), ?d: at(cargo(dog), right), ?c: at(cargo(cat), right) } -o { ?h2: at(human, left), ?f: fight(dog, cat, right) };',
  'action cat_eats_mouse_left: { ?h: at(human, right), ?c: at(cargo(cat), left), ?m: at(cargo(mouse), left) } -o { ?h2: at(human, right), ?e: eaten(cat, mouse, left) };',
  'action cat_eats_mouse_right: { ?h: at(human, left), ?c: at(cargo(cat), right), ?m: at(cargo(mouse), right) } -o { ?h2: at(human, left), ?e: eaten(cat, mouse, right) };',
  '_r1: at(human, left);',
  '_r2: at(cargo(dog), left);',
  '_r3: at(cargo(cat), left);',
  '_r4: at(cargo(mouse), left);',
].join('\n');

describe('Example 7: River Crossing Linear Logic Story Spec', () => {
  it('can run the classic safe 7-step river crossing sequence', () => {
    const ctxt = parseContext(RIVER_CROSSING_STORY_SRC);
    const story = new Story(ctxt);

    // Step 1: Row with Cat to the Right
    let applicable = getApplicableActions(story.getCurrentContext());
    const step1Match = applicable.find(
      (m: any) =>
        m.action.name === 'row_with' &&
        m.matchedResources.get('c') === '_r3'
    )!;
    expect(step1Match).toBeDefined();
    story.applyAction(step1Match);

    // Step 2: Row alone back to Left
    applicable = getApplicableActions(story.getCurrentContext());
    const step2Match = applicable.find(
      (m: any) => m.action.name === 'row_alone'
    )!;
    expect(step2Match).toBeDefined();
    story.applyAction(step2Match);

    // Step 3: Row with Dog to the Right
    applicable = getApplicableActions(story.getCurrentContext());
    const step3Match = applicable.find(
      (m: any) =>
        m.action.name === 'row_with' &&
        m.matchedResources.get('c') === '_r2'
    )!;
    expect(step3Match).toBeDefined();
    story.applyAction(step3Match);

    // Step 4: Row with Cat back to Left
    applicable = getApplicableActions(story.getCurrentContext());
    const catOnRight = Object.entries(story.getCurrentContext().linearResources).find(
      ([_, typeStr]) => typeStr === 'at(cargo(cat), right)'
    )![0];
    const step4Match = applicable.find(
      (m: any) =>
        m.action.name === 'row_with' &&
        m.matchedResources.get('c') === catOnRight
    )!;
    expect(step4Match).toBeDefined();
    story.applyAction(step4Match);

    // Step 5: Row with Mouse to the Right
    applicable = getApplicableActions(story.getCurrentContext());
    const mouseOnLeft = Object.entries(story.getCurrentContext().linearResources).find(
      ([_, typeStr]) => typeStr === 'at(cargo(mouse), left)'
    )![0];
    const step5Match = applicable.find(
      (m: any) =>
        m.action.name === 'row_with' &&
        m.matchedResources.get('c') === mouseOnLeft
    )!;
    expect(step5Match).toBeDefined();
    story.applyAction(step5Match);

    // Step 6: Row alone back to Left
    applicable = getApplicableActions(story.getCurrentContext());
    const step6Match = applicable.find(
      (m: any) => m.action.name === 'row_alone'
    )!;
    expect(step6Match).toBeDefined();
    story.applyAction(step6Match);

    // Step 7: Row with Cat to the Right
    applicable = getApplicableActions(story.getCurrentContext());
    const catOnLeft = Object.entries(story.getCurrentContext().linearResources).find(
      ([_, typeStr]) => typeStr === 'at(cargo(cat), left)'
    )![0];
    const step7Match = applicable.find(
      (m: any) =>
        m.action.name === 'row_with' &&
        m.matchedResources.get('c') === catOnLeft
    )!;
    expect(step7Match).toBeDefined();
    story.applyAction(step7Match);

    // Verify final state is everyone on the right bank safely
    const resources = Object.values(story.getCurrentContext().linearResources);
    expect(resources).toContain('at(human, right)');
    expect(resources).toContain('at(cargo(dog), right)');
    expect(resources).toContain('at(cargo(cat), right)');
    expect(resources).toContain('at(cargo(mouse), right)');
    expect(resources.length).toBe(4);
  });

  it('triggers failure when cat and mouse are left alone on left bank', () => {
    const ctxt = parseContext(RIVER_CROSSING_STORY_SRC);
    const story = new Story(ctxt);

    // Human rows with Dog to the Right (leaving Cat and Mouse on Left)
    const applicable = getApplicableActions(story.getCurrentContext());
    const badStepMatch = applicable.find(
      (m: any) =>
        m.action.name === 'row_with' &&
        m.matchedResources.get('c') === '_r2' // Dog
    )!;
    expect(badStepMatch).toBeDefined();
    story.applyAction(badStepMatch);

    // Now the cat_eats_mouse rule must be applicable!
    const applicable2 = getApplicableActions(story.getCurrentContext());
    const fightMatch = applicable2.find(
      (m: any) => m.action.name === 'cat_eats_mouse_left'
    )!;
    expect(fightMatch).toBeDefined();

    story.applyAction(fightMatch);
    const finalState = story.getCurrentContext().linearResources;
    
    // Cat and Mouse are consumed, and eaten(cat, mouse, left) is produced
    const resources = Object.values(finalState);
    expect(resources).toContain('at(human, right)');
    expect(resources).toContain('at(cargo(dog), right)');
    expect(resources).toContain('eaten(cat, mouse, left)');
    expect(resources.length).toBe(3);
  });
});
