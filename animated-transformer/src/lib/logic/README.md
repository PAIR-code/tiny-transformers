### Generative Logic

```ts
const exampleRelations = ["is", "jumpsOver", "runsAway", "squishes"];
type ExampleRelations = (typeof exampleRelations)[number];

// TODO: can we skip individual instances, e.g. c0, c1, etc, and just have the kinds?
// (instances being defined in the story?)
const exampleObjects = [
  //   'c0:cat:animal',
  //   'c1:cat:animal',
  //   'c2:cat:animal',
  //   'm0:monkey:animal',
  //   'm1:monkey:animal',
  //   'm2:monkey:animal',
  //   'e0:elephant:animal',
  //   'e1:elephant:animal',
  //   'e2:elephant:animal',
  "animal",
  "cat.animal",
  "monkey.animal",
  "elephant.animal",
  //   't0:tree:thing',
  //   't1:tree:thing',
  //   't2:tree:thing',
  //   'r0:rock:thing',
  //   'r1:rock:thing',
  //   'r2:rock:thing',
  //   'f0:flower:thing',
  //   'f1:flower:thing',
  //   'f2:flower:thing',
  "thing",
  "flower.thing",
  "rock.thing",
  "tree.thing",
  "", // the type of all objects, everything ends with an empty string;
] as const;

type ExampleObjects = (typeof exampleObjects)[number];

const relArgs = new Map<ExampleRelations, ExampleObjects[]>([
  ["is", ["", ""]],
  ["jumpsOver", ["animal", ""]],
  ["runsAway", ["animal"]],
  ["squishes", ["animal", ""]],
]);

const imaginaryStory = "jumpsOver _x:monkey _y, jumpsOver _y _x";

[
  // Observe absolute probability rules can be inherrently inconsistent... (not sum to 1)
  "P(squishes ?x ?y | jumpsOver ?x:monkey ?y:flower) = 0.5",
  "P(squishes ?x ?y | jumpsOver ?x:animal ?y:flower) = 0.1",

  // Score rules instead of probability ones can work...
  "S(squishes ?x ?y | jumpsOver ?x:monkey ?y:flower) += 0.5", // r1
  "S(squishes ?x ?y | jumpsOver ?x:animal ?y:flower) += 0.1", // r2

  // Story:
  "jumpsOver _a:monkey _f:flower, jumpsOver _c:cat _f:flower",

  // All application of score rules happen, and common matched rules then
  // get aggregated.
  "squishes _a _f", // r1, score: 0.5
  "squishes _a _f", // r2, score: 0.1
  "squishes _c _f", // r2, score: 0.1

  // This results in final scores for the events as so...
  "P(squishes _a _f) = SUM(0.5, 0.1) / SUM(0.5, 0.1, 0.1)",
  "P(squishes _c _f) = SUM(0.1) / SUM(0.5, 0.1, 0.1)",
];

const rules = [
  // Monkeys jump over stuff a lot
  "S(jumpsOver ?x:monkey ?y) += 5",
  // Monkeys might squish flowers
  "S(squishes ?x ?y | jumpsOver ?x:monkey ?y:flower) += 1",
  // Monkeys might squish cats
  "S(squishes ?x ?y | jumpsOver ?x:monkey ?y:cat) += 0.5",
  // cats jump over stuff
  "S(jumpsOver ?x:cat ?y) += 1",
  // cats very occationally squish flowers
  "S(squishes ?x ?y | jumpsOver ?x:cat ?y:flower) += 0.1",
  // Elephants occationally jump over animals
  "S(jumpsOver ?x:elephant ?y:animal) += 0.1",
  // Cats sometimes run away when jumped over
  "S(runsAway ?y += 1 | jumpsOver ?x ?y:cat)",
  // Squished animals can't run away anymore
  "S(runsAway ?y | squishes ?x ?y:animal) *= 0",
  // Animals that can away can't get squished or be jumped over.
  "S(squishes ?x ?y | runsAway ?y:animal) *= 0",
  "S(jumpsOver ?x ?y | runsAway ?y:animal) *= 0",
];

// Ideas for fancier rules/variants
//
// If a monkey just jumped over something, they are not so likely to jump again right away.
// '[... jumpsOver _x _y ...:3] ==> jumpsOver _x _y *= 0.1',
//
// Let actions/observations have names too.
// '_e: (tries_to_jumps_over _x:monkey _y) ==> succeeds(_e) += 1',
//
// Should types be observations?, e.g. could we write:
// '_x:cat ==> runsAway _x += 1'
// i.e. that would be the same as: 'is _x cat ==> runsAway _x += 1'
//
// Should we allow an unbound syntax?
// 'jumpsOver monkey _y += 5' === 'jumpsOver _x:monkey _y += 5' ?
// Maybe this is just syntax, so we skip it? Or maybe this somehow says that one
// *cannot* bind to the monkey, i.e. is says there was an unknown monkey who jumped over _y?
```
