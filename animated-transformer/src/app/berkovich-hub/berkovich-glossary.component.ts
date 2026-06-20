/* Copyright 2026 Google LLC. All Rights Reserved.
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
==============================================================================*/

import { Component, ChangeDetectionStrategy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MarkdownComponent } from 'ngx-markdown';
import { 
  add, 
  subtract, 
  formatRational, 
  parseToRational, 
  getValuation, 
  getAlignedDigits,
  Rational,
  ExtendedNumber
} from '../../lib/berkovich/berkovich';

function parseDigitsString(input: string, p: bigint): Rational {
  const cleaned = input.trim();
  if (!cleaned) return { num: 0n, den: 1n };
  
  let integerStr = '';
  let fractionalStr = '';
  
  const dotIndex = cleaned.indexOf('.');
  if (dotIndex === -1) {
    integerStr = cleaned;
  } else {
    integerStr = cleaned.slice(0, dotIndex);
    fractionalStr = cleaned.slice(dotIndex + 1);
  }
  
  let acc: Rational = { num: 0n, den: 1n };
  const baseVal = Number(p);
  
  // Parse integer part (right to left, power starting at 0)
  let power = 0;
  for (let i = integerStr.length - 1; i >= 0; i--) {
    const char = integerStr[i];
    const digit = parseInt(char, 10);
    if (isNaN(digit) || digit < 0 || digit >= baseVal) {
      continue;
    }
    const term: Rational = { num: BigInt(digit) * (p ** BigInt(power)), den: 1n };
    acc = add(acc, term);
    power++;
  }
  
  // Parse fractional part (left to right, power starting at -1)
  for (let j = 0; j < fractionalStr.length; j++) {
    const char = fractionalStr[j];
    const digit = parseInt(char, 10);
    if (isNaN(digit) || digit < 0 || digit >= baseVal) {
      continue;
    }
    const powerNeg = j + 1;
    const term: Rational = { num: BigInt(digit), den: p ** BigInt(powerNeg) };
    acc = add(acc, term);
  }
  
  return acc;
}

function formatDigitsString(r: Rational, p: bigint, minPower: number, maxPower: number): string {
  const aligned = getAlignedDigits(r, p, minPower, maxPower);
  const reversed = [...aligned].reverse();
  
  let integerPart = '';
  let fractionalPart = '';
  
  for (const col of reversed) {
    if (col.power >= 0) {
      integerPart += col.digit.toString();
    } else {
      fractionalPart += col.digit.toString();
    }
  }
  
  return `${integerPart}.${fractionalPart}`;
}

function digitsToRational(cols: { power: number; digit: number }[], p: bigint): Rational {
  let acc: Rational = { num: 0n, den: 1n };
  for (const col of cols) {
    if (col.digit === 0) continue;
    let term: Rational;
    if (col.power >= 0) {
      term = { num: BigInt(col.digit) * (p ** BigInt(col.power)), den: 1n };
    } else {
      term = { num: BigInt(col.digit), den: p ** BigInt(-col.power) };
    }
    acc = add(acc, term);
  }
  return acc;
}

