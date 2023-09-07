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
Google Cloud Vertex Palm2 API
(same models as Google Generative AI Developer API but different API)
*/

export interface Palm2ApiParams {
  candidateCount: number, // 1 to 8
  maxOutputTokens: number, // 256, 1024
  stopSequences: string[], // e.g. ']
  temperature: number,  // e.g. 0.2 (0=deterministic, 1=wild, x>1=crazy)
  topP: number,  // e.g. 0.8 (0-1, smaller = restricts crazyiness)
  topK: number  // e.g. 40 (0-numOfTokens, smaller = restricts crazyiness)
}

export interface Palm2ApiRequest {
  instances: { content: string }[]
  parameters: Palm2ApiParams
}
export type Palm2RequestOptions = Omit<Partial<Palm2ApiRequest>, 'prompt'>;

export interface Palm2Response {
  predictions:
  {
    content: string,
    citationMetadata: {
      citations: {}[]
    },
    safetyAttributes: {
      blocked: boolean, categories: {}[], scores: {}[]
    }
  }[],
  metadata: {
    tokenMetadata: {
      outputTokenCount: {
        totalBillableCharacters: number,
        totalTokens: number
      },
      inputTokenCount: {
        totalBillableCharacters: number,
        totalTokens: number
      },
    }
  }
}

export function preparePalm2Request(text: string, options?: Palm2ApiParams): Palm2ApiRequest {
  return {
    instances: [{ content: text }],
    parameters: {
      temperature: (options && options.temperature) || 0.7,
      topK: (options && options.topK) || 40,
      topP: (options && options.topP) || 0.95,
      candidateCount: (options && options.candidateCount) || 4,
      maxOutputTokens: (options && options.maxOutputTokens) || 256,
      stopSequences: (options && options.stopSequences) || [],
    }
  };
}

async function postDataToLLM(url = '', accessToken: string, data: Palm2ApiRequest) {
  // Default options are marked with *
  const response = await fetch(url, {
    method: 'POST', // *GET, POST, PUT, DELETE, etc.
    mode: 'cors', // no-cors, *cors, same-origin
    cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
    credentials: 'same-origin', // include, *same-origin, omit
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      // 'Content-Type': 'application/x-www-form-urlencoded',
    },
    redirect: 'follow', // manual, *follow, error
    referrerPolicy: 'no-referrer', // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
    body: JSON.stringify(data), // body data type must match "Content-Type" header
  });
  return response.json(); // parses JSON response into native JavaScript objects
}

export async function sendPalm2Request(
  projectId: string,
  accessToken: string,
  req: Palm2ApiRequest,
  modelId = 'text-bison', // e.g. text-bison for latest text-bison model
  apiEndpoint = 'us-central1-aiplatform.googleapis.com',
): Promise<Palm2Response> {
  return postDataToLLM(
    // TODO: it may be that the url part 'us-central1' has to match
    // apiEndpoint.
    `https://${apiEndpoint}/v1/projects/${projectId}/locations/us-central1/publishers/google/models/${modelId}:predict`,
    accessToken,
    req
  );
  // .then((data) => {
  //   console.log(data); // JSON data parsed by `data.json()` call
  // })
  // .catch((err) => console.error(err));
}

/*
instances: [
  {
    "content": "The fol"lowing are short movie summaries. They are specific, not generic (no movie is  just \\"a classic\\"), and they don\'t contain plot synopsis. They just describe my experience of the movie.

movie: \'Fifth Element\'
summary: [\'a joyous sci fi that emerses you in a colourful universe\', \'quirky upbeat action\']

movie: \'Seven Samurai\'
summary: [\'a black and white masterpiece of cinematography\', \'a slow, atmospheric, symbolic fight for all that is just\']

movie: \'The Godfather\'
summary: [\'"
        }"
],
  "parameters": {
  "candidateCount": 1,
    "maxOutputTokens": 256,
      "stopSequences": [
        "\']"
      ],
        "temperature": 0.2,
          "topP": 0.8,
            "topK": 40
}

*/
