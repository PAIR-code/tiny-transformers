---
name: relational-linear-logic-syntax
description: >
  Guidelines, grammar, and rules for writing schemas, terms, functions, and actions
  in the relational linear logic language used in logic_v2. Contains constraints such
  as the disjoint namespace requirement between type names and constructor names.
---

# Relational Linear Logic Syntax & Design Principles

This document defines the grammar, syntax, semantics, and coding rules for the relational linear logic engine implemented in `src/lib/logic_v2`.

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

### CRITICAL RULE: Disjoint Type and Constructor Namespaces

In this logic engine, all type names and constructor names are stored in a single flat registry (`Context.data.literals`).

- **No Name Overlapping:** A type name and a constructor name **must never be identical**.
- **The Namespace Clash:** Declaring `type animal = animal(kind: species);` causes the constructor name `animal` to overwrite the type name `animal` in the literal registry. This results in runtime type-checking failures like:
  `TypeError: Cannot convert undefined or null to object` in `validateAddedTypes`.
- **Solution:** Always prefix or distinguish constructor names from their return types (e.g., use `makeAnimal` or `animalKind` as the constructor for the `animal` type):
  ```linear-logic
  type animal = makeAnimal(kind: species);
  ```

---

## 3. Subtyping and Union Wrapping

The type system does not support implicit subtyping or inheritance.

- **Lifting/Wrapping Pattern:** To include a value of a distinct type (like `animal`) inside a broader union type (like `item`), you must define an explicit wrapper constructor to "lift" the value:
  ```linear-logic
  type animal = makeAnimal(kind: species);
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
let myCat = makeAnimal(cat);
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
action monkeySquish: { ?j: jumpedOver(makeAnimal(monkey), flower) } -o { ?s: squished(makeAnimal(monkey), flower) };
```

- **LHS (`{ ... }`):** The linear resources required to trigger the action.
- **RHS (`{ ... }`):** The linear resources created after the transition.
- **Variables:** Logic variables (e.g., `?j`, `?s`) bind to specific resource names or term components during evaluation.
