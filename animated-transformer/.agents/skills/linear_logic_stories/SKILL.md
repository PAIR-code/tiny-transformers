---
name: linear-logic-stories
description: >
  Guidelines, grammar, syntax, and configuration rules for writing linear logic stories
  and simulator configurations, including action scores, probability modes, and plotting mappings.
---

# Linear Logic Stories & Simulation Design Principles

This document defines the grammar, syntax, semantics, and configuration rules for the relational linear logic engine and population simulator implemented in `src/lib/logic_v2`.

## 1. Language Overview

The logic engine operates on a relational multiset of linear resources using a custom linear logic syntax. It supports Algebraic Data Types (ADTs), pattern-matched functions, constant definitions, variables, and state-transition actions.

---

## 2. Type Definitions (Algebraic Data Types)

Type definitions are declared using the `type` keyword. They support sum-of-product types (disjunction of conjunctions) and type parameterization.

### Syntax

```linear-logic
type typeName = variant1 | variant2(...) | variant3;
```

- **Base Enum Types (Simple Nullary Constructors):**
  ```linear-logic
  type species = cat | monkey | elephant;
  ```
- **Parameterized/Constructed Types:**
  ```linear-logic
  type animal = makeAnimal(kind: species);
  ```
- **Recursive / Generic Types:**
  ```linear-logic
  type list<'a> = nil | cons(head: 'a, tail: list<'a>);
  ```

### Type and Constructor Namespaces

In this logic engine, all type names and constructor names are stored in a single flat registry (`Context.data.literals`).

- **Overlapping Names are Supported:** A type name and a constructor name can safely be identical.
- **Cleaner Schemas:** Declaring `type animal = animal(kind: species);` is fully supported and recommended when a type has a single primary constructor, allowing cleaner and more natural schemas.

---

## 3. Subtyping and Union Wrapping

The type system does not support implicit subtyping or inheritance.

- **Lifting/Wrapping Pattern:** To include a value of a distinct type (like `animal`) inside a broader union type (like `item`), you must define an explicit wrapper constructor to "lift" the value:
  ```linear-logic
  type animal = animal(kind: species);
  type item = animalVal(who: animal) | flower | rock | tree;
  ```
- **Compile-Time Enforcement:** By keeping `animal` as a separate type, you can strictly type action/state parameters to only accept animals at compile-time:
  ```linear-logic
  type state = jumpedOver(jumper: animal, target: item);
  ```
  An expression like `jumpedOver(rock, tree)` will trigger a compile-time type mismatch because `rock` is of type `item`, not `animal`.

---

## 4. Terms and Let-Bindings

Constant values or compound terms can be declared using the `let` keyword:

```linear-logic
let myCat = animal(cat);
let initialStage = active(flower);
```

These terms are parsed and fully type-inferred when the context is loaded.

---

## 5. Functions and Clause Matching

Pattern-matched functions are declared using `fun` or clause lists separated by `|`:

```linear-logic
fun isFlower(flower) = true
  | isFlower(rock) = false
  | isFlower(tree) = false
  | isFlower(animalVal(?a)) = false;
```

- Logic variables in patterns start with a question mark (e.g., `?a`).
- Type variables in generic signatures start with a single quote (e.g., `'a`).

---

## 6. Actions and State Transitions

Actions represent state transitions in the linear logic story. They consume resources on the left-hand side (LHS) of the `-o` operator and produce resources on the right-hand side (RHS).

```linear-logic
action monkeySquish: { ?j: jumpedOver(animal(monkey), flower) } -o { ?s: squished(animal(monkey), flower) };
```

- **LHS (`{ ... }`):** The linear resources required to trigger the action.
- **RHS (`{ ... }`):** The linear resources created after the transition.
- **Variables:** Logic variables (e.g., `?j`, `?s`) bind to specific resource names or term components during evaluation.

---

## 7. Action Scores & Rates

To support probabilistic simulation (e.g. Lotka-Volterra population dynamics), actions can be annotated with an optional **score expression** in square brackets (`[...]`) after the action name but before the colon:

```linear-logic
action rabbits_reproduce [mul_num(0.08, ?r)]: { ?res: rabbits(?r) } -o { ?new: rabbits(add_num(?r, 1)) };
```

- **Dynamic Evaluation:** During matching, variables bound in the LHS (like `?r`) are substituted into the score expression.
- **Math Functions:** Builtin numeric functions (e.g., `mul_num`, `add_num`, `sub_num`) evaluate the term to a final float value.
- **No Score:** If an action has no score expression, it defaults to a constant rate of `1.0`.

---

## 8. Simulator Configurations

The explorer supports saving default simulator configurations under the `defaultSimulationConfig` property of a preset or in JSON configs.

### Config Schema

- **`defaultSteps`**: (number) The default number of simulation steps to run (e.g., `20000` for population models).
- **`recordStorySteps`**: (boolean) Set to `false` for long runs (like Foxes & Rabbits) to avoid heavy memory allocation, and `true` for short-running diagnostic traces.
- **`resourcePlotMapping`**: (Array) Defines how linear resources count towards plotted chart lines.
  - **`name`**: The label shown on the chart legend.
  - **`literal`**: The resource literal name to match (e.g., `'at'`, `'chan'`).
  - **`argIndex`**: (Optional) 0-indexed argument offset inside the literal to inspect.
  - **`argName`**: (Optional) Named argument key to inspect.
  - **`matchValue`**: (Optional) Literal value of the argument to match. If provided, only resources whose argument matches this value are counted.
  - **`argIndex2`**: (Optional) 0-indexed offset for a secondary argument filter check.
  - **`argName2`**: (Optional) Secondary named argument key to check.
  - **`matchValue2`**: (Optional) Secondary literal value to check.

#### Example Config

```json
{
  "defaultSteps": 15,
  "recordStorySteps": true,
  "resourcePlotMapping": [
    { "name": "Human Left", "literal": "at", "argIndex": 0, "matchValue": "human", "argIndex2": 1, "matchValue2": "left" },
    { "name": "Human Right", "literal": "at", "argIndex": 0, "matchValue": "human", "argIndex2": 1, "matchValue2": "right" },
    { "name": "Fight State", "literal": "fight" },
    { "name": "Eaten State", "literal": "eaten" }
  ]
}
```
