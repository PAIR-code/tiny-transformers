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

import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { z } from 'zod';
import { publicProcedure, router } from './trpc.ts';

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

const appRouter = router({
  curPath: publicProcedure.query(async () => {
    return Deno.cwd();
  }),
  loadArray: publicProcedure.input(z.string()).query(async (opts) => {
    const subPath = opts.input;
    const uintArr = await Deno.readFile(subPath);
    return uintArr;
  }),
  loadStr: publicProcedure.input(z.string()).query(async (opts) => {
    const subPath = opts.input;
    const str = await Deno.readTextFile(subPath);
    return str;
  }),
  saveStr: publicProcedure
    .input(z.object({ path: z.string(), str: z.string(), force: z.boolean() }))
    .mutation(async (opts) => {
      await Deno.writeTextFile(opts.input.path, opts.input.str, {
        createNew: !opts.input.force,
      });
      return;
    }),
});

export type ExperimentServerRouter = typeof appRouter;

const server = createHTTPServer({
  router: appRouter,
});

server.listen(flags.port);
