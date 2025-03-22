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

/**
 * This is a server watches files, and sends their contents to the client. It
 * uses web-socket connections, and has a small simple protocol to ask to start
 * listening, and stop listening.
 */

// TODO: once deno supports WebTransport, we should move to that.
// see: https://github.com/denoland/deno/pull/27431

import { SocketFsWatcherServer } from './filewatcher-server/server.ts';
import { parseArgs } from 'jsr:@std/cli/parse-args';
const flags = parseArgs(Deno.args, {
  // boolean: ['help', 'color'],
  string: ['port', 'path'],
  default: { port: '9000' },
  // negatable: ['color'],
});

if (!flags.path) {
  throw new Error('--path must be defined.');
}

Deno.chdir(flags.path);
console.log(`Running in dir: ${Deno.cwd()}`);
console.log(`URL: http://localhost:${flags.port}/`);

const server = new SocketFsWatcherServer();
server.start();
