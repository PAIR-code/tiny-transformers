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
An class to wrap, and provide a common interface for LLM behaviour.
*/

import { Template, matchTemplate } from "./template";

export interface PredictResponse {
  completions: string[];
}


export interface ScoreRequest {
  query: string;
  completions: string[];
}
export interface ScoredCompletion {
  query: string;
  completion: string;
  score: number;
}
export interface ScoreResponse {
  scoredCompletions: ScoredCompletion[];
}


export abstract class LLM<Params extends {}> {
  public abstract name: string;

  abstract predict(prompt: string, params?: Params): Promise<PredictResponse>;
  // abstract score(request: ScoreRequest): Promise<ScoreResponse>;
}

// A Fake LLM that uses a lookup table of queries to give responses.
// It is deterministic, and if the query is not present, it returns no
// completions.
//
// TODO: maybe good to provide a version that takes the same query and gives difference responses each time, e.g. using a random seed at constructor time.
export class LookupTableFakeLLM implements LLM<{}> {
  public name: string = 'fake: in memory lookup table';

  constructor(public table: { [query: string]: ScoreResponse }) { }

  async predict(query: string): Promise<PredictResponse> {
    const scoreResponse = this.table[query]
    if (scoreResponse) {
      const predictResponse: PredictResponse = {
        completions: scoreResponse.scoredCompletions.map(c => c.completion)
      };
      return predictResponse;
    }
    throw new Error(`No matching entry for query: ${query}`);
    // return { queryCompletions: [] }
  }
  async score(request: ScoreRequest): Promise<ScoreResponse> {
    const scoreResponse: ScoreResponse = this.table[request.query]
    if (scoreResponse) {
      return scoreResponse;
    }
    return { scoredCompletions: [] }
  }
}


export async function fillTemplate<Ns extends string>(
  llm: LLM<{}>, template: Template<Ns>
): Promise<({ [Key in Ns]: string } | null)[]> {
  const substsResponses: ({ [Key in Ns]: string } | null)[] = [];
  const parts = template.parts();
  const responses = await llm.predict(parts.prefix);
  // console.log('parts.prefix: ', parts.prefix);
  for (const completion of responses.completions) {
    // console.log('parts', parts);
    // console.log('qcompletion.completion', completion);
    const match = matchTemplate(parts, completion, false);
    substsResponses.push(match);
  }
  return substsResponses;
}
