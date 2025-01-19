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

/*
npx ts-node src/weblab-examples/build.script.ts
*/

import * as esbuild from 'esbuild';
import * as glob from 'glob';
import * as yargs from 'yargs';

// Note: `__dirname` is the directory of this script.
const config: esbuild.BuildOptions = {
  // servedir: `${thisDirectoryName}/dist`,
  entryPoints: glob.sync(`${__dirname}/**/*.worker.ts`),
  bundle: true,
  sourcemap: true,
  outbase: __dirname,
  color: true,
  logLevel: 'info',
  format: 'esm', // recursive out dir paths.
  outdir: `${__dirname}/dist`,
  tsconfig: `${__dirname}/tsconfig.json`,
  banner: {
    js: `new EventSource('/esbuild').addEventListener('change', () => location.reload());`,
  },
};

// What gets run...
(async () => {
  const args = await yargs
    .option('mode', {
      describe: 'What to do: "build", "watch" or "serve".',
      demandOption: true,
      type: 'string',
    })
    .option('port', {
      describe: 'The port to listen to when serving.',
      type: 'number',
      default: 9000,
    })
    .version('0.0.1')
    .help().argv;

  const context = await esbuild.context(config);
  if (args.mode === 'build') {
    await context.rebuild();
    // console.log(result);
  } else if (args.mode === 'watch') {
    await context.watch();
  } else if (args.mode === 'serve') {
    await context.watch();
    await context.serve({
      port: args.port,
    });
  } else {
    throw Error(`Unknown mode: ${args.mode}`);
  }
})();
