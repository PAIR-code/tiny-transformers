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
=============================================================================*/

import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideMarkdown } from 'ngx-markdown';
import katex from 'katex';
import { BerkovichTreeVisComponent } from './berkovich-tree-vis.component';
import { parseToRational, formatRational } from '../../../lib/berkovich/berkovich';

if (typeof window !== 'undefined') {
  (window as any).katex = katex;
}

describe('BerkovichTreeVisComponent', () => {
  let component: BerkovichTreeVisComponent;
  let fixture: ComponentFixture<BerkovichTreeVisComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BerkovichTreeVisComponent],
      providers: [provideZonelessChangeDetection(), provideMarkdown()]
    }).compileComponents();

    fixture = TestBed.createComponent(BerkovichTreeVisComponent);
    component = fixture.componentInstance;
  });

  const setInputs = (prime: number, target: string, center: string, rho: number, isDragging = false) => {
    fixture.componentRef.setInput('prime', prime);
    fixture.componentRef.setInput('targetRational', parseToRational(target));
    fixture.componentRef.setInput('currentCenter', parseToRational(center));
    fixture.componentRef.setInput('currentLogRadius', rho);
    fixture.componentRef.setInput('isDraggingRho', isDragging);
    fixture.detectChanges();
  };

  it('should create and calculate tree visuals', () => {
    setInputs(3, '5/3', '0', 2.0);
    expect(component).toBeTruthy();
    const visuals = component.treeVisuals();
    expect(visuals.nodes.length).toBeGreaterThan(0);
    expect(visuals.edges.length).toBeGreaterThan(0);
  });

  it('should not show children under inactive node 1/9 at level 1 when c=0 and y=5/3', () => {
    setInputs(3, '5/3', '0', 2.0);

    const visuals = component.treeVisuals();
    const node19 = visuals.nodes.find(n => formatRational(n.center) === '1/9' && n.logRadius === 1);
    
    expect(node19).toBeTruthy();
    expect(node19!.isActive).toBe(false);

    const childOf19 = visuals.nodes.find(n => n.id.startsWith('1/9_0') || n.id.startsWith('4/9_0') || n.id.startsWith('7/9_0'));
    expect(childOf19).toBeUndefined();
  });

  it('should only expand the exact active paths to c and y at negative levels', () => {
    setInputs(3, '5/3', '0', 2.0);

    const visuals = component.treeVisuals();
    
    // Node '3_-2' (center 3, level -2) is not on the active paths, it should exist but be inactive.
    const node3 = visuals.nodes.find(n => formatRational(n.center) === '3' && n.logRadius === -2);
    expect(node3).toBeTruthy();
    expect(node3!.isActive).toBe(false);

    // Node '6_-2' (center 6, level -2) is also not on the active paths, it should exist but be inactive.
    const node6 = visuals.nodes.find(n => formatRational(n.center) === '6' && n.logRadius === -2);
    expect(node6).toBeTruthy();
    expect(node6!.isActive).toBe(false);
  });

  it('should place the parameter circle at the root node when c=1/3 and rho=2', () => {
    setInputs(3, '5/3', '1/3', 2.0);

    const coord = component.currentParameterCoord();
    const visuals = component.treeVisuals();
    const rootNode = visuals.nodes.find(n => formatRational(n.center) === '0' && n.logRadius === 2);

    expect(rootNode).toBeTruthy();
    expect(coord.x).toBeCloseTo(rootNode!.x);
    expect(coord.y).toBeCloseTo(rootNode!.y);
  });

  it('should only mark the exact target leaf node as target path', () => {
    setInputs(3, '5/3', '0', 2.0);

    const visuals = component.treeVisuals();
    const targetLeaf = visuals.nodes.find(n => formatRational(n.center) === '5/3' && n.logRadius === -2);
    expect(targetLeaf).toBeTruthy();
    expect(component.isNodeOnTargetPath(targetLeaf!)).toBe(true);

    const siblingLeaf = visuals.nodes.find(n => formatRational(n.center) !== '5/3' && n.logRadius === -2);
    if (siblingLeaf) {
      expect(component.isNodeOnTargetPath(siblingLeaf)).toBe(false);
      
      const edgeToSibling = visuals.edges.find(e => e.x2 === siblingLeaf.x && e.y2 === siblingLeaf.y);
      if (edgeToSibling) {
        expect(component.targetPathEdges().has(edgeToSibling.id)).toBe(false);
      }
    }
  });

  it('should identify junction candidates correctly at integer log-radii', () => {
    setInputs(3, '5/3', '1/3', 1.0);

    expect(component.isEvaluatingJunction()).toBe(true);

    const candidates = component.junctionCandidates();
    // At c = 1/3, prefix center at rho = 1.0 is 0. So targetNodeId is '0_1'.
    // Sibling children are 0_0, 1/3_0, 2/3_0.
    // Parent node is 0_2.
    expect(candidates.nodes.has('0_0')).toBe(true);
    expect(candidates.nodes.has('1/3_0')).toBe(true);
    expect(candidates.nodes.has('2/3_0')).toBe(true);
    expect(candidates.nodes.has('0_2')).toBe(true);

    expect(candidates.edges.has('0_1_to_0_0')).toBe(true);
    expect(candidates.edges.has('0_1_to_1/3_0')).toBe(true);
    expect(candidates.edges.has('0_1_to_2/3_0')).toBe(true);
    expect(candidates.edges.has('0_2_to_0_1')).toBe(true);
  });

  it('should place the parameter circle correctly at fractional log-radii', () => {
    setInputs(3, '5/3', '1/3', 1.5);

    const coord = component.currentParameterCoord();
    const visuals = component.treeVisuals();
    
    const parentNode = visuals.nodes.find(n => n.id === '0_2');
    const childNode = visuals.nodes.find(n => n.id === '0_1');

    expect(parentNode).toBeTruthy();
    expect(childNode).toBeTruthy();
    
    expect(coord.x).toBeCloseTo((parentNode!.x + childNode!.x) / 2);
    expect(coord.y).toBeCloseTo((parentNode!.y + childNode!.y) / 2);
  });

  it('should preserve layout coordinates for 5 non-overlapping baseline cases', () => {
    const cases = [
      {
        p: 3, y: '5/3', c: '0',
        expected: [
          { id: '0_2', x: 400 }, { id: '0_1', x: 360 }, { id: '0_0', x: 300 },
          { id: '0_-1', x: 260 }, { id: '0_-2', x: 220 }, { id: '3_-2', x: 260 },
          { id: '6_-2', x: 300 }, { id: '1_-1', x: 300 }, { id: '2_-1', x: 340 },
          { id: '1/3_0', x: 360 }, { id: '2/3_0', x: 420 }, { id: '2/3_-1', x: 380 },
          { id: '5/3_-1', x: 420 }, { id: '5/3_-2', x: 380 }, { id: '14/3_-2', x: 420 },
          { id: '23/3_-2', x: 460 }, { id: '8/3_-1', x: 460 }, { id: '1/9_1', x: 400 },
          { id: '2/9_1', x: 440 }
        ]
      },
      {
        p: 3, y: '1/3', c: '2/3',
        expected: [
          { id: '0_2', x: 400 }, { id: '0_1', x: 360 }, { id: '0_0', x: 280 },
          { id: '1/3_0', x: 320 }, { id: '1/3_-1', x: 280 }, { id: '1/3_-2', x: 240 },
          { id: '10/3_-2', x: 280 }, { id: '19/3_-2', x: 320 }, { id: '4/3_-1', x: 320 },
          { id: '7/3_-1', x: 360 }, { id: '2/3_0', x: 480 }, { id: '2/3_-1', x: 440 },
          { id: '2/3_-2', x: 400 }, { id: '11/3_-2', x: 440 }, { id: '20/3_-2', x: 480 },
          { id: '5/3_-1', x: 480 }, { id: '8/3_-1', x: 520 }, { id: '1/9_1', x: 400 },
          { id: '2/9_1', x: 440 }
        ]
      },
      {
        p: 3, y: '4/3', c: '0',
        expected: [
          { id: '0_2', x: 400 }, { id: '0_1', x: 360 }, { id: '0_0', x: 266.67 },
          { id: '0_-1', x: 226.67 }, { id: '0_-2', x: 186.67 }, { id: '3_-2', x: 226.67 },
          { id: '6_-2', x: 266.67 }, { id: '1_-1', x: 266.67 }, { id: '2_-1', x: 306.67 },
          { id: '1/3_0', x: 386.67 }, { id: '1/3_-1', x: 346.67 }, { id: '4/3_-1', x: 386.67 },
          { id: '4/3_-2', x: 346.67 }, { id: '13/3_-2', x: 386.67 }, { id: '22/3_-2', x: 426.67 },
          { id: '7/3_-1', x: 426.67 }, { id: '2/3_0', x: 426.67 }, { id: '1/9_1', x: 400 },
          { id: '2/9_1', x: 440 }
        ]
      },
      {
        p: 3, y: '7/3', c: '1',
        expected: [
          { id: '0_2', x: 400 }, { id: '0_1', x: 360 }, { id: '0_0', x: 266.67 },
          { id: '0_-1', x: 226.67 }, { id: '1_-1', x: 266.67 }, { id: '1_-2', x: 226.67 },
          { id: '4_-2', x: 266.67 }, { id: '7_-2', x: 306.67 }, { id: '2_-1', x: 306.67 },
          { id: '1/3_0', x: 386.67 }, { id: '1/3_-1', x: 346.67 }, { id: '4/3_-1', x: 386.67 },
          { id: '7/3_-1', x: 426.67 }, { id: '7/3_-2', x: 386.67 }, { id: '16/3_-2', x: 426.67 },
          { id: '25/3_-2', x: 466.67 }, { id: '2/3_0', x: 426.67 }, { id: '1/9_1', x: 400 },
          { id: '2/9_1', x: 440 }
        ]
      },
      {
        p: 3, y: '8/3', c: '2/3',
        expected: [
          { id: '0_2', x: 400 }, { id: '0_1', x: 360 }, { id: '0_0', x: 320 },
          { id: '1/3_0', x: 360 }, { id: '2/3_0', x: 400 }, { id: '2/3_-1', x: 320 },
          { id: '2/3_-2', x: 280 }, { id: '11/3_-2', x: 320 }, { id: '20/3_-2', x: 360 },
          { id: '5/3_-1', x: 400 }, { id: '8/3_-1', x: 480 }, { id: '8/3_-2', x: 440 },
          { id: '17/3_-2', x: 480 }, { id: '26/3_-2', x: 520 }, { id: '1/9_1', x: 400 },
          { id: '2/9_1', x: 440 }
        ]
      }
    ];

    for (const cs of cases) {
      setInputs(cs.p, cs.y, cs.c, 2.0);

      const visuals = component.treeVisuals();
      const rootNode = visuals.nodes.find(n => n.id === '0_2');
      expect(rootNode).toBeTruthy();
      for (const expNode of cs.expected) {
        const actNode = visuals.nodes.find(n => n.id === expNode.id);
        expect(actNode).toBeTruthy();
        expect(actNode!.x - rootNode!.x).toBeCloseTo(expNode.x - 400, 1);
      }
    }
  });

  it('should resolve overlaps for y=52/9, c=7, p=3', () => {
    setInputs(3, '52/9', '7', 2.0);

    const visuals = component.treeVisuals();
    
    const hasOverlap = (nodes: { x: number; logRadius: number }[]) => {
      const byLevel = new Map<number, number[]>();
      for (const node of nodes) {
        if (!byLevel.has(node.logRadius)) {
          byLevel.set(node.logRadius, []);
        }
        byLevel.get(node.logRadius)!.push(node.x);
      }
      for (const [level, xCoords] of byLevel.entries()) {
        xCoords.sort((a, b) => a - b);
        for (let i = 1; i < xCoords.length; i++) {
          if (xCoords[i] - xCoords[i - 1] < 39.9) {
            return true;
          }
        }
      }
      return false;
    };

    expect(hasOverlap(visuals.nodes)).toBe(false);
  });

  it('should identify target, parameter, and overlap paths correctly', () => {
    setInputs(3, '8/3', '5/3', 2.0);

    const visuals = component.treeVisuals();
    
    // Find the edge 0_1 (c=0, level 1) -> 2/3_0 (c=2/3, level 0) (shared)
    const sharedEdge = visuals.edges.find(e => 
      e.id.includes('0_1') && e.id.includes('2/3_0')
    );
    expect(sharedEdge).toBeTruthy();
    expect(component.targetPathEdges().has(sharedEdge!.id)).toBe(true);
    expect(component.parameterPathEdges().has(sharedEdge!.id)).toBe(true);

    // Find the target-only edge 2/3_0 (c=2/3, level 0) -> 8/3_-1 (c=8/3, level -1)
    const targetOnlyEdge = visuals.edges.find(e => 
      e.id.includes('2/3_0') && e.id.includes('8/3_-1')
    );
    expect(targetOnlyEdge).toBeTruthy();
    expect(component.targetPathEdges().has(targetOnlyEdge!.id)).toBe(true);
    expect(component.parameterPathEdges().has(targetOnlyEdge!.id)).toBe(false);

    // Find the parameter-only edge 2/3_0 (c=2/3, level 0) -> 5/3_-1 (c=5/3, level -1)
    const paramOnlyEdge = visuals.edges.find(e => 
      e.id.includes('2/3_0') && e.id.includes('5/3_-1')
    );
    expect(paramOnlyEdge).toBeTruthy();
    expect(component.targetPathEdges().has(paramOnlyEdge!.id)).toBe(false);
    expect(component.parameterPathEdges().has(paramOnlyEdge!.id)).toBe(true);
  });

  it('should calculate correct rhoLineRange and position label on the opposite side of the target', () => {
    // Case 1: Parameter at c = 0, Target at 5/3, p = 3, rho = 2.0 (covers everything)
    setInputs(3, '5/3', '0', 2.0);
    const rangeRoot = component.rhoLineRange();
    const visualsRoot = component.treeVisuals();
    
    // Since rho = 2.0, all leaves should be in the disk, so range should span from the leftmost leaf to the rightmost leaf
    const leaves = visualsRoot.nodes.filter(n => n.logRadius === component.rhoMin);
    const leafXCoords = leaves.map(l => l.x);
    const expectedMinX = Math.min(...leafXCoords);
    const expectedMaxX = Math.max(...leafXCoords);
    expect(rangeRoot.x1).toBeCloseTo(expectedMinX);
    expect(rangeRoot.x2).toBeCloseTo(expectedMaxX);

    // Case 2: rho = -2.0 (covers only the current parameter leaf, which is 0_-2)
    setInputs(3, '5/3', '0', -2.0);
    const rangeLeaf = component.rhoLineRange();
    const visualsLeaf = component.treeVisuals();
    const paramLeaf = visualsLeaf.nodes.find(n => formatRational(n.center) === '0' && n.logRadius === -2);
    expect(paramLeaf).toBeTruthy();
    expect(rangeLeaf.x1).toBeCloseTo(paramLeaf!.x - 15);
    expect(rangeLeaf.x2).toBeCloseTo(paramLeaf!.x + 15);

    // Case 3: Label position when target is to the right of parameter.
    // Target is 5/3 (x is on the right), parameter is 0 (x is on the left).
    const targetNode = visualsLeaf.nodes.find(n => formatRational(n.center) === '5/3' && n.logRadius === -2);
    const paramNode = visualsLeaf.nodes.find(n => formatRational(n.center) === '0' && n.logRadius === -2);
    expect(targetNode).toBeTruthy();
    expect(paramNode).toBeTruthy();
    expect(targetNode!.x).toBeGreaterThan(paramNode!.x); // Target is to the right
    
    const labelX_left = component.rhoLabelX();
    // Since target is on the right, label should be on the left side of the line: x1 - 5 - 73 = x1 - 78, clamped to >= 5
    const expectedLeftLabelX = Math.max(5, rangeLeaf.x1 - 5 - 73);
    expect(labelX_left).toBeCloseTo(expectedLeftLabelX);

    // Case 4: Label position when target is to the left of parameter.
    // Set parameter to 8/3 (to the right of target 5/3)
    setInputs(3, '5/3', '8/3', -2.0);
    const rangeLeafRight = component.rhoLineRange();
    const visualsRight = component.treeVisuals();
    const targetNodeLeft = visualsRight.nodes.find(n => formatRational(n.center) === '5/3' && n.logRadius === -2);
    const paramNodeRight = visualsRight.nodes.find(n => formatRational(n.center) === '8/3' && n.logRadius === -2);
    expect(targetNodeLeft).toBeTruthy();
    expect(paramNodeRight).toBeTruthy();
    expect(targetNodeLeft!.x).toBeLessThan(paramNodeRight!.x); // Target is to the left
    
    const labelX_right = component.rhoLabelX();
    // Since target is on the left, label should be on the right side of the line: x2 + 5, clamped to <= svgWidth - 73 - 5
    const expectedRightLabelX = Math.min(component.svgWidth() - 73 - 5, rangeLeafRight.x2 + 5);
    expect(labelX_right).toBeCloseTo(expectedRightLabelX);

    // Case 5: Verify that the line range covers inactive/collapsed subtree stubs.
    // Set inputs to: c_curr = 0, target = 5/3, p = 3, rho = 1.0.
    // Sibling stub 1/3_0 is collapsed, but is within the disk D(0, 3).
    setInputs(3, '5/3', '0', 1.0);
    const rangeStub = component.rhoLineRange();
    const visualsStub = component.treeVisuals();
    const inactiveStub = visualsStub.nodes.find(n => formatRational(n.center) === '1/3' && n.logRadius === 0);
    
    expect(inactiveStub).toBeTruthy();
    expect(inactiveStub!.isActive).toBe(false); // Make sure it is indeed collapsed
    // Verify that the line range includes the X coordinate of the inactive stub
    expect(rangeStub.x1).toBeLessThanOrEqual(inactiveStub!.x);
    expect(rangeStub.x2).toBeGreaterThanOrEqual(inactiveStub!.x);

    // Case 6: Verify continuous line range interpolation at fractional log-radii.
    // Set inputs to: c_curr = 0, target = 5/3, p = 3, rho = 0.5.
    setInputs(3, '5/3', '0', 0.0);
    const rangeAt0 = component.rhoLineRange();
    
    setInputs(3, '5/3', '0', 1.0);
    const rangeAt1 = component.rhoLineRange();
    
    setInputs(3, '5/3', '0', 0.5);
    const rangeAtHalf = component.rhoLineRange();
    
    expect(rangeAtHalf.x1).toBeCloseTo((rangeAt0.x1 + rangeAt1.x1) / 2);
    expect(rangeAtHalf.x2).toBeCloseTo((rangeAt0.x2 + rangeAt1.x2) / 2);
  });

  it('should position active nodes at standard level heights and inactive stub nodes at 70% level height', () => {
    setInputs(3, '5/3', '0', 2.0);
    const visuals = component.treeVisuals();
    const stepY = (component.svgHeight - 2 * component.paddingY) / (component.rhoMax - component.rhoMin);

    // Find active nodes (e.g. root node 0_2 at y = paddingY = 40)
    const rootNode = visuals.nodes.find(n => n.id === '0_2');
    expect(rootNode).toBeTruthy();
    expect(rootNode!.y).toBeCloseTo(40);

    // Find active child at level 1: 0_1
    const node0_1 = visuals.nodes.find(n => n.id === '0_1');
    expect(node0_1).toBeTruthy();
    expect(node0_1!.y).toBeCloseTo(40 + stepY);

    // Find inactive child at level 1
    const inactiveNode = visuals.nodes.find(n => !n.isActive && n.logRadius === 1);
    expect(inactiveNode).toBeTruthy();
    // Its parent is active at level 2 (y=40), so its y should be parentY + 0.7 * stepY
    expect(inactiveNode!.y).toBeCloseTo(40 + 0.7 * stepY);
  });
});

