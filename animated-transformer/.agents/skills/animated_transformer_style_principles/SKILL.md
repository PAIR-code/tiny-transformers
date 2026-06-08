---
name: animated-transformer-style-principles
description: >
  Guidelines and coding principles for the AnimatedTransformer repository, including
  TensorFlow.js usage, typed named tensors (GTensor), Angular standalone component patterns,
  code styling, testing paradigms, and project configurations.
---

# AnimatedTransformer General Coding Style & Principles

This document defines the coding standards, style requirements, architectural paradigms, and testing principles for the **AnimatedTransformer** project.

## 1. Code Formatting & Editorconfig

All source files must adhere to the settings defined in `.editorconfig`:

- **Indentation**: Use **2 spaces** for all files (HTML, CSS, SCSS, JS, TS, JSON, YAML). Do not use tabs.
- **Line Endings**: Ensure `lf` line endings and that a final newline is inserted at the end of every file (`insert_final_newline = true`).
- **Trailing Whitespace**: Trim trailing whitespaces (`trim_trailing_whitespace = true`), except in markdown files where trailing whitespaces are preserved.
- **TypeScript Specifics**:
  - Keep line lengths under **100 characters** where possible (`max_line_length = 100`).
  - Use **single quotes** for all string literals (`quote_type = single`).

---

## 2. Copyright & File Headers

Every newly created source file (e.g., `.ts`, `.scss`, `.html`) must begin with the standard Apache 2.0 license header:

```ts
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
```

---

## 3. TypeScript Strict Constraints

The project enforces high safety levels via TypeScript compiler constraints in `tsconfig.json`. Ensure that any new code respects these parameters:

- `"strict": true`: All strict type-checking options are enabled.
- `"noImplicitOverride": true`: Always use the `override` keyword when overriding inherited members.
- `"noPropertyAccessFromIndexSignature": true`: Prevents using dot notation (`obj.prop`) to access fields of a type with an index signature; use bracket notation (`obj['prop']`) instead.
- `"noImplicitReturns": true`: Ensure all code paths in a function return a value explicitly.
- `"noFallthroughCasesInSwitch": true`: Disallow fallthrough in switch cases unless annotated.
- **Discriminated Unions over Property Checks**: Do not use property presence checks like `if ('clauses' in func)` to differentiate union types. Define a strict `kind` property (ideally an enum) for union structures so that TypeScript refactoring is safe and explicit.

---

## 4. Typed Named Tensors (GTensor Library)

A core concept of this codebase is the **Named Tensor** abstraction layer built on top of TensorFlow.js. Dimensions are parameterised as string union types, enabling compile-time type safety and auto-completion for matrix operations.

- **GTensor Typing**: Instead of using generic multi-dimensional tensors, define tensors using their dimension names:
  ```ts
  const x: GTensor<'pos' | 'inputRep'> = ...
  ```
- **Dimension Operations**: Matrix operations contract specific dimensions by name rather than relying on positional axis indexing:
  ```ts
  // Performs matrix multiplication by contracting the 'inputRep' dimension
  const z = contract(x, y, ["inputRep"]);
  // z is inferred as GTensor<'pos' | 'hiddenRep'>
  ```
- **Preferred GTensor Methods**:
  - `squaredDifference`
  - `prodOverDims` / `sumOverDims`
  - `contract` (equivalent to matmul)
  - `pointwiseDiv` / `pointwiseAdd` / `pointwiseMul`
  - `gather` / `gather with batch dimensions`

---

## 5. Angular Standalone Architecture

We develop with Angular 22+ utilizing modern standalone components and strict compiler features. Agents should follow the best practices defined in [AGENTS.md](../../../AGENTS.md) and [.gemini/GEMINI.md](../../../.gemini/GEMINI.md).

- **Standalone Components**: Components, directives, and pipes are standalone by default in Angular v20+. Do **not** declare `standalone: true` inside Angular decorators. Explicitly import only the required modules directly within `imports: [...]`.
  ```ts
  @Component({
    selector: 'app-custom-element',
    templateUrl: './custom-element.component.html',
    styleUrls: ['./custom-element.component.scss'],
    imports: [
      CommonModule,
      MatButtonModule,
      MatIconModule
    ]
  })
  export class CustomElementComponent { ... }
  ```
