---
name: berkovich-inference-walkthrough-guide
description: Standards and layouts for building and styling model next-character inference live walkthrough cards.
---

# Berkovich & p-adic Inference Walkthrough Guide

This skill documents the rules, layout system, and coding standards for creating next-character inference explanation cards (walkthrough components) in the Berkovich project.

---

## 1. Directory Structure

Place new model-specific walkthrough cards under:
`src/app/berkovich-hub/berkovich-space-explorers/walkthrough-components/`

Use the following naming convention:
*   `<model-name>-walkthrough.component.ts` (e.g. `berkovich-bigram-walkthrough.component.ts`)

---

## 2. Reusable Subcomponent Library

To ensure look-and-feel consistency, walkthrough components MUST use the shared subcomponents located in `walkthrough-components/shared/`:

### 2.1. Worked Example Context Display (`app-walkthrough-context`)
Handles input and text display for the context.
```html
<app-walkthrough-context
  [inputId]="'walkthrough-input-field-<model-name>'"
  [contextLength]="contextLength"
  [preText]="walkthrough.preText"
  [contextText]="walkthrough.contextText"
  [walkthroughInput]="walkthroughInput()"
  [walkthroughInputError]="walkthroughInputError()"
  (inputChanged)="walkthroughInputChange.emit($event)">
</app-walkthrough-context>
```

### 2.2. Softmax Probability Table (`app-softmax-walkthrough-table`)
Renders scores, exponentials, bar ratios, and math symbols for logits.
```html
<app-softmax-walkthrough-table
  [stepTitle]="'Show Step X output probabilities'"
  [predictions]="walkthrough.predictions"
  [denominatorSum]="walkthrough.sumExp"
  [beta]="beta()"
  [guideData]="'- **Score (S)**: Description...\\n- **$e^{\\beta \\cdot S}$ (Numerator)**: Description...'">
</app-softmax-walkthrough-table>
```

---

## 3. Formatting Standards

### 3.1. Quotes and Whitespace Escape
When rendering characters from the vocabulary, always wrap them in quotes and escape whitespaces/newlines.
Inside your component, define:
```typescript
formatDisplayString(str: string): string {
  return str.replace(/ /g, '␣').replace(/\n/g, '\\n');
}

wrapInQuotes(str: string): string {
  return `'${str}'`;
}
```
In template: `{{ wrapInQuotes(formatDisplayString(p.char)) }}`

### 3.2. Infinity Checks
Since Angular templates do not have access to JavaScript global `Infinity`, always define a helper method in your walkthrough component class:
```typescript
isNegInfinity(val: number): boolean {
  return val === -Infinity;
}
```
In template: `{{ isNegInfinity(det.dist) ? '&infin;' : (-det.dist) }}`

### 3.3. Math Formulations
*   Use `<markdown [katex]="true" [data]="'...'"></markdown>` for all mathematical formulas.
*   Escape backslashes properly in TypeScript string template literals (e.g. use `\\\\in` or `\\\\mathbb` inside multi-line strings).

---

## 4. Input / Output Contracts

Walkthrough cards should match this input/output structure:
```typescript
export class NewModelWalkthroughComponent {
  details = input.required<WalkthroughDetails | null>();
  walkthroughInput = input.required<string>();
  walkthroughInputError = input.required<string | null>();
  beta = input.required<number>();
  vocab = input.required<string[]>();
  
  walkthroughInputChange = output<string>();
}
```

---

## 5. Card Wrapper and Layout Policy

Walkthrough explainer components should **never** wrap their template inside a `<section class="card ...">` block or define their own `<h3>` card title headers.

*   **Parent Responsibility**: The parent component (`berkovich-space-explorers.component.html`) provides the card wrapper structure and handles the shared heading:
    ```html
    <section class="card explainer-card">
      <h3><mat-icon>info</mat-icon> How Model Inference Works?</h3>
      <!-- Walkthrough component is rendered inside here -->
    </section>
    ```
*   **Child Responsibility**: Child components should directly output the subheadings (`<h4>`), description paragraphs (`<p>`), worked example editor inputs, and step-by-step math cards.