@Component({
  selector: 'app-berkovich-glossary',
  template: `
    <div class="landing-container">
      <!-- Header Banner -->
      <header class="explorer-header">
        <div class="header-content">
          <button mat-icon-button routerLink="/berkovich" class="back-btn" aria-label="Go back to hub">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <div>
            <h1>Notation & Glossary</h1>
            <p class="subtitle">
              Reference guide and interactive playground for non-Archimedean math.
            </p>
          </div>
        </div>
        <nav class="header-nav">
          <a routerLink="/berkovich/point" routerLinkActive="active-nav">Point SGD</a>
          <a routerLink="/berkovich/disk" routerLinkActive="active-nav">Disk SGD</a>
          <a routerLink="/berkovich/addition" routerLinkActive="active-nav">Addition</a>
          <a routerLink="/berkovich/addition-gradients" routerLinkActive="active-nav">Addition Gradients</a>
          <a routerLink="/berkovich/glossary" routerLinkActive="active-nav">Glossary</a>
        </nav>
      </header>

      <main class="landing-main">
        <div class="glossary-document">
          
          <!-- SECTION 1: The p-adic Field & Metrics -->
          <article class="article-section">
            <markdown [katex]="true" [data]="glossarySection1"></markdown>
            
            <!-- Interactive Valuation Playground (Inline & Minimal) -->
            <div class="inline-playground">
              <div class="playground-title">
                <mat-icon>offline_bolt</mat-icon>
                Interactive Valuation & Digit Playground
              </div>
              <p class="help-text">
                Edit <strong>x</strong> (fraction/decimal) or its <strong>p-adic digit sequence</strong> (e.g. <code>0001.200</code>). You can also click/tap the digit circles below to increment mod <strong>p</strong>:
              </p>
              
              <div class="minimal-form">
                <div class="minimal-input-group">
                  <span class="minimal-label">Number x:</span>
                  <input class="minimal-input" [ngModel]="valInput()" (ngModelChange)="onValInputChange($event)" placeholder="e.g. 5/3">
                </div>
                <div class="minimal-input-group">
                  <span class="minimal-label">Digits sequence:</span>
                  <input class="minimal-input width-large" [ngModel]="valDigitsInput()" (ngModelChange)="onValDigitsInputChange($event)" placeholder="e.g. 0001.200">
                </div>
                <div class="minimal-input-group">
                  <span class="minimal-label">Prime p:</span>
                  <select class="minimal-select" [ngModel]="valPrime()" (ngModelChange)="onValPrimeChange(+$event)">
                    <option [value]="2">2</option>
                    <option [value]="3">3</option>
                    <option [value]="5">5</option>
                    <option [value]="7">7</option>
                  </select>
                </div>
              </div>

              <div class="result-display">
                <div class="result-row">
                  <span class="label">Calculated Valuation &nu;<sub>p</sub>(x):</span>
                  <span class="value-highlight">{{ formatValuation(valResult()) }}</span>
                </div>

                <div class="digit-strip-label">Interactive Digit Strip (p<sup>3</sup> down to p<sup>-3</sup>):</div>
                <div class="digit-strip">
                  @for (col of valDigits(); track col.power) {
                    <div class="digit-cell clickable-digit" 
                         (click)="onDigitClick(col.power)"
                         [class.val-highlight]="isValuationMatch(col.power)"
                         [title]="'Click to increment mod ' + valPrime() + ' (Power: ' + col.powerLabel + ')'">
                      <span class="digit-val">{{ col.digit }}</span>
                      <span class="power-sub">p<sup>{{ col.power }}</sup></span>
                    </div>
                    @if (col.power === 0) {
                      <div class="dot-cell">.</div>
                    }
                  }
                </div>
              </div>
            </div>
          </article>

          <hr class="section-divider">

          <!-- SECTION 2: The Berkovich Affine Line & Tree -->
          <article class="article-section">
            <markdown [katex]="true" [data]="glossarySection2"></markdown>
            
            <!-- Interactive Hsia LCA Playground (Inline & Minimal) -->
            <div class="inline-playground">
              <div class="playground-title">
                <mat-icon>leak_add</mat-icon>
                Interactive Tree LCA & Hsia Kernel
              </div>
              <p class="help-text">
                Define two points on the Berkovich tree (via centers as fractions/decimals or p-adic digit sequences):
              </p>
              
              <div class="minimal-form block-layout">
                <div class="input-line">
                  <div class="minimal-input-group">
                    <span class="minimal-label">x<sub>c</sub>:</span>
                    <input class="minimal-input" [ngModel]="hsiaCx()" (ngModelChange)="onHsiaCxChange($event)" placeholder="e.g. 0">
                  </div>
                  <div class="minimal-input-group">
                    <span class="minimal-label">Digits:</span>
                    <input class="minimal-input width-large" [ngModel]="hsiaCxDigits()" (ngModelChange)="onHsiaCxDigitsChange($event)" placeholder="e.g. 0000.000">
                  </div>
                  <div class="minimal-input-group">
                    <span class="minimal-label">x<sub>&rho;</sub>:</span>
                    <input class="minimal-input width-num" type="number" step="0.5" [ngModel]="hsiaRx()" (ngModelChange)="hsiaRx.set(+$event)">
                  </div>
                </div>
                <div class="input-line">
                  <div class="minimal-input-group">
                    <span class="minimal-label">y<sub>c</sub>:</span>
                    <input class="minimal-input" [ngModel]="hsiaCy()" (ngModelChange)="onHsiaCyChange($event)" placeholder="e.g. 4/3">
                  </div>
                  <div class="minimal-input-group">
                    <span class="minimal-label">Digits:</span>
                    <input class="minimal-input width-large" [ngModel]="hsiaCyDigits()" (ngModelChange)="onHsiaCyDigitsChange($event)" placeholder="e.g. 0001.100">
                  </div>
                  <div class="minimal-input-group">
                    <span class="minimal-label">y<sub>&rho;</sub>:</span>
                    <input class="minimal-input width-num" type="number" step="0.5" [ngModel]="hsiaRy()" (ngModelChange)="hsiaRy.set(+$event)">
                  </div>
                </div>
                <div class="minimal-input-group">
                  <span class="minimal-label">Prime p:</span>
                  <select class="minimal-select" [ngModel]="hsiaPrime()" (ngModelChange)="onHsiaPrimeChange(+$event)">
                    <option [value]="2">2</option>
                    <option [value]="3">3</option>
                    <option [value]="5">5</option>
                    <option [value]="7">7</option>
                  </select>
                </div>
              </div>

              <div class="result-display">
                <div class="result-row">
                  <span class="label">Center Difference |x<sub>c</sub> - y<sub>c</sub>|<sub>p</sub>:</span>
                  <span class="value">{{ formatAbsoluteDiff() }} (log: {{ hsiaResult().logDiff.toFixed(2) }})</span>
                </div>
                <div class="result-row">
                  <span class="label">LCA Log-Radius:</span>
                  <span class="value-highlight">{{ hsiaResult().lcaLogRadius.toFixed(2) }}</span>
                </div>
                <div class="result-row">
                  <span class="label">Hsia Distance &delta;(x, y):</span>
                  <span class="value">{{ hsiaResult().absoluteDistance.toFixed(4) }}</span>
                </div>
              </div>
            </div>
          </article>

          <hr class="section-divider">

          <!-- SECTION 3: Berkovich Addition & Gradients -->
          <article class="article-section">
            <markdown [katex]="true" [data]="glossarySection3"></markdown>
            
            <!-- Interactive Addition Playground (Inline & Minimal) -->
            <div class="inline-playground">
              <div class="playground-title">
                <mat-icon>add_circle</mat-icon>
                Interactive Addition & Active Gradient Resolution
              </div>
              <p class="help-text">
                Add two disks and observe how uncertainty and active degrees resolve:
              </p>
              
              <div class="minimal-form block-layout">
                <div class="input-line">
                  <div class="minimal-input-group">
                    <span class="minimal-label">x<sub>c</sub>:</span>
                    <input class="minimal-input" [ngModel]="addCx()" (ngModelChange)="onAddCxChange($event)" placeholder="e.g. 1">
                  </div>
                  <div class="minimal-input-group">
                    <span class="minimal-label">Digits:</span>
                    <input class="minimal-input width-large" [ngModel]="addCxDigits()" (ngModelChange)="onAddCxDigitsChange($event)">
                  </div>
                  <div class="minimal-input-group">
                    <span class="minimal-label">x<sub>&rho;</sub>:</span>
                    <input class="minimal-input width-num" type="number" step="0.5" [ngModel]="addRx()" (ngModelChange)="addRx.set(+$event)">
                  </div>
                </div>
                <div class="input-line">
                  <div class="minimal-input-group">
                    <span class="minimal-label">y<sub>c</sub>:</span>
                    <input class="minimal-input" [ngModel]="addCy()" (ngModelChange)="onAddCyChange($event)" placeholder="e.g. 2">
                  </div>
                  <div class="minimal-input-group">
                    <span class="minimal-label">Digits:</span>
                    <input class="minimal-input width-large" [ngModel]="addCyDigits()" (ngModelChange)="onAddCyDigitsChange($event)">
                  </div>
                  <div class="minimal-input-group">
                    <span class="minimal-label">y<sub>&rho;</sub>:</span>
                    <input class="minimal-input width-num" type="number" step="0.5" [ngModel]="addRy()" (ngModelChange)="addRy.set(+$event)">
                  </div>
                </div>
                <div class="minimal-input-group">
                  <span class="minimal-label">Prime p:</span>
                  <select class="minimal-select" [ngModel]="addPrime()" (ngModelChange)="onAddPrimeChange(+$event)">
                    <option [value]="2">2</option>
                    <option [value]="3">3</option>
                    <option [value]="5">5</option>
                    <option [value]="7">7</option>
                  </select>
                </div>
              </div>

              <div class="result-display">
                <div class="result-row">
                  <span class="label">Sum Center (x+y)<sub>c</sub>:</span>
                  <span class="value">{{ addResult().sumCenterStr }}</span>
                </div>
                <div class="result-row">
                  <span class="label">Sum Log-Radius (x+y)<sub>&rho;</sub>:</span>
                  <span class="value-highlight">{{ addResult().sumLogRadius.toFixed(2) }}</span>
                </div>
                <div class="result-row">
                  <span class="label">Active Gradient Degrees:</span>
                  <span class="value">
                    &part;(x+y)<sub>&rho;</sub> / &part;x<sub>&rho;</sub> = <span class="badge" [class.active-b]="addResult().degX > 0">{{ addResult().degX }}</span>
                    &nbsp;&nbsp;
                    &part;(x+y)<sub>&rho;</sub> / &part;y<sub>&rho;</sub> = <span class="badge" [class.active-b]="addResult().degY > 0">{{ addResult().degY }}</span>
                  </span>
                </div>
              </div>
            </div>
          </article>

        </div>
      </main>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      font-family: 'Inter', 'Roboto', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f8fafc;
      color: #1e293b;
      min-height: 100vh;
      box-sizing: border-box;
    }
    .landing-container {
      padding: 24px;
      max-width: 900px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .explorer-header {
      background: #ffffff;
      border-bottom: solid 1px #e2e8f0;
      padding: 20px 24px;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      border: 1px solid #e2e8f0;
    }
    .header-content {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .back-btn {
      color: #64748b;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      &:hover {
        color: #0f172a;
        background: #f1f5f9;
        border-color: #cbd5e1;
      }
    }
    h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -0.02em;
    }
    .subtitle {
      margin: 4px 0 0 0;
      font-size: 14px;
      color: #64748b;
    }
    .header-nav {
      display: flex;
      gap: 16px;
      margin-top: 12px;
      border-top: 1px solid #f1f5f9;
      padding-top: 12px;
      a {
        font-size: 13px;
        font-weight: 500;
        color: #64748b;
        text-decoration: none;
        padding: 6px 12px;
        border-radius: 6px;
        transition: all 0.2s ease;
        &:hover {
          color: #0f172a;
          background: #f1f5f9;
        }
        &.active-nav {
          color: #3b82f6;
          background: #eff6ff;
          font-weight: 600;
        }
      }
    }
    
    .landing-main {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 32px 40px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
    }
    
    .glossary-document {
      display: flex;
      flex-direction: column;
      gap: 32px;
    }
    
    .article-section {
      font-size: 15px;
      line-height: 1.7;
      color: #334155;
    }
    .section-divider {
      border: 0;
      border-top: 1px solid #e2e8f0;
      margin: 8px 0;
    }

    .inline-playground {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      margin: 20px 0;
      font-size: 13px;
    }
    .playground-title {
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
      color: #2563eb;
      margin-bottom: 8px;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      
      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    }
    .help-text {
      margin: 0 0 12px 0;
      color: #64748b;
      font-size: 12px;
    }
    
    .minimal-form {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      align-items: center;
      margin-bottom: 12px;
      
      &.block-layout {
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
      }
    }
    .input-line {
      display: flex;
      gap: 12px;
      width: 100%;
      flex-wrap: wrap;
    }
    .minimal-input-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .minimal-label {
      color: #475569;
      font-weight: 500;
      font-size: 12px;
      min-width: 60px;
    }
    .minimal-input {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 12px;
      font-family: inherit;
      color: #1e293b;
      width: 100px;
      transition: all 0.15s ease;
      
      &.width-large {
        width: 130px;
      }
      &.width-num {
        width: 70px;
      }
      &:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
      }
    }
    .minimal-select {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 5px 8px;
      font-size: 12px;
      font-family: inherit;
      color: #1e293b;
      cursor: pointer;
      outline: none;
      width: 60px;
      &:focus {
        border-color: #3b82f6;
      }
    }
    
    .result-display {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      box-shadow: inset 0 1px 2px rgba(0,0,0,0.01);
    }
    .result-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      
      .label {
        color: #64748b;
        font-weight: 500;
      }
      .value {
        font-weight: 600;
        color: #0f172a;
      }
      .value-highlight {
        font-weight: 700;
        color: #2563eb;
        background: #eff6ff;
        padding: 2px 6px;
        border-radius: 4px;
        border: 1px solid #dbeafe;
      }
    }
    .badge {
      display: inline-block;
      font-weight: bold;
      padding: 1px 6px;
      border-radius: 4px;
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #e2e8f0;
      &.active-b {
        background: #10b981;
        color: white;
        border-color: #059669;
      }
    }
    
    .digit-strip-label {
      font-size: 10px;
      font-weight: 600;
      color: #94a3b8;
      margin-top: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .digit-strip {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 4px;
      flex-wrap: wrap;
    }
    .digit-cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      min-width: 26px;
      padding: 3px 2px;
      box-sizing: border-box;
      
      .digit-val {
        font-weight: 600;
        font-size: 12px;
        color: #1e293b;
      }
      .power-sub {
        font-size: 7px;
        color: #94a3b8;
        margin-top: 1px;
      }
      
      &.clickable-digit {
        cursor: pointer;
        transition: all 0.15s ease;
        user-select: none;
        &:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
          border-color: #3b82f6;
        }
        &:active {
          transform: translateY(0);
        }
      }
      
      &.val-highlight {
        background: #3b82f6;
        border-color: #2563eb;
        .digit-val {
          color: #ffffff;
        }
        .power-sub {
          color: #dbeafe;
        }
      }
    }
    .dot-cell {
      font-size: 20px;
      font-weight: bold;
      color: #64748b;
      line-height: 1;
      align-self: flex-end;
      padding-bottom: 6px;
      user-select: none;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MarkdownComponent
  ]
})
export class BerkovichGlossaryComponent {
  // 1. Valuation Calculator state
  readonly valInput = signal<string>('5/3');
  readonly valDigitsInput = signal<string>('0001.200');
  readonly valPrime = signal<number>(3);

  readonly valRational = computed(() => {
    try {
      return parseToRational(this.valInput());
    } catch {
      return { num: 0n, den: 1n };
    }
  });

  readonly valResult = computed((): ExtendedNumber => {
    return getValuation(this.valRational(), BigInt(this.valPrime()));
  });

  readonly valDigits = computed(() => {
    const p = BigInt(this.valPrime());
    const r = this.valRational();
    const columns = getAlignedDigits(r, p, -3, 3);
    return columns.reverse().map(col => {
      let powerLabel = `p^${col.power}`;
      if (col.power === 0) powerLabel = '1';
      else if (col.power === 1) powerLabel = 'p';
      else if (col.power === -1) powerLabel = '1/p';
      return {
        ...col,
        powerLabel
      };
    });
  });

  // Bidirectional Valuation Sync handlers
  onValInputChange(newVal: string): void {
    this.valInput.set(newVal);
    try {
      const r = parseToRational(newVal);
      const digitsStr = formatDigitsString(r, BigInt(this.valPrime()), -3, 3);
      this.valDigitsInput.set(digitsStr);
    } catch {}
  }

  onValDigitsInputChange(newDigits: string): void {
    this.valDigitsInput.set(newDigits);
    try {
      const r = parseDigitsString(newDigits, BigInt(this.valPrime()));
      this.valInput.set(formatRational(r));
    } catch {}
  }

  onValPrimeChange(newPrime: number): void {
    this.valPrime.set(newPrime);
    try {
      const digitsStr = formatDigitsString(this.valRational(), BigInt(newPrime), -3, 3);
      this.valDigitsInput.set(digitsStr);
    } catch {}
  }

  onDigitClick(power: number): void {
    const p = BigInt(this.valPrime());
    const currentCols = this.valDigits();
    const updatedCols = currentCols.map(col => {
      if (col.power === power) {
        const nextDigit = (col.digit + 1) % Number(p);
        return { ...col, digit: nextDigit };
      }
      return col;
    });
    
    const newRational = digitsToRational(updatedCols, p);
    const ratStr = formatRational(newRational);
    this.valInput.set(ratStr);
    this.valDigitsInput.set(formatDigitsString(newRational, p, -3, 3));
  }

  formatValuation(v: ExtendedNumber): string {
    if (v.type === 'pos-infinity') return '+∞ (Zero)';
    if (v.type === 'neg-infinity') return '-∞';
    return v.value.toString();
  }

  isValuationMatch(power: number): boolean {
    const res = this.valResult();
    return res.type === 'finite' && res.value === power;
  }

  // 2. Hsia Distance Calculator state
  readonly hsiaCx = signal<string>('0');
  readonly hsiaCxDigits = signal<string>('0000.000');
  readonly hsiaCy = signal<string>('4/3');
  readonly hsiaCyDigits = signal<string>('0001.100');
  readonly hsiaRx = signal<number>(-1.0);
  readonly hsiaRy = signal<number>(-2.0);
  readonly hsiaPrime = signal<number>(3);

  readonly cx = computed(() => {
    try { return parseToRational(this.hsiaCx()); } catch { return { num: 0n, den: 1n }; }
  });
  readonly cy = computed(() => {
    try { return parseToRational(this.hsiaCy()); } catch { return { num: 0n, den: 1n }; }
  });

  readonly hsiaResult = computed(() => {
    const p = BigInt(this.hsiaPrime());
    const diff = subtract(this.cx(), this.cy());
    const valDiff = getValuation(diff, p);
    const logDiff = valDiff.type === 'finite' ? -valDiff.value : -Infinity;
    const lcaLogRadius = Math.max(this.hsiaRx(), this.hsiaRy(), logDiff);
    return {
      logDiff,
      lcaLogRadius,
      absoluteDistance: Math.pow(Number(p), lcaLogRadius)
    };
  });

  // Bidirectional Hsia Sync handlers
  onHsiaCxChange(newVal: string): void {
    this.hsiaCx.set(newVal);
    try {
      const r = parseToRational(newVal);
      this.hsiaCxDigits.set(formatDigitsString(r, BigInt(this.hsiaPrime()), -3, 3));
    } catch {}
  }
  onHsiaCxDigitsChange(newDigits: string): void {
    this.hsiaCxDigits.set(newDigits);
    try {
      const r = parseDigitsString(newDigits, BigInt(this.hsiaPrime()));
      this.hsiaCx.set(formatRational(r));
    } catch {}
  }

  onHsiaCyChange(newVal: string): void {
    this.hsiaCy.set(newVal);
    try {
      const r = parseToRational(newVal);
      this.hsiaCyDigits.set(formatDigitsString(r, BigInt(this.hsiaPrime()), -3, 3));
    } catch {}
  }
  onHsiaCyDigitsChange(newDigits: string): void {
    this.hsiaCyDigits.set(newDigits);
    try {
      const r = parseDigitsString(newDigits, BigInt(this.hsiaPrime()));
      this.hsiaCy.set(formatRational(r));
    } catch {}
  }

  onHsiaPrimeChange(newPrime: number): void {
    this.hsiaPrime.set(newPrime);
    try {
      const rx = parseToRational(this.hsiaCx());
      const ry = parseToRational(this.hsiaCy());
      this.hsiaCxDigits.set(formatDigitsString(rx, BigInt(newPrime), -3, 3));
      this.hsiaCyDigits.set(formatDigitsString(ry, BigInt(newPrime), -3, 3));
    } catch {}
  }

  formatAbsoluteDiff(): string {
    try {
      const p = BigInt(this.hsiaPrime());
      const diff = subtract(this.cx(), this.cy());
      const val = getValuation(diff, p);
      if (val.type === 'finite') {
        return `p^(-${val.value})`;
      }
      return '0';
    } catch {
      return 'NaN';
    }
  }

  // 3. Addition Calculator state
  readonly addCx = signal<string>('1');
  readonly addCxDigits = signal<string>('0001.000');
  readonly addCy = signal<string>('2');
  readonly addCyDigits = signal<string>('0002.000');
  readonly addRx = signal<number>(-1.0);
  readonly addRy = signal<number>(-2.0);
  readonly addPrime = signal<number>(3);

  readonly acx = computed(() => {
    try { return parseToRational(this.addCx()); } catch { return { num: 0n, den: 1n }; }
  });
  readonly acy = computed(() => {
    try { return parseToRational(this.addCy()); } catch { return { num: 0n, den: 1n }; }
  });

  // Bidirectional Addition Sync handlers
  onAddCxChange(newVal: string): void {
    this.addCx.set(newVal);
    try {
      const r = parseToRational(newVal);
      this.addCxDigits.set(formatDigitsString(r, BigInt(this.addPrime()), -3, 3));
    } catch {}
  }
  onAddCxDigitsChange(newDigits: string): void {
    this.addCxDigits.set(newDigits);
    try {
      const r = parseDigitsString(newDigits, BigInt(this.addPrime()));
      this.addCx.set(formatRational(r));
    } catch {}
  }

  onAddCyChange(newVal: string): void {
    this.addCy.set(newVal);
    try {
      const r = parseToRational(newVal);
      this.addCyDigits.set(formatDigitsString(r, BigInt(this.addPrime()), -3, 3));
    } catch {}
  }
  onAddCyDigitsChange(newDigits: string): void {
    this.addCyDigits.set(newDigits);
    try {
      const r = parseDigitsString(newDigits, BigInt(this.addPrime()));
      this.addCy.set(formatRational(r));
    } catch {}
  }

  onAddPrimeChange(newPrime: number): void {
    this.addPrime.set(newPrime);
    try {
      const rx = parseToRational(this.addCx());
      const ry = parseToRational(this.addCy());
      this.addCxDigits.set(formatDigitsString(rx, BigInt(newPrime), -3, 3));
      this.addCyDigits.set(formatDigitsString(ry, BigInt(newPrime), -3, 3));
    } catch {}
  }

  readonly addResult = computed(() => {
    const p = BigInt(this.addPrime());
    const sumCenter = add(this.acx(), this.acy());
    const sumLogRadius = Math.max(this.addRx(), this.addRy());
    
    let degX = 0;
    let degY = 0;
    if (this.addRx() > this.addRy()) { degX = 1; }
    else if (this.addRx() < this.addRy()) { degY = 1; }
    else { degX = 0.5; degY = 0.5; }
    
    return {
      sumCenter,
      sumCenterStr: formatRational(sumCenter),
      sumLogRadius,
      degX,
      degY
    };
  });

  readonly glossarySection1 = `
This glossary provides a reference for the mathematical notation, symbols, and concepts used throughout the Berkovich Space visualizers.

---

### 1. The $p$-adic Field & Metrics

* **$p$-adic Number Field ($\\mathbb{Q}_p$)**
  The completion of the rational numbers $\\mathbb{Q}$ under the non-Archimedean $p$-adic absolute value. Mathematically, elements in $\\mathbb{Q}_p$ are infinite sequences extending infinitely to the right (higher powers of $p$):
  $$x = \\sum_{n \\ge n_0} a_n p^n \\quad \\text{where } a_n \\in \\{0, \\dotsc, p-1\\}$$
  In practice (such as in our visualizers and numeric representations), we concern ourselves with a finite subsequence of these digits up to a specific precision cutoff.

* **$p$-adic Valuation ($\\nu_p(x)$)**
  The exponent of the highest power of $p$ dividing $x$. It satisfies:
  $$\\nu_p(xy) = \\nu_p(x) + \\nu_p(y)$$
  $$\\nu_p(x + y) \\ge \\min(\\nu_p(x), \\nu_p(y))$$
  **Intuitive Digit View**: When $x$ is written as a sequence of digits from left to right (highest powers on the left down to lowest powers on the right), the valuation $\\nu_p(x)$ corresponds to the **index of the furthest-left non-zero digit**. For example, in 3-adic notation:
  * $x = 00.20_3$ represents $2\\cdot 3^{-1}$. The furthest-left non-zero digit is $2$ at index $-1$. So $\\nu_3(x) = -1$.
  * $x = 12.01_3$ represents $1\\cdot 3^0 + 2\\cdot 3^1 + 1\\cdot 3^3$. The furthest-left non-zero digit is $1$ at index $0$. So $\\nu_3(x) = 0$.

* **Absolute Value ($|x|_p$)**
  The scale metric defined as:
  $$|x|_p = p^{-\\nu_p(x)}$$
  It is **non-Archimedean** because it satisfies the strong triangle inequality (ultrametric):
  $$|x + y|_p \\le \\max(|x|_p, |y|_p)$$
`;

  readonly glossarySection2 = `
### 2. The Berkovich Affine Line & Tree

* **Berkovich Point representation ($(c, \\rho)$)**
  A point on the Berkovich tree (rational affine line $\\Gamma_p$) represented by a center $c \\in \\mathbb{Q}_p$ and a log-radius $\\rho \\in \\mathbb{R}$. This represents a closed disk $D(c, p^{\\rho})$.

* **Disk Equivalence**
  Due to the ultrametric property, any point inside a disk can serve as its center. Two representations $(c_1, \\rho_1)$ and $(c_2, \\rho_2)$ define the **exact same Berkovich point** if and only if:
  $$\\rho_1 = \\rho_2 \\quad \\text{and} \\quad |c_1 - c_2|_p \\le p^{\\rho_1}$$

* **Classification of Points**
  * **Type I (Leaves, $\\rho \\to -\\infty$)**
    Classical $p$-adic points in $\\mathbb{Q}_p$.
  * **Type II (Vertices, $\\rho \\in \\mathbb{Z}$)**
    Branching points where the tree splits into $p+1$ directions.
  * **Type III (Edges, $\\rho \\notin \\mathbb{Z}$)**
    Points on segments between junctions with exactly 2 directions.

* **Hsia Kernel / Tree Distance ($\\delta(x, y)$)**
  The distance between two Berkovich points $x = (c_x, \\rho_x)$ and $y = (c_y, \\rho_y)$, equivalent to the radius of their lowest common ancestor (LCA):
  $$\\delta(x, y) = \\max(p^{\\rho_x}, p^{\\rho_y}, |c_x - c_y|_p)$$
`;

  readonly glossarySection3 = `
### 3. Berkovich Addition & Gradients

* **Addition of Disks ($x + y = x+y$)**
  When adding two disks $x = D(x_c, p^{x_{\\rho}})$ and $y = D(y_c, p^{y_{\\rho}})$:
  * **Center Sum**: $(x+y)_c = x_c + y_c$ (digits are added bottom-up).
  * **Radius Resolution**: $(x+y)_{\\rho} = \\max(x_{\\rho}, y_{\\rho})$ (the sum's uncertainty swallows finer details).

* **Active Degree ($\\partial (x+y)_\\rho / \\partial x_\\rho$)**
  The derivative of the sum's log-radius with respect to the input log-radius. It evaluates to:
  * $1$ if $x_\\rho > y_\\rho$ (Disk $x$ dominates the uncertainty).
  * $0$ if $x_\\rho < y_\\rho$ (Disk $y$ dominates).
  * $0.5$ if $x_\\rho = y_\\rho$ (equal division).

* **Tangent Space at Vertices ($\\mathbb{P}^1(\\mathbb{F}_p)$)**
  The set of tangent directions at Type II vertices, consisting of:
  * $p$ child directions ($D_\\gamma = (c + \\gamma p^{-\\rho}, \\rho - 1)$ for $\\gamma \\in \\mathbb{F}_p$).
  * $1$ parent direction ($D_\\infty = (c, \\rho + 1)$).
`;
}
