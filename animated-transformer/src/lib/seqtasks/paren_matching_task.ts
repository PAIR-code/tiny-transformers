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
Classifier that detects if parenthesis are matched.
*/

export type OpenParen = '[' | '(' | '{';
export type CloseParen = ']' | ')' | '}';
export type NonParen = '.';

export type Vocab = OpenParen | CloseParen | NonParen;

const OPEN_PAREN_VOCAB: OpenParen[] = ['[', '(', '{'];
const CLOSE_PAREN_VOCAB: CloseParen[] = [']', ')', '}'];
const NON_PAREN_VOCAB: NonParen[] = ['.'];
const VOCAB: Vocab[] = ([] as Vocab[]).concat(NON_PAREN_VOCAB)
  .concat(OPEN_PAREN_VOCAB).concat(CLOSE_PAREN_VOCAB);

// TODO: provide seed for deterministic generation.
function randOfList<T>(l: Array<T>): T {
  return l[Math.floor(Math.random() * l.length)];
}

function closeOfOpen(s: OpenParen): CloseParen {
  if (s === '[') {
    return ']';
  } else if (s === '(') {
    return ')';
  } else if (s === '{') {
    return '}';
  } else {
    throw Error(`invalid close paren string: ${s}`);
  }
}


function parenMatch(c1: OpenParen, c2: CloseParen): boolean {
  return (c1 === '[' && c2 === ']')
    || (c1 === '(' && c2 === ')')
    || (c1 === '{' && c2 === '}');
}

export function isMatched(s: Vocab[]): boolean {
  const stack = [] as OpenParen[];
  for (const c of s) {
    if (c === '[' || c === '(' || c === '{') {
      stack.push(c);
    } else if (c === ']' || c === ')' || c === '}') {
      const lastParen = stack.pop();
      if (!lastParen || !parenMatch(lastParen, c)) {
        return false;
      }
    }
  }
  return stack.length === 0;
}

// Based on randomly choosing a valid character token.
export function generateMatchingString(): Vocab[] {
  const pstack = [] as OpenParen[];
  const s = [] as Vocab[];

  // Empty pstack means, generate charcters or open-paren.
  if (pstack.length === 0) {
    const choice = randOfList(['open-paren', 'non-paren-chars', 'end']);
    if (choice === 'open-paren') {
      const c = randOfList(OPEN_PAREN_VOCAB);
      s.push(c);
      pstack.push(c);
    } else if (choice === 'non-paren-chars') {
      const c = randOfList(NON_PAREN_VOCAB);
      s.push(c);
    } else {  // 'end'
      return s;
    }
    // There are open parens.
  } else {
    const choice = randOfList(['open-paren', 'non-paren-chars', 'close-paren']);
    if (choice === 'open-paren') {
      const c = randOfList(OPEN_PAREN_VOCAB);
      s.push(c);
      pstack.push(c);
    } else if (choice === 'non-paren-chars') {
      const c = randOfList(NON_PAREN_VOCAB);
      s.push(c);
    } else {  // 'close-paren'
      const c = pstack.pop();
      if (!c) {
        throw Error(`Bug: close-paren case with an empty pstack; this should `
          + `be impossible`);
      }
      s.push(closeOfOpen(c));
    }
  }
  return s;
}
