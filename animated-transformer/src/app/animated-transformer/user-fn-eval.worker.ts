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


/// <reference lib="webworker" />

/**
 * Intended to allow user-functions to be safely executed.
 * e.g. with the SecretTokenTask
 */


interface UserFnEvalData {
  fnString: string;
  arguments: string[];
}

addEventListener('message', (message: { data: UserFnEvalData }) => {
  const f = new Function(message.data.fnString)
  const response = f(...message.data.arguments);
  postMessage(response);
});
