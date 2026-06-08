export interface SimPlotMappingRule {
  name: string;
  literal: string;
  argIndex?: number;
  argName?: string;
  matchValue?: string;
  argIndex2?: number;
  argName2?: string;
  matchValue2?: string;
}

export interface PresetSimulationConfig {
  defaultSteps: number;
  resourcePlotMapping: SimPlotMappingRule[];
  recordStorySteps?: boolean;
}

export interface PresetExample {
  name: string;
  description: string;
  src: string;
  defaultSimulationConfig?: PresetSimulationConfig;
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
    defaultSimulationConfig: {
      defaultSteps: 10,
      resourcePlotMapping: [
        { name: 'Jumped Over', literal: 'jumpedOver' },
        { name: 'Squished', literal: 'squished' },
        { name: 'Ran Away', literal: 'ranAway' },
      ],
      recordStorySteps: true,
    },
  },
  {
    name: 'River Crossing Puzzle',
    description: 'A classic river crossing puzzle (human, dog, cat, mouse) with clear state declarations (at, fight, eaten) and verb-based actions (row_alone, row_with, dog_chases_cat, cat_eats_mouse).',
    src: [
      'type bank = left | right;',
      'type animal = dog | cat | mouse;',
      'type entity = human | cargo(kind: animal);',
      'type state = at(who: entity, where: bank) | fight(attacker: animal, victim: animal, where: bank) | eaten(predator: animal, prey: animal, where: bank);',
      'fun opposite(left) = right | fun opposite(right) = left;',
      'action row_alone: { ?h: at(human, ?from) } -o { ?h2: at(human, opposite(?from)) };',
      'action row_with: { ?h: at(human, ?from), ?c: at(cargo(?a), ?from) } -o { ?h2: at(human, opposite(?from)), ?c2: at(cargo(?a), opposite(?from)) };',
      'action dog_chases_cat_left: { ?h: at(human, right), ?d: at(cargo(dog), left), ?c: at(cargo(cat), left) } -o { ?h2: at(human, right), ?f: fight(dog, cat, left) };',
      'action dog_chases_cat_right: { ?h: at(human, left), ?d: at(cargo(dog), right), ?c: at(cargo(cat), right) } -o { ?h2: at(human, left), ?f: fight(dog, cat, right) };',
      'action cat_eats_mouse_left: { ?h: at(human, right), ?c: at(cargo(cat), left), ?m: at(cargo(mouse), left) } -o { ?h2: at(human, right), ?e: eaten(cat, mouse, left) };',
      'action cat_eats_mouse_right: { ?h: at(human, left), ?c: at(cargo(cat), right), ?m: at(cargo(mouse), right) } -o { ?h2: at(human, left), ?e: eaten(cat, mouse, right) };',
      '_r1: at(human, left);',
      '_r2: at(cargo(dog), left);',
      '_r3: at(cargo(cat), left);',
      '_r4: at(cargo(mouse), left);',
    ].join('\n'),
    defaultSimulationConfig: {
      defaultSteps: 15,
      resourcePlotMapping: [
        { name: 'Human Left', literal: 'at', argIndex: 0, matchValue: 'human', argIndex2: 1, matchValue2: 'left' },
        { name: 'Human Right', literal: 'at', argIndex: 0, matchValue: 'human', argIndex2: 1, matchValue2: 'right' },
        { name: 'Fight State', literal: 'fight' },
        { name: 'Eaten State', literal: 'eaten' },
      ],
      recordStorySteps: true,
    },
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
    defaultSimulationConfig: {
      defaultSteps: 8,
      resourcePlotMapping: [
        { name: 'Number Occurrences', literal: 'suc' },
      ],
      recordStorySteps: true,
    },
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
    defaultSimulationConfig: {
      defaultSteps: 5,
      resourcePlotMapping: [
        { name: 'Active Channels', literal: 'chan', argIndex: 2, matchValue: 'active' },
        { name: 'Closed Channels', literal: 'chan', argIndex: 2, matchValue: 'closed' },
      ],
      recordStorySteps: true,
    },
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
    defaultSimulationConfig: {
      defaultSteps: 10,
      resourcePlotMapping: [
        { name: 'Dollars', literal: 'dollar' },
        { name: 'Coffee', literal: 'drink', argIndex: 0, matchValue: 'coffee' },
        { name: 'Tea', literal: 'drink', argIndex: 0, matchValue: 'tea' },
        { name: 'Red Socks', literal: 'sock', argIndex: 0, matchValue: 'red' },
        { name: 'Blue Socks', literal: 'sock', argIndex: 0, matchValue: 'blue' },
      ],
      recordStorySteps: true,
    },
  },
  {
    name: 'Foxes & Rabbits Simulation',
    description: 'Lotka-Volterra population dynamics using probabilistic logic transitions with scores and default math functions.',
    src: [
      'type species = rabbits(count: nat) | foxes(count: nat);',
      'action rabbits_reproduce [mul_num(0.08, ?r)]: { ?res: rabbits(?r) } -o { ?new: rabbits(add_num(?r, 1)) };',
      'action foxes_eat_rabbits [mul_num(0.00002, mul_num(?f, ?r))]: { ?resF: foxes(?f), ?resR: rabbits(?r) } -o { ?newF: foxes(?f), ?newR: rabbits(sub_num(?r, 1)) };',
      'action foxes_reproduce [mul_num(0.0001, mul_num(?f, ?r))]: { ?resF: foxes(?f), ?resR: rabbits(?r) } -o { ?newF: foxes(add_num(?f, 1)), ?newR: rabbits(sub_num(?r, 1)) };',
      'action foxes_die [mul_num(0.05, ?f)]: { ?resF: foxes(?f) } -o { ?newF: foxes(sub_num(?f, 1)) };',
      '_r1: rabbits(200);',
      '_r2: foxes(100);',
    ].join('\n'),
    defaultSimulationConfig: {
      defaultSteps: 20000,
      resourcePlotMapping: [
        { name: 'Rabbits', literal: 'rabbits', argIndex: 0 },
        { name: 'Foxes', literal: 'foxes', argIndex: 0 },
      ],
      recordStorySteps: false,
    },
  }
];
