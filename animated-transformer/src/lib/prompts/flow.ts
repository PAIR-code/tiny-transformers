
import { flatten } from 'underscore';
import { Template, escapeStr, template, namedVar, unEscapeStr } from './template';
import { NamedVar } from './variable';

// function listSubst<N extends string>(
//   p: Template<N>, l: { [Key in N]: string }[], joinStr: string): string {
//   return l.map(e => p.substs(e).escaped).join(joinStr);
// }

function listSubst<N extends string, N2s extends string>(
  p: Template<N>, l: { [Key in N]: string | NamedVar<N2s> }[], joinStr: string
): Template<N2s> {
  const vars = flatten(l.map(e =>
    Object.values<string | NamedVar<N2s>>(e).filter(
      r => typeof r !== 'string'))) as NamedVar<N2s>[];
  return new Template(
    l.map(e => p.substs(e).escaped).join(joinStr), vars);
}

class FewShotTempl<Ns extends string> {
  constructor(public template: Template<Ns>,
    public joinStr: string) { };

  // concat<MoreVarNs extends string>(
  //   examples: { [Key in Ns]: string | NamedVar<MoreVarNs> }[]
  // ): FewShotTempl<Ns, VarNs | MoreVarNs> {
  //   type ConcatExamples = { [Key in Ns]: string | NamedVar<VarNs | MoreVarNs> }[];
  //   const conatExamples = this.examples as ConcatExamples;
  //   return new FewShotTempl(this.template, this.joinStr,
  //     conatExamples.concat(examples));
  // }

  apply<VarNs extends string>(
    examples: { [Key in Ns]: string | NamedVar<VarNs> }[]
  ): Template<VarNs> {
    return listSubst(
      this.template, examples, this.joinStr);
  }
}


// function numberedListSubst<N extends string>(
//   p: Template<N | 'number'>, l: { [Key in N]: string }[],
//   joinStr: string,
//   numberToStrFn: (n: number) => string = n => `${n}`): string {
//   return l.map((e, i) =>
//     p.substs({ ...e, number: numberToStrFn(i) }).escaped).join(joinStr);
// }

const constiutionPoints = [
  {
    name: 'Concise',
    description: 'not waffley'
  },
  {
    name: 'No synposes',
    description: 'do not give plot synopses'
  },
  {
    name: 'Specific',
    description: 'not vague (i.e. not "an amazing movie.", "a classic.")'
  },
].map((e, i) => { return { ...e, number: `${i}` } });

const nConstiutionTempl = new FewShotTempl(template
  `(${namedVar('number')}) ${namedVar('name')}: ${namedVar('description')}`,
  '.\n');

// ----------------------------------------------------------------------------
const constitutionTempl: Template<never> = nConstiutionTempl.apply(
  constiutionPoints);

// ----------------------------------------------------------------------------
// Probably too clever... but creating a common structure for propeties and
// values...
const nPropertyValuePerLineTempl = new FewShotTempl(template
  `${namedVar('property')}: "${namedVar('value')}"`,
  '\n');
const movieAndRecList = [
  {
    property: 'Movie',
    value: namedVar('movie'),
  },
  {
    property: 'Recommendation',
    value: namedVar('recommendation'),
  }
];
const movieRecTempl = nPropertyValuePerLineTempl.apply(movieAndRecList);
const movieRecEvalList =
  nPropertyValuePerLineTempl.apply(
    [...movieAndRecList,
    {
      property: 'Evaluation',
      value: namedVar('evaluation'),
    }]);



// ----------------------------------------------------------------------------
const criticTempl = template
  `${namedVar('Constitution')}

Given these criteria, evaluate the following movie recommendations.
If it looks ok, the evaluation should just be "ok".

${namedVar('fewShotCriticExamples')}

`.concat(movieRecTempl);


// ----------------------------------------------------------------------------
const fewShotCriticExamples = [
  {
    movie: 'The Godfather',
    recommendation: 'a dark and violent story of family and power',
    evaluation: 'ok',
  },
  {
    movie: 'The Godfather',
    recommendation: 'a masterpiece of cinema',
    evaluation: 'Specific: the recommendation is vague, it should be more precise.'
  },
];

const nCriticExamplesTempl = new FewShotTempl(
  movieRecEvalList, '\n\n');

const criticWithConstitutionAndExamples = criticTempl.substs({
  Constitution: constitutionTempl.escaped,
  fewShotCriticExamples:
    nCriticExamplesTempl.apply(fewShotCriticExamples).escaped
});


// ----------------------------------------------------------------------------
const movieSuggestionPrompt: Template<never> = template``;

// Idea: flow graphs: track the graph of substs.

// Idea: treat lists as first class objects where the template bunches a set of
// vars, and knows how to seprate repetitions of them.

// Idea: abstraction: generate a variable (have a stopping condition as first
// class entity.
