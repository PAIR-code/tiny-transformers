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
import { parseToRational, formatRational } from './berkovich';
import {
  rhoToY,
  getPrefixCenter,
  calculateBerkovichTreeLayout,
  LayoutConfig
} from './berkovich_tree_layout';

const defaultConfig: LayoutConfig = {
  rhoMax: 2,
  rhoMin: -2,
  paddingY: 40,
  activePathStepY: 95,
  stubPathStepY: 66.5
};

describe('BerkovichTreeLayout Utilities', () => {
  describe('rhoToY', () => {
    it('should calculate standard Y coordinates based on activePathStepY', () => {
      expect(rhoToY(2, defaultConfig)).toBe(40);
      expect(rhoToY(1, defaultConfig)).toBe(135);
      expect(rhoToY(0, defaultConfig)).toBe(230);
      expect(rhoToY(-2, defaultConfig)).toBe(420);
    });
  });

  describe('getPrefixCenter', () => {
    it('should compute the correct prefix center for rational numbers in base p', () => {
      const y = parseToRational('5/3'); // 5/3 = 1.2_3 (1*3^0 + 2*3^-1)
      const p = 3n;

      // rho = 2, prefix power < -2 => 0
      expect(formatRational(getPrefixCenter(y, 2, p))).toBe('0');
      // rho = 1, prefix power < -1 => 0
      expect(formatRational(getPrefixCenter(y, 1, p))).toBe('0');
      // rho = 0, prefix power < 0 => 2/3
      expect(formatRational(getPrefixCenter(y, 0, p))).toBe('2/3');
      // rho = -1, prefix power < 1 => 1 + 2/3 = 5/3
      expect(formatRational(getPrefixCenter(y, -1, p))).toBe('5/3');
    });
  });

  describe('calculateBerkovichTreeLayout', () => {
    it('should create layout node and edge representations correctly', () => {
      const c_curr = parseToRational('0');
      const rho_curr = -2.0;
      const y = parseToRational('5/3');
      const p = 3n;
      const lastPositions = new Map<string, { x: number; y: number }>();

      const layout = calculateBerkovichTreeLayout(
        c_curr,
        rho_curr,
        y,
        undefined,
        p,
        defaultConfig,
        lastPositions
      );

      expect(layout.nodes.length).toBeGreaterThan(0);
      expect(layout.edges.length).toBeGreaterThan(0);
      expect(layout.width).toBeGreaterThanOrEqual(350);

      // Root node should always be at x_c = 0 (root center) at level 2
      const rootNode = layout.nodes.find(n => n.id === '0_2');
      expect(rootNode).toBeTruthy();
      expect(rootNode!.isActive).toBe(true);

      // Both c and y paths should exist down to rhoMin
      const cLeafNode = layout.nodes.find(n => n.id === '0_-2');
      const yLeafNode = layout.nodes.find(n => n.id === '5/3_-2');
      expect(cLeafNode).toBeTruthy();
      expect(yLeafNode).toBeTruthy();
    });

    it('should calculate symmetric coordinates for inactive siblings under early-terminating paths', () => {
      const c_curr = parseToRational('0');
      const rho_curr = 0.0; // Early-terminating active parameter path at rho = 0
      const y = parseToRational('5/3');
      const p = 3n;
      const lastPositions = new Map<string, { x: number; y: number }>();

      const layout = calculateBerkovichTreeLayout(
        c_curr,
        rho_curr,
        y,
        undefined,
        p,
        defaultConfig,
        lastPositions
      );

      // Sibling stubs of 0_0 at level -1: 0_-1 (active/candidate), 1_-1 (stub), 2_-1 (stub)
      const node0 = layout.nodes.find(n => n.id === '0_-1');
      const node1 = layout.nodes.find(n => n.id === '1_-1');
      const node2 = layout.nodes.find(n => n.id === '2_-1');

      expect(node0).toBeTruthy();
      expect(node1).toBeTruthy();
      expect(node2).toBeTruthy();

      // Check symmetry relative to node0 (since node0 is active leaf endpoint center, and mid index = 1)
      // node1 and node2 should be positioned at standard baseGap spacing (40px)
      expect(node1!.x - node0!.x).toBeCloseTo(40, 1);
      expect(node2!.x - node0!.x).toBeCloseTo(80, 1);
    });
  });
});
