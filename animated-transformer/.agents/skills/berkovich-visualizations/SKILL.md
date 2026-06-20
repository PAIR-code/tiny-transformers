---
name: berkovich-visualizations
description: Guidelines and visual standards for creating and modifying Berkovich space interactive visualizations.
---

# Berkovich Visualizations Standards

When working on Berkovich space visualizations (like point explorers, addition, gradients), you MUST follow these standards for consistency and mathematical correctness:

## 1. Mathematical Notation and Labels

- **Digit Sequences over Fractions**: Do not use fractions (e.g., `5/3`) for displaying p-adic numbers. Always use their digit sequence representations (e.g., `...212.1`) or arrays of digits. This applies to UI and code comments.
- **Berkovich Disk Pairs**: Berkovich disks must be written as pairs of the form `(x_c, x_{\rho})`.
- **Explicit References**: Never write just `c` or `\rho` without a reference to the name of the Berkovich disk it refers to. Ensure labels are of the form `x_c` or `x_{\rho}`, so they clearly specify the name of the berkovich disk (`x` in this case, where one might have a target y, which would be `(y_c, y_{rho})`).
- **No Node Digit Labels**: Do not render the center value digit sequences (like `00.00`) as text labels at the root or leaf nodes of the tree diagram (nodes should be clean circle marks without surrounding text clutter).

## 2. Visual Concepts and Colors

- Maintain consistent color coding across visualizations. For example:
  - Node A: Blue (e.g., `#60a5fa`)
  - Node B: Pink (e.g., `#f472b6`)
  - Result/Target (C or Y): Yellow/Purple (e.g., `#fbbf24` or `#a78bfa`)
- Consistent use of dashed lines vs solid lines depending on the topological representation.
- Ensure the tree topologies look similar across sub-views.
- **Common CSS Library**: For tree visualization styling, you MUST use the common CSS file `src/lib/berkovich/_tree_vis_common.scss` to ensure consistent node borders, labels, and SVG animations across all tree-vis components. Import it into the component's SCSS file via `@use` (e.g. `@use '../../../../lib/berkovich/tree_vis_common';`).
- **Berkovich Disk Scope Guidelines**: Draw two vertical dotted guide lines (`.rho-guide-line`) from the endpoints of the horizontal level indicator down to the bottom leaf level. These visualize the boundary scope (width/area) of the represented Berkovich disk.

## 4. Animations

- Ensure consistent animation phases (like continuous gradient descent flow) across the different views.
- Use smooth CSS transitions and consistent animation states.

When updating or creating a new visualization, ensure you apply these rules across the board to all relevant HTML templates and TS files.
