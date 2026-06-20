/* Copyright 2026 Google LLC. All Rights Reserved.
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
==============================================================================*/

import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideMarkdown, KATEX_OPTIONS, SANITIZE, MarkedKatexOptions } from 'ngx-markdown';
import { SecurityContext, provideZonelessChangeDetection } from '@angular/core';
import { BerkovichGlossaryComponent } from './berkovich-glossary.component';
import {
  getValuation,
  getAlignedDigits,
  parseToRational,
  formatRational,
  simplify,
  add,
} from '../../lib/berkovich/berkovich';

// ============================================================================
// UNIT TESTS: p-adic math library functions
// These verify correctness against the paper berkovich.tex definitions.
// ============================================================================

describe('p-adic valuation (getValuation)', () => {
  // Per berkovich.tex line 5:
  //   "ν_p(x) is the exponent of the highest power of p dividing x"
  //   which equals min power n such that a_n ≠ 0 in x = Σ a_n p^n.
  //
  // Example from the paper:
  //   1.25 = 1·2^{-2} + 0·2^{-1} + 1·2^0 = 1.01_2  ⟹  ν_2(1.25) = -2

  it('should compute ν_2(1.25) = -2 (paper example, line 5)', () => {
    // 1.25 = 5/4
    const r = parseToRational('1.25'); // decimal parse → 5/4
    const v = getValuation(r, 2n);
    expect(v.type).toBe('finite');
    expect((v as { value: number }).value).toBe(-2);
  });

  it('should compute ν_3(5/3) = -1', () => {
    // 5/3: numerator 5 has no factor of 3, denominator 3 has one factor of 3.
    // ν_3(5/3) = 0 - 1 = -1
    const r = parseToRational('5/3');
    const v = getValuation(r, 3n);
    expect(v.type).toBe('finite');
    expect((v as { value: number }).value).toBe(-1);
  });

  it('should compute ν_3(2/3) = -1', () => {
    // 2/3 = 2·3^{-1}, so valuation is -1
    const r = parseToRational('2/3');
    const v = getValuation(r, 3n);
    expect(v.type).toBe('finite');
    expect((v as { value: number }).value).toBe(-1);
  });

  it('should compute ν_3(9) = 2', () => {
    // 9 = 3^2, so ν_3(9) = 2
    const r = parseToRational('9');
    const v = getValuation(r, 3n);
    expect(v.type).toBe('finite');
    expect((v as { value: number }).value).toBe(2);
  });

  it('should compute ν_3(1) = 0', () => {
    // 1 = 1·3^0, no factors of 3
    const r = parseToRational('1');
    const v = getValuation(r, 3n);
    expect(v.type).toBe('finite');
    expect((v as { value: number }).value).toBe(0);
  });

  it('should compute ν_3(6) = 1', () => {
    // 6 = 2·3, so ν_3(6) = 1
    const r = parseToRational('6');
    const v = getValuation(r, 3n);
    expect(v.type).toBe('finite');
    expect((v as { value: number }).value).toBe(1);
  });

  it('should return pos-infinity for zero', () => {
    const r = parseToRational('0');
    const v = getValuation(r, 3n);
    expect(v.type).toBe('pos-infinity');
  });

  it('should compute ν_3(46/9) = -2', () => {
    // 46/9: 46 has no factor of 3, 9 = 3^2, so ν = 0-2 = -2
    // In 3-adic: 46/9 = 1·3^1 + 2·3^0 + 0·3^{-1} + 1·3^{-2} + ...
    const r = parseToRational('46/9');
    const v = getValuation(r, 3n);
    expect(v.type).toBe('finite');
    expect((v as { value: number }).value).toBe(-2);
  });
});

