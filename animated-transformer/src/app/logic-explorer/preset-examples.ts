export interface PresetExample {
  name: string;
  description: string;
  src: string;
}

export const PRESET_EXAMPLES: PresetExample[] = [
  {
    name: 'Animals Story Mapping',
    description: 'Relational stories: animals jumping over, squishing flowers, or escaping from other animals.',
    src: [
      'type species = cat | monkey | elephant;',
      'type item = animal(kind: species) | flower | rock | tree;',
      'type state = active(what: item) | jumpedOver(jumper: animal, target: item) | squished(jumper: item, target: item) | ranAway(who: animal);',
      'action monkeySquish: { ?j: jumpedOver(animal(monkey), flower) } -o { ?s: squished(animal(monkey), flower) };',
      'action catEscape: { ?j: jumpedOver(?any, animal(cat)) } -o { ?r: ranAway(animal(cat)) };',
      '_r1: jumpedOver(animal(monkey), flower);',
      '_r2: jumpedOver(animal(elephant), animal(cat));',
      '_r3: jumpedOver(animal(monkey), tree);',
    ].join('\n'),
  },
  {
    name: 'Peano Arithmetic',
    description: 'Classic Peano natural numbers, CBV arithmetic functions, type parameters, and stateful grow actions.',
    src: [
      'type nat = 0 | suc(num: nat);',
      'let 1 = suc(0);',
      'let 2 = suc(suc(0));',
      'let 3 = suc(suc(suc(0)));',
      'fun add(suc(?x), ?y) = suc(add(?x, ?y)) | fun add(0, ?y) = ?y;',
      'action grow: { ?x: nat } -o { ?y: suc(?x) };',
      'action doubleGrow: { ?x: nat } -o { ?y: suc(?x), ?z: suc(?x) };',
      '_r1: 0;',
      '_r2: suc(0);',
      '_r3: suc(suc(0));',
      '?y: *;',
    ].join('\n'),
  },
  {
    name: 'Parametric Lists',
    description: 'Polymorphic sum types (generic lists), append functions, and generic linear lolli actions.',
    src: [
      "type list<'x> = cons(h: 'x, t: list<'x>) | nil;",
      'type nat = 0 | suc(num: nat);',
      'fun append(cons(?h, ?t), ?l) = cons(?h, append(?t, ?l)) | fun append(nil, ?l) = ?l;',
      'action concat: { ?l1: list(?a), ?l2: list(?a) } -o { ?l1and2: append(?l1, ?l2) };',
      '_r1: cons(suc(0), nil);',
      '_r2: cons(0, nil);',
      '?y: *;',
    ].join('\n'),
  },
  {
    name: 'Binary Trees Traversal',
    description: 'Generic binary tree nodes and leaf definitions, flat mapping, appending, and tree flattening action.',
    src: [
      "type tree<'val> = leaf | node(left: tree<'val>, val: 'val, right: tree<'val>);",
      'type nat = 0 | suc(num: nat);',
      "type list<'x> = cons(h: 'x, t: list<'x>) | nil;",
      'fun append(cons(?h, ?t), ?l) = cons(?h, append(?t, ?l)) | fun append(nil, ?l) = ?l;',
      'fun flat(node{ left = ?l, val = ?v, right = ?r }) = append(flat(?l), cons(?v, flat(?r))) | fun flat(leaf) = nil;',
      'action flattenTree: { ?t: tree(?elem) } -o { ?res: flat(?t) };',
      '_r1: node{ left = leaf, val = suc(0), right = node{ left = leaf, val = 0, right = leaf } };',
    ].join('\n'),
  },
  {
    name: 'Session Channels Simulation',
    description: 'Protocol session states, asynchronous channel transitions, message ping-pong routing.',
    src: [
      'type message = ping | pong | close;',
      'type status = active | closed;',
      'type nat = 0 | suc(num: nat);',
      'type channel = chan(id: nat, msg: message, state: status);',
      'action sendPing: { ?c: chan(?id, close, active) } -o { ?c2: chan(?id, ping, active) };',
      'action replyPong: { ?c: chan(?id, ping, active) } -o { ?c2: chan(?id, pong, active) };',
      'action terminate: { ?c: chan(?id, pong, active) } -o { ?c2: chan(?id, close, closed) };',
      '_r1: chan(suc(0), close, active);',
    ].join('\n'),
  },
  {
    name: 'Classic Linear Logic Choices',
    description: 'Tensor matching and external choices (buying tea or coffee using a dollar resource).',
    src: [
      'type beverage = coffee | tea;',
      'type colorType = red | blue;',
      'type coin = dollar | quarter;',
      'type item = drink(what: beverage) | sock(color: colorType) | pair(color: colorType);',
      'action buyCoffee: { ?d: dollar } -o { ?c: drink(coffee) };',
      'action buyTea: { ?d: dollar } -o { ?t: drink(tea) };',
      'action matchSocks: { ?s1: sock(?c), ?s2: sock(?c) } -o { ?p: pair(?c) };',
      '_r1: dollar;',
      '_r2: dollar;',
      '_r3: sock(red);',
      '_r4: sock(red);',
      '_r5: sock(blue);',
    ].join('\n'),
  }
];
