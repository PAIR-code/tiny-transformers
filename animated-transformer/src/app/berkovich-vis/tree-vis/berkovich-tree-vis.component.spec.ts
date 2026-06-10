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
    expect(candidates.nodes.has('0_0')).toBe(true);
    expect(candidates.nodes.has('1/3_0')).toBe(true);
    expect(candidates.nodes.has('2/3_0')).toBe(true);

    expect(candidates.edges.has('0_1_to_0_0')).toBe(true);
    expect(candidates.edges.has('0_1_to_1/3_0')).toBe(true);
    expect(candidates.edges.has('0_1_to_2/3_0')).toBe(true);
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
});