describe('getAlignedDigits', () => {
  // The digit at power k is the coefficient a_k in x = Σ a_n p^n.
  // getAlignedDigits returns columns from minPower to maxPower in ascending order.

  it('should produce correct 3-adic digits for 5/3 (powers -3 to 3)', () => {
    // 5/3 in base 3: ν = -1
    // 5/3 = 2·3^{-1} + 1·3^0  (check: 2/3 + 1 = 5/3 ✓)
    const r = parseToRational('5/3');
    const cols = getAlignedDigits(r, 3n, -3, 3);
    // cols are from power=-3 to power=3 in ascending order
    const digitMap = new Map(cols.map(c => [c.power, c.digit]));
    expect(digitMap.get(-3)).toBe(0);
    expect(digitMap.get(-2)).toBe(0);
    expect(digitMap.get(-1)).toBe(2); // 5/3 = 2·3^{-1} + 1·3^0
    expect(digitMap.get(0)).toBe(1);
    expect(digitMap.get(1)).toBe(0);
    expect(digitMap.get(2)).toBe(0);
    expect(digitMap.get(3)).toBe(0);
  });

  it('should produce correct 3-adic digits for 2/3', () => {
    // 2/3 = 2·3^{-1}, so only digit at p^{-1} is 2
    const r = parseToRational('2/3');
    const cols = getAlignedDigits(r, 3n, -3, 3);
    const digitMap = new Map(cols.map(c => [c.power, c.digit]));
    expect(digitMap.get(-1)).toBe(2);
    expect(digitMap.get(0)).toBe(0);
    expect(digitMap.get(1)).toBe(0);
  });

  it('should produce correct 2-adic digits for 1.25 = 5/4 (paper example)', () => {
    // 1.25 = 5/4 = 1·2^{-2} + 0·2^{-1} + 1·2^0 = 1.01_2 per the paper
    const r = parseToRational('1.25');
    const cols = getAlignedDigits(r, 2n, -3, 3);
    const digitMap = new Map(cols.map(c => [c.power, c.digit]));
    expect(digitMap.get(-3)).toBe(0);
    expect(digitMap.get(-2)).toBe(1); // coefficient of 2^{-2}
    expect(digitMap.get(-1)).toBe(0); // coefficient of 2^{-1}
    expect(digitMap.get(0)).toBe(1);  // coefficient of 2^0
    expect(digitMap.get(1)).toBe(0);
    expect(digitMap.get(2)).toBe(0);
    expect(digitMap.get(3)).toBe(0);
  });
});

describe('valuation is the LOWEST non-zero power (rightmost in high-to-low display)', () => {
  // This test validates the "intuitive digit view" statement in the glossary.
  // In our display, digits go from high powers (left) to low powers (right).
  // The valuation ν_p(x) equals the MINIMUM power with a_n ≠ 0,
  // which appears as the RIGHTMOST non-zero digit in the strip.

  it('for 5/3 in base 3, the rightmost non-zero digit is at power -1, matching ν₃(5/3) = -1', () => {
    const r = parseToRational('5/3');
    const cols = getAlignedDigits(r, 3n, -3, 3);
    // Find the minimum power with non-zero digit
    const nonZeroPowers = cols.filter(c => c.digit !== 0).map(c => c.power);
    const minNonZeroPower = Math.min(...nonZeroPowers);
    const v = getValuation(r, 3n);
    expect(v.type).toBe('finite');
    expect((v as { value: number }).value).toBe(minNonZeroPower);
    expect(minNonZeroPower).toBe(-1);
  });

  it('for 1.25 in base 2, the rightmost non-zero digit is at power -2, matching ν₂(1.25) = -2', () => {
    const r = parseToRational('1.25');
    const cols = getAlignedDigits(r, 2n, -3, 3);
    const nonZeroPowers = cols.filter(c => c.digit !== 0).map(c => c.power);
    const minNonZeroPower = Math.min(...nonZeroPowers);
    const v = getValuation(r, 2n);
    expect(v.type).toBe('finite');
    expect((v as { value: number }).value).toBe(minNonZeroPower);
    expect(minNonZeroPower).toBe(-2);
  });

  it('for 9 in base 3, the rightmost non-zero digit is at power 2, matching ν₃(9) = 2', () => {
    const r = parseToRational('9');
    const cols = getAlignedDigits(r, 3n, -3, 3);
    const nonZeroPowers = cols.filter(c => c.digit !== 0).map(c => c.power);
    const minNonZeroPower = Math.min(...nonZeroPowers);
    const v = getValuation(r, 3n);
    expect(v.type).toBe('finite');
    expect((v as { value: number }).value).toBe(minNonZeroPower);
    expect(minNonZeroPower).toBe(2);
  });
});

