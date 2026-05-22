# Tubes Library: Structured Tree formatting and Pretty Printing

`tubes` is a structural layout library designed to format and pretty-print deeply-nested tree structures (such as JSON objects, arrays, and key-value dictionary hierarchies).

Inspired by functional layout zipper algorithms (specifically the paper [Why walk when you can take the tube?](http://strictlypositive.org/Holes.pdf)), a `Tube` encapsulates a cursor indicating a specific active location in a tree. It tracks up-pointers to its parents, enabling traversal back up or sideways through the tree structure.

## Key Features

As a tube is assembled, it calculates structured meta-properties on-the-fly:
*   **Total single-line length** (`totalStrLen`): The total string size if the entire node tree were formatted on a single line.
*   **Compound children flags** (`hasCompoundChild`): Flags whether sub-nodes are arrays or objects rather than primitives.
*   **Max widths** (`maxKeyLen`, `maxValueLen`, `maxItemLen`): The size of the largest elements.

This metadata enables the layout formatter to make extremely sophisticated wrapping decisions:
*   **Paragraph Alignment**: If primitive arrays fit within a line limit, they remain inline. If they exceed the limit, they are wrapped neatly like block paragraphs.
*   **Nested Indentation**: Complex compound children are automatically expanded onto separate lines with clean, incremental double-space nesting.

---

## Key Primitives

*   **`LeafTube`**: Wraps a single primitive value (string, number, boolean, or null).
*   **`ArrTube`**: Represents a list node, accumulating child elements in an array.
*   **`ObjTube`**: Represents a dictionary node, mapping string keys to child tubes.
*   **`stringifyTube(config, tube)`**: The core pretty-printer executing layouts according to rules:
    *   `arrWrapAt`: Character budget limit for wrapping array elements.
    *   `objWrapAt`: Character budget limit for wrapping object keys.
    *   `quoteAllKeys`: If false, keys matching JavaScript identifiers will remain unquoted.
    *   `sortObjKeys`: Alphabetizes object properties recursively.

---

## Example Usage

### 1. Building a Tube Tree

```typescript
import { LeafTube, ArrTube, ObjTube, stringifyTube } from './tubes';

// Create: { name: "Transformer", heads: [4, 8] }
const root = new ObjTube();
root.addKeyChild("name", new LeafTube("Transformer"));

const heads = new ArrTube();
heads.addArrChild(new LeafTube(4));
heads.addArrChild(new LeafTube(8));
root.addKeyChild("heads", heads);

// Print the structure with character budgets
const output = stringifyTube(
  {
    quoteAllKeys: false,
    curIndent: "",
    arrWrapAt: 40,
    objWrapAt: 40,
    sortObjKeys: true
  },
  root
);

console.log(output);
/*
Output:
{ heads: [ 4, 8 ], name: "Transformer" }
*/
```
