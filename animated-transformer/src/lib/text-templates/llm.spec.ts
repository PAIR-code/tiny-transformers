/* Copyright 2023 Google LLC. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License. */
/*============================================================================*/
/*
Showing how the LLM class works...
*/

import { LookupTableFakeLLM, PredictResponse, ScoreResponse, ScoredCompletion, fillTemplate } from "./llm";
import { Palm2Response, preparePalm2Request } from "./llm_vertexapi_palm2";
import { nv, template } from "./template";

describe('llm', () => {
  let fakeLLM: LookupTableFakeLLM;
  let stopString = `']`;

  beforeEach(() => {
    // ----------------------------------------------------------------------------
    // Setup a fake LLM...
    // ----------------------------------------------------------------------------
    const fakePromptInput = `.
The following are short movie summaries. They are specific, not generic (no movie is  just "a classic"), and they don't contain plot synopsis. They just describe my experience of the movie.

movie: 'Fifth Element'
summary: ['a joyous sci fi that emerses you in a colourful universe', 'quirky upbeat action']

movie: 'Seven Samurai'
summary: ['a black and white masterpiece of cinematography', 'a slow, atmospheric, symbolic fight for all that is just']

movie: 'The Godfather'
summary: ['`;
    /* An approxiation for...
    const request = preparePalm2Request(prompt);
    const response = await sendPalm2Request(..., request)
    */
    const fakeResponse: Palm2Response = {
      "predictions": [
        {
          "content": "an operatic tale of a powerful family",
          "citationMetadata": { "citations": [] },
          "safetyAttributes": { "scores": [], "blocked": false, "categories": [] }
        }, {
          "safetyAttributes": { "blocked": false, "categories": [], "scores": [] },
          "content": "an operatic tragedy about a powerful Italian American crime family', 'a sprawling epic of violence and betrayal",
          "citationMetadata": { "citations": [] }
        }, {
          "citationMetadata": { "citations": [] }, "safetyAttributes": { "categories": [], "scores": [], "blocked": false }, "content": "epic crime saga with iconic performances', 'an operatic tale of family, loyalty, and betrayal"
        }, {
          "safetyAttributes": { "categories": [], "scores": [], "blocked": false }, "citationMetadata": { "citations": [] },
          "content": "a timeless mafia masterpiece', 'an operatic tale of a family\\'s descent into darkness"
        }],
      "metadata": {
        "tokenMetadata": {
          "outputTokenCount": { "totalBillableCharacters": 279, "totalTokens": 65 },
          "inputTokenCount": { "totalBillableCharacters": 410, "totalTokens": 118 }
        }
      }
    };

    const scoredCompletions = fakeResponse.predictions.map(p => {
      return {
        query: fakePromptInput,
        completion: p.content + stopString,
        score: 0,
      }
    });
    const lookupTable: { [query: string]: ScoreResponse } = {};
    lookupTable[fakePromptInput] = ({ scoredCompletions } as ScoreResponse)
    fakeLLM = new LookupTableFakeLLM(lookupTable);
  });

  // ----------------------------------------------------------------------------
  // Now the tests really start...
  // ----------------------------------------------------------------------------
  it('llm template filling', async () => {
    const promptTempl = template`.
The following are short movie summaries. They are specific, not generic (no movie is  just "a classic"), and they don't contain plot synopsis. They just describe my experience of the movie.

movie: 'Fifth Element'
summary: ['a joyous sci fi that emerses you in a colourful universe', 'quirky upbeat action']

movie: 'Seven Samurai'
summary: ['a black and white masterpiece of cinematography', 'a slow, atmospheric, symbolic fight for all that is just']

movie: '${nv('movie')}'
summary: ['${nv('summary')}']`;

    const substsList = await fillTemplate(
      fakeLLM, promptTempl.substs({ movie: 'The Godfather' }));
    console.log('substsList: ', substsList);
    expect(substsList.length).toEqual(4);
    expect(substsList[0]!.summary).toEqual(`an operatic tale of a powerful family`);
    expect(substsList[1]!.summary).toEqual(`an operatic tragedy about a powerful Italian American crime family', 'a sprawling epic of violence and betrayal`);
    expect(substsList[2]!.summary).toEqual(`epic crime saga with iconic performances', 'an operatic tale of family, loyalty, and betrayal`);
    expect(substsList[3]!.summary).toEqual(`a timeless mafia masterpiece', 'an operatic tale of a family\\'s descent into darkness`);
  });
});

