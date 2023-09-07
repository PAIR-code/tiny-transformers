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

export interface PredictRequest {
  query: string;
}
export interface QueryCompletion {
  query: string;
  completion: string;
}
export interface PredictResponse {
  queryCompletions: QueryCompletion[];
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


export abstract class LLM {
  public abstract name: string;

  abstract predict(request: PredictRequest): Promise<PredictResponse>;
  abstract score(request: ScoreRequest): Promise<ScoreResponse>;
}

// A Fake LLM that uses a lookup table of queries to give responses.
// It is deterministic, and if the query is not present, it returns no
// completions.
//
// TODO: maybe good to provide a version that takes the same query and gives difference responses each time, e.g. using a random seed at constructor time.
export class LookupTableFakeLLM {
  public name: string = 'fake: in memory lookup table';

  constructor(public table: { [query: string]: ScoreResponse }) { }

  async predict(request: PredictRequest): Promise<PredictResponse> {
    const scoreResponse = this.table[request.query]
    if (scoreResponse) {
      const predictResponse: PredictResponse = {
        queryCompletions: scoreResponse.scoredCompletions
      };
      return predictResponse;
    }
    throw new Error(`No matching entry for query: ${request.query}`);
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
  llm: LLM, template: Template<Ns>
): Promise<({ [Key in Ns]: string | null } | null)[]> {
  const substsResponses: ({ [Key in Ns]: string | null } | null)[] = [];
  const parts = template.parts();
  const responses = await llm.predict({ query: parts.prefix });
  console.log('parts.prefix: ', parts.prefix);
  for (const qcompletion of responses.queryCompletions) {
    console.log('parts', parts);
    console.log('qcompletion.completion', qcompletion.completion);
    const match = matchTemplate(parts, qcompletion.completion, false);
    substsResponses.push(match);
  }
  return substsResponses;
}