- **Strict UI/Component Compilation**:
  - `"strictInjectionParameters": true`: Disallows injection tokens that are missing or cannot be resolved.
  - `"strictTemplates": true`: Standardizes strict type check verification on HTML inputs, outputs, and template bindings.
  - `"strictStandalone": true`: Enforces standalone boundaries.
- **Zoneless Change Detection**: We exclusively use Angular's zoneless change detection (`provideZonelessChangeDetection()`) everywhere (app-wide and in all test suites) in Angular 22 style.
  - Do **not** use `provideZoneChangeDetection()` or import `zone.js`.
  - Components must rely on reactive primitives (like Angular Signals, the `async` pipe with RxJS observables, or explicit `ChangeDetectorRef` when necessary) for state updates.
  - When writing unit tests, bootstrap the test environment or test bed with `provideZonelessChangeDetection()`.
- **Icon Registry Pattern**: Register custom SVG icons using the `MatIconRegistry` in the component or service constructor:
  ```ts
  const iconRegistry = inject(MatIconRegistry);
  const sanitizer = inject(DomSanitizer);
  iconRegistry.addSvgIcon("settings", sanitizer.bypassSecurityTrustResourceUrl("assets/icons/settings.svg"));
  ```


---

## 6. Testing & Assertion Best Practices

Maintain close proximity between code and unit tests by placing TypeScript spec files (`*.spec.ts`) right next to the source code.

- **Standard Testing Framework**: The project uses **Vitest** (via `@angular/build:unit-test` and `pnpm test`) for unit and integration tests. Spec files must be written in **TypeScript** (`*.spec.ts`).
- **Running Tests Headless vs Browser**: By default, tests run in **headless chromium** (no browser window opens). If you explicitly need to open the browser window to debug or inspect rendering, run `pnpm test --headless=false`.
- **Targeted Test Execution**: To avoid running the entire test suite (which takes time, especially for web workers and model training), always run only the relevant spec files or directory under development by using the `--include` option, e.g. `pnpm test --include=src/lib/logic_v2/**/*.spec.ts --watch=false`.
- **Tensor Comparison**: Never compare raw tensors directly using standard expect blocks. Instead, use TensorFlow.js's built-in test utility assertions:
  - **For exact equivalence**: `tf.test_util.expectArraysEqual(actual, expected)`
  - **For approximate floating-point matches**: `tf.test_util.expectArraysClose(actual, expected)`
- **Async Tests**: Always mark spec callbacks that invoke asynchronous operations (like `data()` or `dataSync()`) as `async` and correctly `await` resolutions.
- **Failure Screenshots & Temporary Files**: Browser failure screenshots or temporary test assets are ignored globally under `__screenshots__`. Clean them up proactively after fixing tests by running `pnpm clean-screenshots` or before finalizing tasks.

---

## 7. Package Management & Command Execution (pnpm)

The project strictly enforces **pnpm** as the exclusive package manager (as defined by `pnpm-lock.yaml`). **Do not use npm, npx, or raw javascript scratch scripts.**

- **NEVER use npm or npx**: All package management and script execution must be performed via `pnpm`. Under no circumstances should you run `npm` or `npx` commands.
- **All Code must be TypeScript**: All logic, components, and support/scratch scripts must be written in **TypeScript** (`.ts`). Avoid creating raw `.js` files.
- **Dependency Installation**: Use `pnpm install` instead of `npm install` to install dependencies.
- **Running Scripts**: Use `pnpm <script>` or `pnpm run <script>` (e.g., `pnpm start`, `pnpm test`, `pnpm run dev`) instead of `npm run <script>`.
- **Adding/Removing Packages**:
  - To add a dependency: `pnpm add <package-name>`
  - To add a devDependency: `pnpm add -D <package-name>`
  - To remove a package: `pnpm remove <package-name>`
- **One-off Command Execution**: Use `pnpm dlx` instead of `npx` to run executable binaries from the npm registry without installing them locally.
  - Example: `pnpm dlx ts-node src/weblab-examples/build.script.ts --mode=serve`
  - Example: `pnpm dlx @angular/cli g component custom-component`

---