// ============================================================================
// COMPONENT TESTS: BerkovichGlossaryComponent
// ============================================================================

describe('BerkovichGlossaryComponent', () => {
  let fixture: ComponentFixture<BerkovichGlossaryComponent>;
  let component: BerkovichGlossaryComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BerkovichGlossaryComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideMarkdown({
          sanitize: {
            provide: SANITIZE,
            useValue: SecurityContext.NONE,
          },
        }),
        {
          provide: KATEX_OPTIONS,
          useValue: {
            nonStandard: true
          } as MarkedKatexOptions & { nonStandard?: boolean },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BerkovichGlossaryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Valuation Playground', () => {
    it('should compute ν₃(5/3) = -1 with default inputs', () => {
      // Default: valInput='5/3', valPrime=3
      const result = component.valResult();
      expect(result.type).toBe('finite');
      expect((result as { value: number }).value).toBe(-1);
    });

    it('should highlight the digit at the valuation power', () => {
      // For 5/3 in base 3, ν = -1
      expect(component.isValuationMatch(-1)).toBe(true);
      expect(component.isValuationMatch(0)).toBe(false);
      expect(component.isValuationMatch(1)).toBe(false);
    });

    it('should show digit 2 at power -1 for 5/3 in base 3', () => {
      const digits = component.valDigits();
      const atMinus1 = digits.find(d => d.power === -1);
      expect(atMinus1).toBeDefined();
      expect(atMinus1!.digit).toBe(2);
    });

    it('should show digit 1 at power 0 for 5/3 in base 3', () => {
      const digits = component.valDigits();
      const atZero = digits.find(d => d.power === 0);
      expect(atZero).toBeDefined();
      expect(atZero!.digit).toBe(1);
    });

    it('should report an error for invalid fraction input', () => {
      component.onValInputChange('abc');
      fixture.detectChanges();
      expect(component.valInputError()).toBeTruthy();
    });

    it('should clear error on valid input', () => {
      component.onValInputChange('abc');
      fixture.detectChanges();
      expect(component.valInputError()).toBeTruthy();

      component.onValInputChange('2/3');
      fixture.detectChanges();
      expect(component.valInputError()).toBe('');
    });

    it('should report an error for invalid digit sequence input', () => {
      component.onValDigitsInputChange('xyz');
      fixture.detectChanges();
      expect(component.valDigitsError()).toBeTruthy();
    });

    it('should bidirectionally sync fraction → digits', () => {
      component.onValInputChange('2/3');
      fixture.detectChanges();
      // 2/3 in base 3 = digit 2 at power -1, so digits string "0000.200"
      expect(component.valDigitsInput()).toContain('2');
    });

    it('should bidirectionally sync digits → fraction', () => {
      component.onValDigitsInputChange('0001.000');
      fixture.detectChanges();
      // 0001.000 in base 3 = 1·3^0 = 1
      expect(component.valInput()).toBe('1');
    });
  });

  describe('Hsia Kernel Playground', () => {
    it('should report an error for invalid center input', () => {
      component.onHsiaCxChange('bad');
      fixture.detectChanges();
      expect(component.hsiaCxError()).toBeTruthy();
    });

    it('should clear error on valid center input', () => {
      component.onHsiaCxChange('bad');
      fixture.detectChanges();
      expect(component.hsiaCxError()).toBeTruthy();

      component.onHsiaCxChange('1/3');
      fixture.detectChanges();
      expect(component.hsiaCxError()).toBe('');
    });
  });

  describe('Absolute Value Display', () => {
    it('should format |5/3|₃ = 3¹ = 3 correctly', () => {
      // Default: 5/3 with p=3 → ν₃ = -1 → |x|₃ = 3^1 = 3
      const html = component.formatAbsoluteValue();
      expect(html).toContain('3<sup>1</sup>');
      expect(html).toContain('= 3');
    });

    it('should format |9|₃ = 3⁻² correctly', () => {
      component.onValInputChange('9');
      fixture.detectChanges();
      const html = component.formatAbsoluteValue();
      // ν₃(9) = 2, so |9|₃ = 3^(-2) = 1/9 ≈ 0.1111
      expect(html).toContain('3<sup>-2</sup>');
    });

    it('should return 0 for zero input', () => {
      component.onValInputChange('0');
      fixture.detectChanges();
      expect(component.formatAbsoluteValue()).toBe('0');
    });
  });

  describe('Disk Equivalence Checker', () => {
    it('should report equivalent when same ρ and centers within disk', () => {
      // x = (0, ρ=-1), y = (0, ρ=-1) → same point trivially
      component.onHsiaCxChange('0');
      component.onHsiaCyChange('0');
      component.hsiaRx.set(-1);
      component.hsiaRy.set(-1);
      fixture.detectChanges();
      expect(component.hsiaResult().diskEquivalent).toBe(true);
    });

    it('should report not equivalent when different ρ', () => {
      component.onHsiaCxChange('0');
      component.onHsiaCyChange('0');
      component.hsiaRx.set(-1);
      component.hsiaRy.set(-2);
      fixture.detectChanges();
      expect(component.hsiaResult().diskEquivalent).toBe(false);
    });

    it('should report equivalent when same ρ and |cx-cy|_p ≤ p^ρ', () => {
      // x = (0, ρ=1), y = (1, ρ=1) in base 3.
      // |0 - 1|₃ = 3⁰ = 1, and p^ρ = 3¹ = 3.  1 ≤ 3 ✓
      component.onHsiaCxChange('0');
      component.onHsiaCyChange('1');
      component.hsiaRx.set(1);
      component.hsiaRy.set(1);
      fixture.detectChanges();
      expect(component.hsiaResult().diskEquivalent).toBe(true);
    });

    it('should report not equivalent when |cx-cy|_p > p^ρ', () => {
      // x = (0, ρ=-1), y = (1, ρ=-1) in base 3.
      // |0 - 1|₃ = 3⁰ = 1, and p^ρ = 3⁻¹ = 1/3.  1 > 1/3 ✗
      component.onHsiaCxChange('0');
      component.onHsiaCyChange('1');
      component.hsiaRx.set(-1);
      component.hsiaRy.set(-1);
      fixture.detectChanges();
      expect(component.hsiaResult().diskEquivalent).toBe(false);
    });
  });

  describe('Addition Playground', () => {
    it('should report an error for invalid addition center', () => {
      component.onAddCxChange('bad');
      fixture.detectChanges();
      expect(component.addCxError()).toBeTruthy();
    });

    it('should compute correct sum center for 1 + 2 = 3', () => {
      component.onAddCxChange('1');
      component.onAddCyChange('2');
      fixture.detectChanges();
      const result = component.addResult();
      expect(result.sumCenterStr).toBe('3');
    });

    it('should compute max log-radius correctly', () => {
      component.addRx.set(-1.0);
      component.addRy.set(-2.0);
      fixture.detectChanges();
      const result = component.addResult();
      expect(result.sumLogRadius).toBe(-1.0);
    });

    it('should assign degX=1 when x_ρ > y_ρ', () => {
      component.addRx.set(-1.0);
      component.addRy.set(-2.0);
      fixture.detectChanges();
      const result = component.addResult();
      expect(result.degX).toBe(1);
      expect(result.degY).toBe(0);
    });
  });
});
