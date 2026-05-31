# Logic V2 Linear Lolli System Examples

This directory contains a rich, premium collection of examples demonstrating the capabilities of the **Logic V2** linear lolli logic framework, CBV function evaluation, algebraic data types (ADTs), parameterised types, and stateful execution stories.

Each example is **fully self-contained** inside a dedicated folder in the `cases/` subdirectory, represented by a `.spec.ts` file. The logic rules are defined as a string constant at the top of the spec file, serving as the single source of truth, and are actively typechecked and executed by the unit tests below them.

---

## 📂 Example Case Studies

### 1. Peano Arithmetic (`cases/01_peano_arithmetic/peano_arithmetic.spec.ts`)
Demonstrates the classic construction of Peano natural numbers (`nat`), arithmetic functions (`add`), type variable declarations (`?y: *;`), and linear grow actions.
- **ADT**: `type nat = 0 | suc(num: nat);`
- **CBV Function**: `fun add(suc(?x), ?y) = suc(add(?x, ?y)) | fun add(0, ?y) = ?y;`
- **Lolli Action**: `action grow: { ?x: nat } -o { ?y: suc(?x) };`

### 2. Parametric Lists (`cases/02_parametric_lists/parametric_lists.spec.ts`)
Showcases polymorphic sum types (generic lists `list<'x>`), list concatenation/append evaluations, and generic linear append actions.
- **Generic ADT**: `type list<'x> = cons(h: 'x, t: list<'x>) | nil;`
- **CBV Function**: `fun append(cons(?h, ?t), ?l) = cons(?h, append(?t, ?l)) | fun append(nil, ?l) = ?l;`
- **Lolli Action**: `action concat: { ?l1: cons(?h, ?t), ?l2: ?l } -o { ?res: append(cons(?h, ?t), ?l) };`

### 3. Animals Story Mapping (`cases/03_animal_story/animal_story.spec.ts`)
Translates past relational V1 story concepts (monkey squishes flower, cat escaping/running away from elephant) into V2's algebraic sum types, nested constructor states (`jumpedOver(jumper, target)`), and linear lolli actions.
- **ADT**: `type state = active(what: item) | jumpedOver(jumper: item, target: item) | squished(jumper: item, target: item) | ranAway(who: item);`
- **Lolli Action**: `action catEscape: { ?j: jumpedOver(?any, animal(cat)) } -o { ?r: ranAway(animal(cat)) };`

### 4. Binary Trees Traversal (`cases/04_binary_trees/binary_trees.spec.ts`)
Combines parameterized binary trees (`tree<'val>`), list appending, CBV in-order tree flattening to list (`flat`), and linear flattening actions.
- **ADT**: `type tree<'val> = leaf | node(left: tree<'val>, val: 'val, right: tree<'val>);`
- **CBV Function**: `fun flat(node{ left = ?l, val = ?v, right = ?r }) = append(flat(?l), cons(?v, flat(?r))) | fun flat(leaf) = nil;`
- **Lolli Action**: `action flattenTree: { ?t: node{ left = ?l, val = ?v, right = ?r } } -o { ?res: flat(node{ left = ?l, val = ?v, right = ?r }) };`

### 5. Session Channels Simulation (`cases/05_session_channels/session_channels.spec.ts`)
Exhibits how linear logic lolli actions can be used to model protocol session types and simulate asynchronous message-passing transitions (`ping`/`pong`/`close`) on active channels.
- **ADT**: `type channel = chan(id: nat, msg: message, state: status);`
- **Lolli Action**: `action replyPong: { ?c: chan(?id, ping, active) } -o { ?c2: chan(?id, pong, active) };`

### 6. Classic Linear Logic (`cases/06_classic_linear_logic/classic_linear_logic.spec.ts`)
Demonstrates classic linear logic vending machine choices ("you choose" coffee or tea for a dollar) and resource-tensor pair matching ("getting red/blue socks").
- **ADT**: `type coin = dollar | quarter; type item = drink(what: beverage) | sock(color: colorType) | pair(color: colorType);`
- **Choice ("You choose") Lolli Actions**: 
  - `action buyCoffee: { ?d: dollar } -o { ?c: drink(coffee) };`
  - `action buyTea: { ?d: dollar } -o { ?t: drink(tea) };`
- **Tensor Matching Lolli Action**: `action matchSocks: { ?s1: sock(?c), ?s2: sock(?c) } -o { ?p: pair(?c) };`

---

## 🛠️ Programmatic Execution Walks & Typechecking

All of these logic files are fully integrated into active, co-located TypeScript verification spec runners. You can inspect, typecheck, and evaluate them dynamically:

```typescript
import { parseContext } from '../../logic';
import { getApplicableActions } from '../../linear';
import { Story } from '../../story';

// 1. Parse the logic src directly
const ctxt = parseContext(LOGIC_SRC);

// 2. Initialize V2Story execution trace
const story = new Story(ctxt);

// 3. Find applicable transition actions
const applicable = getApplicableActions(ctxt);

// 4. Apply a transition step-by-step
story.applyAction(applicable[0]);
const nextCtxt = story.getCurrentContext();
```

The complete unit test suite (`v2_story.spec.ts`, `linear.spec.ts`, `logic.spec.ts`) also provides verified programmatic reference walks for all of these structures.
