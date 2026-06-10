# Berkovich Visualizer Layout & Styling Principles

This skill documents the layout, dynamic width calculation, and visual design patterns of the Berkovich Non-Archimedean ML Explorer visualization component.

## 1. Local Berkovich Subtree Layout Algorithm

The Berkovich subtree represents a tree topology over $\mathbb{Q}_p$ rational disks. Since the full tree grows exponentially with depth (size $p^d$), the tree is heavily pruned to contain only paths of mathematical interest.

The rendering uses a 6-pass coordinate generation algorithm:
1. **Pass 1 (Topology)**: Recursively builds the active node hierarchy down to the target leaf. A node is marked active if it contains the target point $y$ or the parameter center $c$ within its valuation disk.
2. **Pass 2 (Collection)**: Collects all bottom-most leaves (at the minimum log-radius level $\rho_{\min}$).
3. **Pass 3 (Spacing)**: Spaces the bottom-most leaves horizontally. Non-overlapping sibling leaves under the same parent are spaced by a `baseGap` ($40$px). Leaves crossing different branches at the divergence vertex are spaced by a dynamic `extraGap` (starting at $80$px and expanding up to $440$px in case of overlaps).
4. **Pass 4 (Interpolation)**: Computes coordinates bottom-up. Parents sit at the average of their children's coordinates. Sibling stub/placeholder nodes (which have no active children) are interpolated at parent level between their active siblings.
5. **Pass 5 (Boundary Calculation & Shifting)**: 
   - Scans the generated coordinates of *all* nodes (active and placeholders/stubs) to find the minimum and maximum horizontal bounds (`minX`, `maxX`).
   - Computes the layout width: `computedWidth = treeSpan + 130` (where `treeSpan = maxX - minX`). Capped at a minimum of $300$px.
   - Shifts all nodes horizontally by `shift = 40 - minX` to align the leftmost node exactly at a left margin of $40$px. This leaves a constant right margin of $90$px.
6. **Pass 6 (Visual Elements)**: Builds final list structures for SVG lines, circles, and labels using sliding offsets to support transition animations.

## 2. Dynamic Adaptive Widths & Slider Labels

The visualization is dynamically sized using Angular signals:
- `svgWidth`: Computed signal derived from `treeVisuals().width`.
- **Asymmetric Margins**: The left padding is $40$px. The right padding is $90$px. The additional space on the right prevents the sliding vertical level label ($\rho$) from overlapping or clipping the rightmost branches of the tree.
- **Adaptive Level Lines**: Level lines and drag indicators bind dynamically to `svgWidth() - 80` for their endpoint coordinates, ensuring the line spans the full width of the card and grows/shrinks as the p-adic base changes.

## 3. Colors & Theme Colors

To make the branching behavior highly intuitive:
- **Green** (`#10b981`): The correct shared path from the root.
- **Yellow** (`#eab308`): The target path leading to $y$ (and the target leaf indicator itself).
- **Purple** (`#8b5cf6`): The diverged parameter path leading to $c$ (and the active parameter halo).

## 4. KaTeX Implementation Gotchas

- **Angular Scoping**: KaTeX styles (hiding raw MathML blocks) must be loaded globally in `src/styles.scss` rather than component-scoped SCSS files.
- **Markdown Curly Braces**: Raw LaTeX block braces `{}` conflict with Angular's template parsing. Bind math formulas as JavaScript string literals using `[innerHTML]` bindings to a component rendering helper.
