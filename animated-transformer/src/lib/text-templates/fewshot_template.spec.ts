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

import { flatten } from 'underscore';
import { Template, escapeStr, template, namedVar, unEscapeStr } from './template';
import { NamedVar } from './variable';
import { FewShotTempl } from './fewshot_template';

// // ----------------------------------------------------------------------------
// const movieSuggestionPrompt: Template<never> = template``;

// Idea: flow graphs: track the graph of substs.

// Idea: treat lists as first class objects where the template bunches a set of
// vars, and knows how to seprate repetitions of them.

// Idea: abstraction: generate a variable (have a stopping condition as first
// class entity.


fdescribe('fewshot_template', () => {
  beforeEach(() => {
  });

  it('A mini walkthrough of why this is neat...', () => {

    // ----------------------------------------------------------------------------
    // ----------------------------------------------------------------------------
    const criteriaPoints = [
      {
        name: 'Concise',
        description: 'not waffley.'
      },
      {
        name: 'No synposes',
        description: 'do not give plot synopses.'
      },
      {
        name: 'Specific',
        description: 'not vague (i.e. not "an amazing movie.", "a classic.").'
      },
    ];
    const nCriteriaTempl = new FewShotTempl(template
      `(${namedVar('number')}) ${namedVar('name')}: ${namedVar('description')}`,
      '\n');
    const numberedCriteriaPoints =
      criteriaPoints.map((e, i) => { return { ...e, number: `${i + 1}` } });
    const criteriaTempl: Template<never> = nCriteriaTempl.apply(
      numberedCriteriaPoints);

    expect(criteriaTempl.escaped).toEqual(
      `(1) Concise: not waffley.
(2) No synposes: do not give plot synopses.
(3) Specific: not vague (i.e. not "an amazing movie.", "a classic.").`);

    // ----------------------------------------------------------------------------
    // Probably too clever... but showing how you can have meta-templates.
    // e.g. creating a common structure for propeties and values, and apply it
    // to create a few-shot template with
    //    Move: {{movie}}
    //    Recommendation: {{recommendation}}
    // And showing how this can be easily progamatically extended to:
    //    Move: {{movie}}
    //    Recommendation: {{recommendation}}
    //    Evaluation: {{evaluation}}
    // The Motivation to do this is to make sure that you get consistent
    // joining, e.g. ": " always separates the property from the value, and
    // "\n" always separates different property-vcalue pairs.
    const nPropertyValuePerLineTempl = new FewShotTempl(template
      `${namedVar('property')}: "${namedVar('value')}"`,
      '\n');
    const movieAndRecList = [
      {
        property: 'Movie',
        value: namedVar('movie'),
      },
      {
        property: 'Recommendation',
        value: namedVar('recommendation'),
      }
    ];
    const movieRecTempl = nPropertyValuePerLineTempl.apply(movieAndRecList);
    const movieRecEvalTempl =
      nPropertyValuePerLineTempl.apply(
        [...movieAndRecList,
        {
          property: 'Evaluation',
          value: namedVar('evaluation'),
        }]);

    expect(movieRecEvalTempl.escaped).toEqual(
      `Movie: "{{movie}}"
Recommendation: "{{recommendation}}"
Evaluation: "{{evaluation}}"`);

    // ----------------------------------------------------------------------------
    const fewShotCriticExamples = [
      {
        movie: 'The Godfather',
        recommendation: 'a dark and violent story of family and power',
        evaluation: 'ok',
      },
      {
        movie: 'The Godfather',
        recommendation: 'a masterpiece of cinema',
        evaluation: 'Specific: the recommendation is vague, it should be more precise.'
      },
    ];

    const nCriticExamplesTempl = new FewShotTempl(
      movieRecEvalTempl, '\n\n');

    // ----------------------------------------------------------------------------
    // You might wonder by not include the template directly in the criticTempl
    // string... sadly I think it's a TS bug.
    const criticTempl = template
      `Given the following criteria for movie recommendations:
${namedVar('Constitution')}

Evaluate the following movie recommendations.
If the review is ok, the evaluation should just be "ok".

${namedVar('fewShotCriticExamples')}

`.concat(movieRecTempl).concat(template`
Evaluation: "`);

    const criticWithConstitutionAndExamples = criticTempl.substs({
      Constitution: criteriaTempl.escaped,
      fewShotCriticExamples:
        nCriticExamplesTempl.apply(fewShotCriticExamples).escaped
    });

    expect(criticWithConstitutionAndExamples.escaped).toEqual(
      `Given the following criteria for movie recommendations:
(1) Concise: not waffley.
(2) No synposes: do not give plot synopses.
(3) Specific: not vague (i.e. not "an amazing movie.", "a classic.").

Evaluate the following movie recommendations.
If the review is ok, the evaluation should just be "ok".

Movie: "The Godfather"
Recommendation: "a dark and violent story of family and power"
Evaluation: "ok"

Movie: "The Godfather"
Recommendation: "a masterpiece of cinema"
Evaluation: "Specific: the recommendation is vague, it should be more precise."

Movie: "{{movie}}"
Recommendation: "{{recommendation}}"
Evaluation: "`);
  });
});
