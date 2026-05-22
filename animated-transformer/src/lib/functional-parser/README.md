# Functional Parser Library

`functional-parser` is an experimental, strongly-typed parser library designed for building state objects incrementally by consuming string suffixes.

> [!NOTE]
> This package is currently **experimental** and has its implementation commented out in favor of the standard external parsing library [mini-parse](https://www.npmjs.com/package/mini-parse).

## Intended Architecture

The core idea is to represent parsers as pipeline transformations mapping a generic `ParseState<Init>` to a refined `ParseState<After>` containing incrementally appended property fields.

*   **`ParseState<T>`**: Holds the remaining unparsed string slice `s` along with the structured state object `obj` built so far.
*   **`Parser<Init, After>`**: An abstract parser class specifying a `consume` method. If the string prefix matches, it returns the updated parser state containing the parsed properties; otherwise, it returns `null`.
*   **Combinators**:
    *   `ThenParse`: Sequences two parsers sequentially, routing the output state of the first into the input of the second.
    *   `OrParse`: Evaluates the first parser, falling back to the second if the first fails to match.
    *   `LiteralParse`: Consumes a set of exact literal string tokens.
    *   `IntegerParse`: Pulls out integers using regex, converting them to numbers on the state object.

---

## Theoretical Usage Example

```typescript
import { Parser, ParseState, IntegerParse, LiteralParse, ThenParse } from './functional-parser';

interface BaseState {
  action: string;
}

// Imagine parsing strings like "jump 42"
const actionParser = new LiteralParse<BaseState>(new Set(['jump', 'run']));
const spacesParser = new LiteralParse<BaseState>(new Set([' ']));
const amountParser = new IntegerParse<'amount', BaseState>('amount');

// Compose parsing pipeline
const pipeline = new ThenParse(
  actionParser,
  new ThenParse(spacesParser, amountParser)
);

const result = pipeline.consume({ s: 'jump 42', obj: { action: 'jump' } });
if (result) {
  console.log(result.obj); // { action: 'jump', amount: 42 }
  console.log(result.s);   // "" (empty string, successfully consumed)
}
```
