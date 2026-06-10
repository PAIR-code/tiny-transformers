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
      providers: [provideZonelessChangeDetection(), provideRouter([])]
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
    // Set starting log-radius to 2.8 (on a Type III edge)
    component.currentLogRadius.set(2.8);
    component.stepCount.set(0);

    // Target is y = 5/3.
    // Distance from c=0 is valuation of 5/3, which is 3^-1, so absolute value 3, log-distance d_math = 1. d_branch = 2.0.
    // At step 0, rho = 2.8. Since rho = 2.8 >= d = 2.0, dL/drho = +1.
    // Proposed update is rho = 2.8 - 0.5 * 1 = 2.3.
    // Since 2.3 does not cross an integer (floor is still 2), we update to 2.3.
    component.step();
    expect(component.stepCount()).toBe(1);
    expect(component.currentLogRadius()).toBe(2.3);
    expect(formatRational(component.currentCenter())).toBe('0');

    // Next step: rho = 2.3 >= d = 2.0, dL/drho = +1.
    // Proposed update is rho = 2.3 - 0.5 * 1 = 1.8.
    // Since this crosses 2.0 (an integer boundary), it snaps to 2.0.
    component.step();
    expect(component.stepCount()).toBe(2);
    expect(component.currentLogRadius()).toBe(2.0);
    expect(formatRational(component.currentCenter())).toBe('0');
  });

  it('should perform vertex transitions at integer boundaries', () => {
    // Set state exactly at vertex rho = 1.0
    component.currentCenter.set(parseToRational('2/3'));
    component.currentLogRadius.set(1.0);
    component.stepCount.set(2);
    
    // Target is y = 5/3 (sequence '0 0 1 2').
    // Since rho = 1.0 (vertex), we do branch transition.
    // It should choose Child 1: center = 5/3 (sequence '0 0 1 2'), rho = 0.5.
    component.step();
    
    expect(component.stepCount()).toBe(3);
    expect(component.currentLogRadius()).toBe(0.5);
    expect(formatRational(component.currentCenter())).toBe('5/3');
  });

  it('should support undoing the last step and restoring previous state', () => {
    // Initialize starting state
    component.currentLogRadius.set(2.8);
    component.stepCount.set(0);
    component.history.set([{
      step: 0,
      center: parseToRational('0'),
      logRadius: 2.8,
      loss: 2.0,
      type: 'Initialization'
    }]);

    // Step 1: rho -> 2.3
    component.step();
    expect(component.stepCount()).toBe(1);
    expect(component.currentLogRadius()).toBe(2.3);

    // Step 2: rho -> 2.0 (snapped)
    component.step();
    expect(component.stepCount()).toBe(2);
    expect(component.currentLogRadius()).toBe(2.0);

    // Undo Step 2 -> restores Step 1 (rho = 2.3)
    component.undo();
    expect(component.stepCount()).toBe(1);
    expect(component.currentLogRadius()).toBe(2.3);
    expect(component.history().length).toBe(2);

    // Undo Step 1 -> restores Step 0 (rho = 2.8)
    component.undo();
    expect(component.stepCount()).toBe(0);
    expect(component.currentLogRadius()).toBe(2.8);
    expect(component.history().length).toBe(1);

    // Undo at initialization level should be a no-op
    component.undo();
    expect(component.stepCount()).toBe(0);
    expect(component.currentLogRadius()).toBe(2.8);
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

  it('should not show children under inactive node 1/3 at level 1 when c=0 and y=5/3', () => {
    component.prime.set(3);
    component.targetInput.set('5/3');
    component.centerInput.set('0');
    fixture.detectChanges();

    const visuals = component.treeVisuals();
    const node13 = visuals.nodes.find(n => formatRational(n.center) === '1/3' && n.logRadius === 1);
    
    expect(node13).toBeTruthy();
    expect(node13!.isActive).toBe(false);

    const childOf13 = visuals.nodes.find(n => n.id.startsWith('1/3_0') || n.id.startsWith('4/3_0') || n.id.startsWith('7/3_0'));
    expect(childOf13).toBeUndefined();
  });

  it('should only expand the exact active paths to c and y at negative levels', () => {
    component.prime.set(3);
    component.targetInput.set('5/3');
    component.centerInput.set('0');
    fixture.detectChanges();

    const visuals = component.treeVisuals();
    
    // Node '3_-1' (center 3, level -1, sequence '0 1 0 0') is not on the path to y (5/3, sequence '0 0 1 2') or c (0, sequence '0 0 0 0'). It should exist but be inactive.
    const node3 = visuals.nodes.find(n => formatRational(n.center) === '3' && n.logRadius === -1);
    expect(node3).toBeTruthy();
    expect(node3!.isActive).toBe(false);

    // Node '6_-1' (center 6, level -1, sequence '0 2 0 0') is also not on the active paths, it should exist but be inactive.
    const node6 = visuals.nodes.find(n => formatRational(n.center) === '6' && n.logRadius === -1);
    expect(node6).toBeTruthy();
    expect(node6!.isActive).toBe(false);

    // Grandchildren of these nodes (e.g. '3_-2', '12_-2') should not exist in the visuals list
    const childOf3 = visuals.nodes.find(n => n.id.startsWith('3_-2') || n.id.startsWith('12_-2') || n.id.startsWith('21_-2'));
    expect(childOf3).toBeUndefined();
  });

  it('should format digitRows from high to low powers (p^3 down to p^-3)', () => {
    component.prime.set(3);
    component.targetInput.set('5/3');
    component.centerInput.set('0');
    fixture.detectChanges();

    const rows = component.digitRows();
    expect(rows.length).toBe(7);
    expect(rows[0].power).toBe(3);   // p^3
    expect(rows[1].power).toBe(2);   // p^2
    expect(rows[2].power).toBe(1);   // p^1
    expect(rows[3].power).toBe(0);   // p^0
    expect(rows[4].power).toBe(-1);  // p^-1
    expect(rows[5].power).toBe(-2);  // p^-2
    expect(rows[6].power).toBe(-3);  // p^-3
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
    
    // Find the edge 0_2 (c=0, sequence '0 0 0 0') -> 2/3_1 (c=2/3, sequence '0 0 0 2') (shared)
    const sharedEdge = visuals.edges.find(e => 
      e.id.includes('0_2') && e.id.includes('2/3_1')
    );
    expect(sharedEdge).toBeTruthy();
    expect(component.targetPathEdges().has(sharedEdge!.id)).toBe(true);
    expect(component.parameterPathEdges().has(sharedEdge!.id)).toBe(true);

    // Find the target-only edge 2/3_1 (c=2/3, sequence '0 0 0 2') -> 8/3_0 (c=8/3, sequence '0 0 2 2')
    const targetOnlyEdge = visuals.edges.find(e => 
      e.id.includes('2/3_1') && e.id.includes('8/3_0')
    );
    expect(targetOnlyEdge).toBeTruthy();
    expect(component.targetPathEdges().has(targetOnlyEdge!.id)).toBe(true);
    expect(component.parameterPathEdges().has(targetOnlyEdge!.id)).toBe(false);

    // Find the parameter-only edge 2/3_1 (c=2/3, sequence '0 0 0 2') -> 5/3_0 (c=5/3, sequence '0 0 1 2')
    const paramOnlyEdge = visuals.edges.find(e => 
      e.id.includes('2/3_1') && e.id.includes('5/3_0')
    );
    expect(paramOnlyEdge).toBeTruthy();
    expect(component.targetPathEdges().has(paramOnlyEdge!.id)).toBe(false);
    expect(component.parameterPathEdges().has(paramOnlyEdge!.id)).toBe(true);
  });

  it('should correctly break ties at Type II vertices to choose the branch containing the target', () => {
    component.prime.set(3);
    component.targetInput.set('5/3');
    component.centerInput.set('0');
    component.logRadiusInput.set('2.0');
    component.learningRateInput.set('1.0');
    fixture.detectChanges();

    component.reset();
    fixture.detectChanges();

    expect(component.currentCenter()).toEqual({ num: 0n, den: 1n });
    expect(component.currentLogRadius()).toBe(2.0);

    // Step 1: from level 2.0 to 1.0 (resolves power -1, target digit 2, moving center sequence from '0 0 0 0' to '0 0 0 2')
    component.step();
    fixture.detectChanges();

    expect(component.currentCenter()).toEqual({ num: 2n, den: 3n });
    expect(component.currentLogRadius()).toBe(1.0);

    // Step 2: from level 1.0 to 0.0 (resolves power 0, target digit 1, moving center sequence from '0 0 0 2' to '0 0 1 2')
    component.step();
    fixture.detectChanges();

    expect(component.currentCenter()).toEqual({ num: 5n, den: 3n });
    expect(component.currentLogRadius()).toBe(0.0);
  });

  it('should resolve right-most digits at the top levels and left-most digits at the bottom levels', () => {
    component.prime.set(3);
    
    component.currentLogRadius.set(2.0);
    fixture.detectChanges();
    
    let rows = component.digitRows();
    expect(rows.find(r => r.power === 2)!.isResolved).toBe(false);
    expect(rows.find(r => r.power === 1)!.isResolved).toBe(false);
    expect(rows.find(r => r.power === 0)!.isResolved).toBe(false);
    expect(rows.find(r => r.power === -1)!.isResolved).toBe(false);
    
    component.currentLogRadius.set(1.0);
    fixture.detectChanges();
    rows = component.digitRows();
    expect(rows.find(r => r.power === -1)!.isResolved).toBe(false);
    
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
    component.targetInput.set('5/3'); // sequence 0 0 1 2, d_branch = 2.0
    component.centerInput.set('0'); // sequence 0 0 0 0
    component.learningRateInput.set('0.10');
    
    // Case 1: rho = 2.21 (above branching level d_branch = 2.0)
    component.currentCenter.set(parseToRational('0'));
    component.currentLogRadius.set(2.21);
    component.stepCount.set(0);
    fixture.detectChanges();
    
    component.step();
    fixture.detectChanges();
    expect(component.currentLogRadius()).toBeCloseTo(2.11);
    expect(formatRational(component.currentCenter())).toBe('0');
    
    // Case 2: rho = 1.80 (below branching level d_branch = 2.0 on wrong branch)
    component.currentCenter.set(parseToRational('0'));
    component.currentLogRadius.set(1.80);
    component.stepCount.set(0);
    fixture.detectChanges();
    
    component.step();
    fixture.detectChanges();
    expect(component.currentLogRadius()).toBeCloseTo(1.90);
    expect(formatRational(component.currentCenter())).toBe('0');
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
});
