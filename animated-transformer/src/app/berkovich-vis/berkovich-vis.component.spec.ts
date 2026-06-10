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

import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideMarkdown } from 'ngx-markdown';
import { BerkovichVisComponent } from './berkovich-vis.component';
import { 
  parseToRational, 
  getValuation, 
  getPadicDigits,
  getAlignedDigits,
  subtract,
  formatRational
} from '../../lib/berkovich/berkovich';

describe('P-adic Arithmetic Helpers', () => {
  it('should parse integer and rational inputs correctly', () => {
    expect(formatRational(parseToRational('5'))).toBe('5');
    expect(formatRational(parseToRational('5/3'))).toBe('5/3');
    expect(formatRational(parseToRational('-1/3'))).toBe('-1/3');
    expect(formatRational(parseToRational('1.25'))).toBe('5/4');
    expect(formatRational(parseToRational('-0.5'))).toBe('-1/2');
  });

  it('should calculate p-adic valuations correctly', () => {
    const p3 = 3n;
    const p2 = 2n;

    // Valuation of 9 is 2 in base 3, 0 in base 2
    expect(getValuation(parseToRational('9'), p3)).toBe(2);
    expect(getValuation(parseToRational('9'), p2)).toBe(0);

    // Valuation of 5/3 in base 3 is -1
    expect(getValuation(parseToRational('5/3'), p3)).toBe(-1);

    // Valuation of 1.25 (5/4) in base 2 is -2
    expect(getValuation(parseToRational('1.25'), p2)).toBe(-2);
    expect(getValuation(parseToRational('1.25'), 5n)).toBe(1); // 5/4 valuation in base 5 is 1

    // Valuation of 0 should return a high representation for infinity (30)
    expect(getValuation(parseToRational('0'), p3)).toBe(30);
  });

  it('should compute p-adic digits correctly', () => {
    const p3 = 3n;
    
    // 5 = 2*3^0 + 1*3^1. Valuation = 0. Digits = [2, 1, 0, 0]
    const res5 = getPadicDigits(parseToRational('5'), p3, 4);
    expect(res5.startPower).toBe(0);
    expect(res5.digits).toEqual([2, 1, 0, 0]);

    // 5/3 = 2*3^-1 + 1*3^0. Valuation = -1. Digits = [2, 1, 0, 0]
    const res53 = getPadicDigits(parseToRational('5/3'), p3, 4);
    expect(res53.startPower).toBe(-1);
    expect(res53.digits).toEqual([2, 1, 0, 0]);

    // -1 in base 3 is 2*3^0 + 2*3^1 + 2*3^2 + ...
    const resNeg1 = getPadicDigits(parseToRational('-1'), p3, 4);
    expect(resNeg1.startPower).toBe(0);
    expect(resNeg1.digits).toEqual([2, 2, 2, 2]);
  });

  it('should align digits across a fixed range of powers', () => {
    const p3 = 3n;
    const val = parseToRational('5/3'); // 2*3^-1 + 1*3^0
    
    const aligned = getAlignedDigits(val, p3, -2, 2);
    // Expected aligned:
    // power -2: 0
    // power -1: 2
    // power  0: 1
    // power  1: 0
    // power  2: 0
    expect(aligned).toEqual([
      { power: -2, digit: 0 },
      { power: -1, digit: 2 },
      { power:  0, digit: 1 },
      { power:  1, digit: 0 },
      { power:  2, digit: 0 }
    ]);
  });
});

