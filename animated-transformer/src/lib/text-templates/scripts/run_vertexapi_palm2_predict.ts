/* Test call to The Google-Cloud-Vertex-AI-API Palm2 LLM.

Usage:

CLOUD_PROJECT_ID="copy your cloud project id here"
npx ts-node --esm ./run_vertexapi_palm2_predict.ts \
  --project=$CLOUD_PROJECT_ID \
  --accessToken=$(gcloud auth print-access-token) \
  --movie="The Untouchables"
*/
import { VertexPalm2LLM } from '../llm_vertexapi_palm2';
import { FewShotTemplate } from '../fewshot_template';

import * as yargs from 'yargs';
import { nv, template } from '../template';
import { fillTemplate } from '../llm';

interface Params {
  accessToken: string,
  project: string,
  movie: string,
}

function prettyMovieRec(index: number, movie: string, summaries: string): string {
  const outputFormat = template`
---- ${nv('index')} ----
I think you'll find the movie ${nv('movie')}:

${nv('bullets')}

Do you like my summary?`;
  const splitSummaries = summaries.split(`', '`).map(
    summaryPoint => { return { summaryPoint } })
  const outputBullets = new FewShotTemplate(
    template`* ${nv('summaryPoint')}`, '\n\n');
  const bullets = outputBullets.apply(splitSummaries).stringify();
  // Notice the nice type error is I try and and stringify, but forgot to
  // fill in the template...
  //   Type 'Error_CannotStringifyTemplateWithVars<"index">' is not assignable
  //   to type 'string'.
  // return outputFormat.substs({ movie, bullets }).stringify();
  return outputFormat.substs({ movie, bullets, index: `${index}` }).stringify();
}


async function run(args: Params): Promise<void> {
  const t = template`
The following are short movie summaries. They are specific, not generic (no movie is just "a classic"), and they don't contain plot synopsis. They just describe the experience of watching the movie. It tries to tell you the essence of the movie.

movie: 'Fifth Element'
summary: ['joyous sci fi that emerses you in a colourful universe', 'quirky upbeat action']

movie: 'Seven Samurai'
summary: ['black and white masterpiece of cinematography', 'a slow, atmospheric, symbolic fight for all that is just']

movie: '${nv('movie')}'
summary: ['${nv('summaries')}']`;

  const llm = new VertexPalm2LLM(
    args.project,
    args.accessToken,
  );
  const templateToFill = t.substs({ movie: args.movie });
  const substs = await fillTemplate(llm, templateToFill);
  const badlyFormedResponses = substs.filter(s => s === null).length;
  console.log(`badlyFormedResponses count: ${badlyFormedResponses}`);
  console.log(`substs: ${JSON.stringify(substs, null, 2)}`);

  substs.filter(s => s !== null).forEach(
    (s, i) => console.log(prettyMovieRec(i, args.movie, s!.summaries))
  );
}

// ----------------------------------------------------------------------------
const args = yargs
  .option('accessToken', {
    describe: 'Google Cloud Auth Token ' +
      'e.g. echo $(gcloud auth print-access-token)',
    demandOption: true,
    type: 'string',
  }).option('project', {
    describe: 'The Google Cloud Project to use (it must have the VertexAI ' +
      'API enabled).',
    demandOption: true,
    type: 'string',
  }).option('movie', {
    describe: 'The name of a movie to get a review of',
    demandOption: true,
    type: 'string',
  }).help().argv;

run(args as Params)
  .then(() => {
    console.log('Success!');
  })
  .catch(e => {
    console.error('Failed: ', e);
    throw Error('Failed');
  });
