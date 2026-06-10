---
name: berkovich-padic-logic
description: >
  Guidelines and reference for Berkovich spaces and p-adic logic in the project,
  ensuring agents read the underlying mathematical LaTeX definitions prior to editing
  or analyzing the implementation.
---

# Berkovich & p-adic Logic Skill

This skill governs the mathematical and implementation rules for Berkovich spaces and $p$-adic numbers in the `animated-transformer` repository.

## 1. Prerequisites and Mathematical Grounding

Before reading, editing, or making decisions about the code in [berkovich.ts](file:///Users/ldixon/code/tiny-transformers/animated-transformer/src/lib/berkovich/berkovich.ts) (or any file importing or interacting with it), you **MUST** read and understand the mathematical formulation documented in the LaTeX file:

- **Mathematical Reference**: [berkovich.tex](file:///Users/ldixon/code/tiny-transformers/animated-transformer/src/lib/berkovich/berkovich.tex)

Do not attempt to modify the implementation of $p$-adic arithmetic, valuation, distance, Berkovich points, tree navigation, or gradient descent steps without verifying the definitions and notation in the LaTeX file.

## 2. Core Concepts

Refer to [berkovich.tex](file:///Users/ldixon/code/tiny-transformers/animated-transformer/src/lib/berkovich/berkovich.tex) for detailed descriptions of:
- **$p$-adic Numbers & Valuations** ($|x|_p = p^{-\nu_p(x)}$)
- **The $\mathbb{Q}_p$-tree ($\Gamma_p$)** representing points by center-radius tuples $(c, \rho)$ representing closed rational disks $\bar{D}(c, p^\rho)$.
- **Equivalence Relation**: Two tuples $(c, \rho)$ and $(c', \rho')$ are identical iff $\rho = \rho'$ and $|c - c'|_p \le p^\rho$.
- **Point Classification**:
  - **Type I (Leaves, $\rho \to -\infty$)**: Classical $p$-adic points.
  - **Type II (Vertices, $\rho \in \mathbb{Z}$)**: Branching points.
  - **Type III (Edges, $\rho \notin \mathbb{Z}$)**: Points on the segments between vertices.
- **Hsia Kernel Distance**: $\delta(x, y) = \max(p^{\rho_x}, p^{\rho_y}, |c_x - c_y|_p)$.
- **Gradient Descent Steps**:
  - **Type III Edges**: Continuous gradient flow (updating $\rho$ coordinate).
  - **Type II Vertices**: Branch transitions (evaluating candidates in $\mathbb{F}_p \cup \{\infty\}$ and taking the argmin of the loss).