describe('BerkovichVisComponent', () => {
  let component: BerkovichVisComponent;
  let fixture: ComponentFixture<BerkovichVisComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BerkovichVisComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([]), provideMarkdown()]
    }).compileComponents();

    fixture = TestBed.createComponent(BerkovichVisComponent);
    component = fixture.componentInstance;
    
    // Set default test values
    component.prime.set(3);
    component.targetInput.set('5/3');
    component.centerInput.set('0');
    component.logRadiusInput.set('2.0');
    component.learningRateInput.set('0.5');

    fixture.detectChanges();
  });

  it('should create and initialize correctly', () => {
    expect(component).toBeTruthy();
    expect(component.stepCount()).toBe(0);
    expect(component.currentLogRadius()).toBe(2.0);
    expect(formatRational(component.currentCenter())).toBe('0');
  });

  it('should perform continuous gradient steps and snapping', () => {
    // Set starting log-radius to 1.8 (on a Type III edge)
    component.currentLogRadius.set(1.8);
    component.stepCount.set(0);

    // Target is y = 5/3.
    // Distance from c=0 is d = 1.0 (since valuation of 5/3 is -1, d = -val = 1).
    // At step 0, rho = 1.8. Since rho = 1.8 >= d = 1.0, dL/drho = +1.
    // Proposed update is rho = 1.8 - 0.5 * 1 = 1.3.
    // Since 1.3 does not cross an integer (remains in [1, 2]), we update to 1.3.
    component.step();
    expect(component.stepCount()).toBe(1);
    expect(component.currentLogRadius()).toBeCloseTo(1.3);
    expect(formatRational(component.currentCenter())).toBe('0');

    // Next step: rho = 1.3 >= d = 1.0, dL/drho = +1.
    // Proposed update is rho = 1.3 - 0.5 * 1 = 0.8.
    // Since this crosses 1.0 (an integer boundary), it snaps to 1.0.
    component.step();
    expect(component.stepCount()).toBe(2);
    expect(component.currentLogRadius()).toBeCloseTo(1.0);
    expect(formatRational(component.currentCenter())).toBe('0');
  });

  it('should perform vertex transitions at integer boundaries', () => {
    // Set state exactly at vertex rho = 1.0
    component.currentCenter.set(parseToRational('0'));
    component.currentLogRadius.set(1.0);
    component.stepCount.set(0);
    
    // Target is y = 5/3.
    // Since rho = 1.0 (vertex), we do branch transition.
    // It should choose Child 2 (center = 2/3), nextLogRadius = 1.0 - 0.5 = 0.5.
    component.step();
    
    expect(component.stepCount()).toBe(1);
    expect(component.currentLogRadius()).toBeCloseTo(0.5);
    expect(formatRational(component.currentCenter())).toBe('2/3');
  });

  it('should support undoing the last step and restoring previous state', () => {
    // Initialize starting state
    component.currentLogRadius.set(1.8);
    component.stepCount.set(0);
    component.history.set([{
      step: 0,
      center: parseToRational('0'),
      logRadius: 1.8,
      loss: 2.0,
      type: 'Initialization'
    }]);

    // Step 1: rho -> 1.3
    component.step();
    expect(component.stepCount()).toBe(1);
    expect(component.currentLogRadius()).toBeCloseTo(1.3);

    // Step 2: rho -> 1.0 (snapped)
    component.step();
    expect(component.stepCount()).toBe(2);
    expect(component.currentLogRadius()).toBeCloseTo(1.0);

    // Undo Step 2 -> restores Step 1 (rho = 1.3)
    component.undo();
    expect(component.stepCount()).toBe(1);
    expect(component.currentLogRadius()).toBeCloseTo(1.3);
    expect(component.history().length).toBe(2);

    // Undo Step 1 -> restores Step 0 (rho = 1.8)
    component.undo();
    expect(component.stepCount()).toBe(0);
    expect(component.currentLogRadius()).toBeCloseTo(1.8);
    expect(component.history().length).toBe(1);

    // Undo at initialization level should be a no-op
    component.undo();
    expect(component.stepCount()).toBe(0);
    expect(component.currentLogRadius()).toBe(1.8);
    expect(component.history().length).toBe(1);
  });

  it('should synchronize centerInput and centerDigitsInput bidirectionally', () => {
    component.prime.set(3);
    component.centerInput.set('0');
    fixture.detectChanges();
    expect(component.centerDigitsInput()).toBe('00.00');

    component.centerInput.set('5/3');
    component.onCenterBlur();
    fixture.detectChanges();
    expect(component.centerDigitsInput()).toBe('01.20');

    component.centerDigitsInput.set('10.00');
    component.onCenterDigitsBlur();
    fixture.detectChanges();
    expect(component.centerInput()).toBe('3');
    expect(component.centerDigitsInput()).toBe('10.00');
  });

  it('should not show children under inactive node 1/9 at level 1 when c=0 and y=5/3', () => {
    component.prime.set(3);
    component.targetInput.set('5/3');
    component.centerInput.set('0');
    fixture.detectChanges();

    const visuals = component.treeVisuals();
    const node19 = visuals.nodes.find(n => formatRational(n.center) === '1/9' && n.logRadius === 1);
    
    expect(node19).toBeTruthy();
    expect(node19!.isActive).toBe(false);

    const childOf19 = visuals.nodes.find(n => n.id.startsWith('1/9_0') || n.id.startsWith('4/9_0') || n.id.startsWith('7/9_0'));
    expect(childOf19).toBeUndefined();
  });

  it('should only expand the exact active paths to c and y at negative levels', () => {
    component.prime.set(3);
    component.targetInput.set('5/3');
    component.centerInput.set('0');
    fixture.detectChanges();

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

  it('should format digitRows from high to low powers (p^2 down to p^-2)', () => {
    component.prime.set(3);
    component.targetInput.set('5/3');
    component.centerInput.set('0');
    fixture.detectChanges();

    const rows = component.digitRows();
    expect(rows.length).toBe(5);
    expect(rows[0].power).toBe(2);   // p^2
    expect(rows[1].power).toBe(1);   // p^1
    expect(rows[2].power).toBe(0);   // p^0
    expect(rows[3].power).toBe(-1);  // p^-1
    expect(rows[4].power).toBe(-2);  // p^-2
  });

  it('should place the parameter circle at the root node when c=1/3 and rho=2', () => {
    component.prime.set(3);
    component.targetInput.set('5/3');
    component.centerInput.set('1/3');
    component.currentLogRadius.set(2.0);
    fixture.detectChanges();

    const coord = component.currentParameterCoord();
    const visuals = component.treeVisuals();
    const rootNode = visuals.nodes.find(n => formatRational(n.center) === '0' && n.logRadius === 2);

    expect(rootNode).toBeTruthy();
    expect(coord.x).toBeCloseTo(rootNode!.x);
    expect(coord.y).toBeCloseTo(rootNode!.y);
  });

  it('should only mark the exact target leaf node as target path', () => {
    component.prime.set(3);
    component.targetInput.set('5/3');
    component.centerInput.set('0');
    fixture.detectChanges();

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

  it('should update displayCenter, displayCenterDigits, and displayLogRadius during steps', () => {
    component.prime.set(3);
    component.targetInput.set('5/3');
    component.centerInput.set('0');
    component.currentLogRadius.set(2.0);
    fixture.detectChanges();

    expect(component.displayCenter()).toBe('0');
    expect(component.displayCenterDigits()).toBe('00.00');
    expect(component.displayLogRadius()).toBe('2.0');

    component.currentCenter.set({ num: 1n, den: 3n });
    component.currentLogRadius.set(1.0);
    component.stepCount.set(1);
    fixture.detectChanges();

    expect(component.displayCenter()).toBe('1/3');
    expect(component.displayCenterDigits()).toBe('00.10');
    expect(component.displayLogRadius()).toBe('1.00');
  });

  it('should synchronize targetInput and targetDigitsInput bidirectionally', () => {
    component.prime.set(3);
    component.targetInput.set('5/3');
    component.onTargetBlur();
    fixture.detectChanges();
    expect(component.targetDigitsInput()).toBe('01.20');

    component.targetDigitsInput.set('01.10');
    component.onTargetDigitsBlur();
    fixture.detectChanges();
    expect(component.targetInput()).toBe('4/3');
  });

  it('should identify target, parameter, and overlap paths correctly', () => {
    component.prime.set(3);
    component.targetInput.set('8/3');
    component.centerInput.set('5/3');
    fixture.detectChanges();

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

  it('should correctly break ties at Type II vertices to choose the branch containing the target', () => {
    component.prime.set(3);
    component.targetInput.set('5/3');
    component.centerInput.set('0');
    component.logRadiusInput.set('1.0');
    component.learningRateInput.set('1.0');
    fixture.detectChanges();

    component.reset();
    fixture.detectChanges();

    expect(component.currentCenter()).toEqual({ num: 0n, den: 1n });
    expect(component.currentLogRadius()).toBe(1.0);

    // Step 1: from level 1.0 to 0.0 (resolves power -1, target digit 2, center becomes 2/3)
    component.step();
    fixture.detectChanges();

    expect(component.currentCenter()).toEqual({ num: 2n, den: 3n });
    expect(component.currentLogRadius()).toBe(0.0);

    // Step 2: from level 0.0 to -1.0 (resolves power 0, target digit 1, center becomes 5/3)
    component.step();
    fixture.detectChanges();

    expect(component.currentCenter()).toEqual({ num: 5n, den: 3n });
    expect(component.currentLogRadius()).toBe(-1.0);
  });

  it('should resolve right-most digits at the top levels and left-most digits at the bottom levels', () => {
    component.prime.set(3);
    
    component.currentLogRadius.set(1.0);
    fixture.detectChanges();
    
    let rows = component.digitRows();
    expect(rows.find(r => r.power === 2)!.isResolved).toBe(false);
    expect(rows.find(r => r.power === 1)!.isResolved).toBe(false);
    expect(rows.find(r => r.power === 0)!.isResolved).toBe(false);
    expect(rows.find(r => r.power === -1)!.isResolved).toBe(false);
    expect(rows.find(r => r.power === -2)!.isResolved).toBe(true);
    
    component.currentLogRadius.set(0.0);
    fixture.detectChanges();
    rows = component.digitRows();
    expect(rows.find(r => r.power === -1)!.isResolved).toBe(true);
    expect(rows.find(r => r.power === 0)!.isResolved).toBe(false);
    
    component.currentLogRadius.set(-1.0);
    fixture.detectChanges();
    rows = component.digitRows();
    expect(rows.find(r => r.power === -1)!.isResolved).toBe(true);
    expect(rows.find(r => r.power === 0)!.isResolved).toBe(true);
    expect(rows.find(r => r.power === 1)!.isResolved).toBe(false);
    
    component.currentLogRadius.set(-2.0);
    fixture.detectChanges();
    rows = component.digitRows();
    expect(rows.find(r => r.power === -1)!.isResolved).toBe(true);
    expect(rows.find(r => r.power === 0)!.isResolved).toBe(true);
    expect(rows.find(r => r.power === 1)!.isResolved).toBe(true);
    expect(rows.find(r => r.power === 2)!.isResolved).toBe(false);
  });

  it('should decrease rho when above the branching level and increase rho when below the branching level', () => {
    component.prime.set(3);
    component.targetInput.set('5/3'); // sequence 01.20, d_branch = 1.0
    component.centerInput.set('2/3'); // sequence 00.20
    component.learningRateInput.set('0.10');
    fixture.detectChanges();
    
    // Case 1: rho = 1.21 (above branching level d_branch = 1.0)
    component.currentCenter.set(parseToRational('2/3'));
    component.currentLogRadius.set(1.21);
    component.stepCount.set(0);
    
    component.step();
    fixture.detectChanges();
    expect(component.currentLogRadius()).toBeCloseTo(1.11);
    expect(formatRational(component.currentCenter())).toBe('2/3');
    
    // Case 2: rho = 0.80 (below branching level d_branch = 1.0 on wrong branch)
    component.currentCenter.set(parseToRational('1/3'));
    component.currentLogRadius.set(0.80);
    component.stepCount.set(0);
    
    component.step();
    fixture.detectChanges();
    expect(component.currentLogRadius()).toBeCloseTo(0.90);
    expect(formatRational(component.currentCenter())).toBe('1/3');
  });

  it('should randomize center and target inputs correctly', () => {
    component.prime.set(3);
    component.randomizeCenterAndTarget();
    fixture.detectChanges();
    
    const c = component.centerInput();
    const y = component.targetInput();
    expect(c).not.toBe(y);
    
    const cSeq = component.centerDigitsInput().replace('.', '');
    const ySeq = component.targetDigitsInput().replace('.', '');
    const cDigits = Array.from(cSeq).map(Number);
    const yDigits = Array.from(ySeq).map(Number);
    expect(cDigits.length).toBe(4);
    expect(yDigits.length).toBe(4);
    
    for (const d of cDigits) {
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThan(3);
    }
    for (const d of yDigits) {
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThan(3);
    }
    
    expect(component.stepCount()).toBe(0);
    expect(component.currentLogRadius()).toBe(2.0);
  });

  it('should identify junction candidates correctly at integer log-radii', () => {
    component.prime.set(3);
    component.targetInput.set('5/3');
    component.centerInput.set('1/3');
    fixture.detectChanges(); // Triggers config reset, sets currentLogRadius to 2.0

    // Now set specific evaluation state
    component.currentLogRadius.set(1.0);
    component.currentCenter.set(parseToRational('1/3'));
    fixture.detectChanges();

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
    component.prime.set(3);
    component.targetInput.set('5/3');
    component.centerInput.set('1/3');
    fixture.detectChanges(); // Triggers config reset

    // Now set specific evaluation state
    component.currentLogRadius.set(1.5);
    component.currentCenter.set(parseToRational('1/3'));
    fixture.detectChanges();

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
      component.prime.set(cs.p);
      component.targetInput.set(cs.y);
      component.centerInput.set(cs.c);
      fixture.detectChanges();

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
    component.prime.set(3);
    component.targetInput.set('52/9');
    component.centerInput.set('7');
    fixture.detectChanges();

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
});


