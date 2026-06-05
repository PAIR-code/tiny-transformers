import { parseContext } from './parser';
import { ParseError } from 'mini-parse';

describe('Logic Parser Error Coordinates', () => {
  const ANIMALS_SRC = [
    'type species = cat | monkey | elephant;',
    'type item = animal(kind: species) | flower | rock | tree;',
    'type state = active(what: item) | jumpedOver(jumper: animal, target: item) | squished(jumper: item, target: item) | ranAway(who: animal);',
    'action monkeySquish: { ?j: jumpedOver(animal(monkey), flower) } -o { ?s: squished(animal(monkey), flower) };',
    'action catEscape: { ?j: jumpedOver(?any, animal(cat)) } -o { ?r: ranAway(animal(cat)) };',
    '_r1: jumpedOver(animal(monkey), flower);',
    '_r2: jumpedOver(animal(elephant), animal(cat));',
    '_r3: jumpedOver(animal(monkey), tree);',
  ];

  const PEANO_SRC = [
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
  ];

  const getLineColFromIndex = (src: string, index: number, skipWhitespace = false): { line: number; column: number } => {
    let realIndex = index;
    if (skipWhitespace) {
      while (realIndex < src.length && /\s/.test(src[realIndex])) {
        realIndex++;
      }
    }
    let line = 1;
    let column = 1;
    for (let i = 0; i < realIndex && i < src.length; i++) {
      if (src[i] === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }
    }
    return { line, column };
  };

  const verifyError = (src: string, expectedLine: number, expectedCol: number) => {
    try {
      parseContext(src);
      throw new Error('Expected parseContext to throw an error, but it succeeded.');
    } catch (e: any) {
      if (e instanceof ParseError) {
        const start = getLineColFromIndex(src, e.span[0], true);
        expect(start.line).toBe(expectedLine);
        expect(start.column).toBe(expectedCol);
      } else {
        // Semantic error that has a span attached
        if ('span' in e && e.span) {
          const start = getLineColFromIndex(src, e.span[0], true);
          expect(start.line).toBe(expectedLine);
          expect(start.column).toBe(expectedCol);
        } else {
          // Fallback semantic error (defaults to line 1 column 1 if no span)
          expect(1).toBe(expectedLine);
          expect(1).toBe(expectedCol);
        }
      }
    }
  };

  it('should detect keyword typo at line 4, column 1', () => {
    const lines = [...ANIMALS_SRC];
    lines[3] = 'act monkeySquish: { ?j: jumpedOver(animal(monkey), flower) } -o { ?s: squished(animal(monkey), flower) };';
    verifyError(lines.join('\n'), 4, 1);
  });

  it('should detect missing closing parenthesis in line 2', () => {
    const lines = [...ANIMALS_SRC];
    lines[1] = 'type item = animal(kind: species | flower | rock | tree;';
    verifyError(lines.join('\n'), 2, 34);
  });

  it('should detect missing equals sign in let declaration at line 2', () => {
    const lines = [...PEANO_SRC];
    lines[1] = 'let 1 suc(0);';
    verifyError(lines.join('\n'), 2, 7);
  });

  it('should detect invalid action connector symbol at line 5', () => {
    const lines = [...ANIMALS_SRC];
    lines[4] = 'action catEscape: { ?j: jumpedOver(?any, animal(cat)) } => { ?r: ranAway(animal(cat)) };';
    verifyError(lines.join('\n'), 5, 57);
  });

  it('should detect semantic error for invalid resource name at line 7', () => {
    const lines = [...ANIMALS_SRC];
    lines[6] = 'r2: jumpedOver(animal(elephant), animal(cat));';
    verifyError(lines.join('\n'), 7, 1);
  });

  it('should detect semantic error for duplicate definition at line 3', () => {
    const lines = [...PEANO_SRC];
    lines[2] = 'let 1 = suc(suc(0));';
    verifyError(lines.join('\n'), 3, 5);
  });

  it('should detect syntax error for unclosed parenthesis in function clause at line 5', () => {
    const lines = [...PEANO_SRC];
    lines[4] = 'fun add(suc(?x), ?y = suc(add(?x, ?y)) | fun add(0, ?y) = ?y;';
    verifyError(lines.join('\n'), 5, 21);
  });
});
