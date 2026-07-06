/* Copyright 2026 Google LLC. All Rights Reserved.
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

import { describe, it, expect } from 'vitest';
import { computeTreeLayout, LayoutNode } from './tree_layout';

interface TestNode extends LayoutNode {
  id: string;
  depth: number;
  children: TestNode[];
}

function hasOverlap(root: TestNode, minGap: number = 39.9): boolean {
  const byDepth = new Map<number, { id: string, x: number }[]>();
  
  const collect = (n: TestNode) => {
    if (!byDepth.has(n.depth)) {
      byDepth.set(n.depth, []);
    }
    byDepth.get(n.depth)!.push({ id: n.id, x: n.x! });
    for (const child of n.children) {
      collect(child);
    }
  };
  collect(root);
  
  let overlapFound = false;
  for (const [depth, nodes] of byDepth.entries()) {
    nodes.sort((a, b) => a.x - b.x);
    for (let i = 1; i < nodes.length; i++) {
      if (nodes[i].x - nodes[i - 1].x < minGap) {
        overlapFound = true;
      }
    }
  }
  return overlapFound;
}

describe('tree_layout', () => {
  it('should layout a simple active path without overlap', () => {
    const root: TestNode = {
      id: 'root',
      depth: 0,
      isActive: true,
      children: [
        { id: 'c0', depth: 1, isActive: true, children: [] },
        { id: 'c1', depth: 1, isActive: false, children: [] },
        { id: 'c2', depth: 1, isActive: false, children: [] }
      ]
    };
    
    computeTreeLayout(root, 40, 40);
    expect(hasOverlap(root)).toBe(false);
  });

  it('should layout a splitting tree without overlapping stubs (similar to screenshot)', () => {
    // Construct the splitting tree from the screenshot:
    // Root split at depth 1 into C0_0 (active) and C0_1 (active).
    // Each of these branches has stubs and sub-branches.
    const root: TestNode = {
      id: 'root', depth: 0, isActive: true, children: [
        {
          id: 'c0', depth: 1, isActive: true, children: [
            {
              id: 'c0_0', depth: 2, isActive: true, children: [
                {
                  id: 'c0_0_0', depth: 3, isActive: true, children: [
                    { id: 'c0_0_0_0', depth: 4, isActive: true, children: [] },
                    { id: 'c0_0_0_1', depth: 4, isActive: false, children: [] },
                    { id: 'c0_0_0_2', depth: 4, isActive: false, children: [] }
                  ]
                },
                { id: 'c0_0_1', depth: 3, isActive: false, children: [] },
                { id: 'c0_0_2', depth: 3, isActive: false, children: [] }
              ]
            },
            {
              id: 'c0_1', depth: 2, isActive: true, children: [
                { id: 'c0_1_0', depth: 3, isActive: false, children: [] },
                {
                  id: 'c0_1_1', depth: 3, isActive: true, children: [
                    { id: 'c0_1_1_0', depth: 4, isActive: false, children: [] },
                    { id: 'c0_1_1_1', depth: 4, isActive: false, children: [] },
                    { id: 'c0_1_1_2', depth: 4, isActive: true, children: [] }
                  ]
                },
                { id: 'c0_1_2', depth: 3, isActive: false, children: [] }
              ]
            },
            { id: 'c0_2', depth: 2, isActive: false, children: [] }
          ]
        },
        { id: 'c1', depth: 1, isActive: false, children: [] },
        { id: 'c2', depth: 1, isActive: false, children: [] }
      ]
    };

    computeTreeLayout(root, 40, 40);
    expect(hasOverlap(root)).toBe(false);
  });
});
