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
import { parseArgs } from 'jsr:@std/cli/parse-args';
const flags = parseArgs(Deno.args, {
  // boolean: ['help', 'color'],
  string: ['port', 'pathToExp'],
  default: { port: '9000' },
  // negatable: ['color'],
});

if (!flags.pathToExp) {
  throw new Error('--pathToExp must be defined.');
}

Deno.chdir(flags.pathToExp);
console.log(`running in dir: ${Deno.cwd()}`);
console.log(`URL: http://localhost:${flags.port}/`);

Deno.serve({
  port: parseInt(flags.port),
  handler: async (request) => {
    // If the request is a websocket upgrade,
    // we need to use the Deno.upgradeWebSocket helper
    if (request.headers.get('upgrade') === 'websocket') {
      const { socket, response } = Deno.upgradeWebSocket(request);

      socket.onopen = () => {
        console.log('CONNECTED');
      };
      socket.onmessage = (event) => {
        console.log(`RECEIVED: ${event.data}`);
        socket.send('pong');
      };
      socket.onclose = () => console.log('DISCONNECTED');
      socket.onerror = (error) => console.error('ERROR:', error);

      return response;
    } else {
      // If the request is a normal HTTP request,
      // we serve the client HTML file.
      const file = await Deno.open('./index.html', { read: true });
      return new Response(file.readable);
    }
  },
});
