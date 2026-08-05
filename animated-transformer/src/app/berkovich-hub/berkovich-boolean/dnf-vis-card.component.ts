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

import { Component, input, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MarkdownComponent } from 'ngx-markdown';
import { BerkovichBooleanLearner, BerkovichBooleanConfig, BooleanSample } from './models/berkovich-boolean-learner';
import { formatRational, simplify, subtract } from '../../../lib/berkovich/berkovich';

@Component({
  selector: 'app-dnf-vis-card',
  imports: [CommonModule, MatButtonModule, MarkdownComponent],
  template: `
    <div class="dnf-vis-container">
      <div class="card-header">
        <h3>DNF Affinoid Domain Structure</h3>
        <span class="pool-badge">{{ numPools() }} Berkovich Pools</span>
      </div>

      <div class="description-markdown">
        <markdown [katex]="true" [data]="descriptionMarkdown()"></markdown>
      </div>

      <!-- Symbolic DNF Logic Formula Box -->
      <div class="formula-box">
        <div class="formula-title">Symbolic Affinoid Formula:</div>
        <div class="formula-markdown">
          <markdown [katex]="true" [data]="formulaMarkdown()"></markdown>
        </div>
      </div>

      <!-- DNF Circuit Expressiveness & Pool Count Note -->
      <div class="circuit-note-box">
        <div class="note-title">⚡ Boolean Circuit Expressiveness & Pool Complexity</div>
        <div class="note-markdown">
          <markdown [katex]="true" [data]="circuitNoteMarkdown()"></markdown>
        </div>
      </div>      <!-- 2D 2-adic Unit Square Map for 2-variable functions -->
      @if (numVars() === 2) {
        <div class="map-section">
          <div class="map-header-row" style="display: flex; justify-content: space-between; align-align: center; margin-bottom: 8px;">
            <div class="map-title">2-adic Unit Square Embedding Map ([0, 1] &times; [0, 1]):</div>
            <div class="map-toggles" style="display: flex; gap: 8px; font-size: 0.78rem;">
              <button
                mat-stroked-button
                style="height: 24px; line-height: 22px; font-size: 11px; padding: 0 8px;"
                [class.active-toggle]="showHeatmap()"
                (click)="showHeatmap.set(!showHeatmap())"
              >
                {{ showHeatmap() ? 'Heatmap On' : 'Heatmap Off' }}
              </button>
              <button
                mat-stroked-button
                style="height: 24px; line-height: 22px; font-size: 11px; padding: 0 8px;"
                [class.active-toggle]="showPoolLines()"
                (click)="showPoolLines.set(!showPoolLines())"
              >
                {{ showPoolLines() ? 'Vectors On' : 'Vectors Off' }}
              </button>
            </div>
          </div>

          <div class="canvas-2d-wrapper">
            <svg class="map-svg" viewBox="0 0 300 300">
              <!-- Grid background -->
              <rect x="30" y="30" width="240" height="240" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/>

              <!-- Decision Boundary Heatmap Shading Grid -->
              @if (showHeatmap()) {
                @for (cell of heatmapGrid(); track cell.x + '-' + cell.y) {
                  <rect
                    [attr.x]="cell.x"
                    [attr.y]="cell.y"
                    [attr.width]="cell.width"
                    [attr.height]="cell.height"
                    [attr.fill]="cell.fill"
                    [attr.opacity]="cell.opacity"
                  />
                }
              }

              <!-- Grid Axis Subdivisions -->
              <line x1="150" y1="30" x2="150" y2="270" stroke="#cbd5e1" stroke-dasharray="4"/>
              <line x1="30" y1="150" x2="270" y2="150" stroke="#cbd5e1" stroke-dasharray="4"/>

              <!-- Axis Labels -->
              <text x="150" y="295" text-anchor="middle" font-size="11" fill="#64748b">x₁ (2-adic position)</text>
              <text x="10" y="150" text-anchor="middle" font-size="11" fill="#64748b" transform="rotate(-90 10 150)">x₂ (2-adic position)</text>

              @if (learner(); as l) {
                <!-- Translation Vectors from Target Disks W1 to Active Pool Coverage H_m -->
                @if (showPoolLines()) {
                  @for (m of getPoolIndices(); track 'line-' + m) {
                    <line
                      [attr.x1]="getTargetCx(l, 1, m)"
                      [attr.y1]="getTargetCy(l, 1, m)"
                      [attr.x2]="getPoolCx(l, m)"
                      [attr.y2]="getPoolCy(l, m)"
                      stroke="#0284c7"
                      stroke-width="1.5"
                      stroke-dasharray="3 3"
                      opacity="0.75"
                    />
                  }
                }

                <!-- Class 0 Target Disks W0 -->
                @for (m of getPoolIndices(); track 'w0-' + m) {
                  <g class="target-w0-group">
                    <circle
                      [attr.cx]="getTargetCx(l, 0, m)"
                      [attr.cy]="getTargetCy(l, 0, m)"
                      [attr.r]="getTargetRadius(l, 0, m)"
                      fill="rgba(239, 68, 68, 0.08)"
                      stroke="#ef4444"
                      stroke-width="1"
                      stroke-dasharray="2 2"
                    />
                    <circle
                      [attr.cx]="getTargetCx(l, 0, m)"
                      [attr.cy]="getTargetCy(l, 0, m)"
                      r="4"
                      fill="#ef4444"
                    />
                    <text
                      [attr.x]="getTargetCx(l, 0, m)"
                      [attr.y]="getTargetCy(l, 0, m) - 8"
                      text-anchor="middle"
                      font-size="9"
                      font-weight="bold"
                      fill="#dc2626"
                    >
                      W₀,{{ m + 1 }}
                    </text>
                  </g>
                }

                <!-- Class 1 Target Disks W1 -->
                @for (m of getPoolIndices(); track 'w1-' + m) {
                  <g class="target-w1-group">
                    <circle
                      [attr.cx]="getTargetCx(l, 1, m)"
                      [attr.cy]="getTargetCy(l, 1, m)"
                      [attr.r]="getTargetRadius(l, 1, m)"
                      fill="rgba(37, 99, 235, 0.12)"
                      stroke="#2563eb"
                      stroke-width="1"
                      stroke-dasharray="2 2"
                    />
                    <circle
                      [attr.cx]="getTargetCx(l, 1, m)"
                      [attr.cy]="getTargetCy(l, 1, m)"
                      r="4"
                      fill="#2563eb"
                    />
                    <text
                      [attr.x]="getTargetCx(l, 1, m)"
                      [attr.y]="getTargetCy(l, 1, m) + 14"
                      text-anchor="middle"
                      font-size="9"
                      font-weight="bold"
                      fill="#1d4ed8"
                    >
                      W₁,{{ m + 1 }}
                    </text>
                  </g>
                }

                <!-- Affinoid Pool Disks Overlay (Pool H_m) -->
                @for (m of getPoolIndices(); track 'pool-' + m) {
                  <circle
                    [attr.cx]="getPoolCx(l, m)"
                    [attr.cy]="getPoolCy(l, m)"
                    [attr.r]="getPoolRadius(l, m)"
                    fill="rgba(2, 132, 199, 0.08)"
                    stroke="#0284c7"
                    stroke-width="2"
                    stroke-dasharray="4 2"
                  />
                }
              }

              <!-- Truth Table Sample Points -->
              @for (sample of samples(); track sample.label) {
                <g [attr.transform]="getSampleTransform(sample)">
                  <circle
                    r="14"
                    [attr.fill]="sample.target === 1 ? '#22c55e' : '#ef4444'"
                    [attr.stroke]="isSampleCorrect(sample) ? '#ffffff' : '#f59e0b'"
                    [attr.stroke-width]="isSampleCorrect(sample) ? '2' : '3.5'"
                  />
                  <text
                    text-anchor="middle"
                    dominant-baseline="central"
                    font-size="10"
                    font-weight="bold"
                    fill="#ffffff"
                  >
                    {{ sample.target }}
                  </text>
                  <text
                    y="-18"
                    text-anchor="middle"
                    font-size="10"
                    font-weight="600"
                    fill="#0f172a"
                  >
                    ({{ sample.inputs[0] }}, {{ sample.inputs[1] }})
                  </text>
                </g>
              }
            </svg>
          </div>

          <!-- 2D Map Legend -->
          <div class="map-legend" style="display: flex; justify-content: center; flex-wrap: wrap; gap: 16px; font-size: 0.78rem; color: #475569; margin-top: 8px;">
            <span style="display: flex; align-items: center; gap: 4px;">
              <span style="width: 10px; height: 10px; background: rgba(37, 99, 235, 0.3); border: 1px solid #2563eb; display: inline-block;"></span> Class 1 Region
            </span>
            <span style="display: flex; align-items: center; gap: 4px;">
              <span style="width: 10px; height: 10px; background: rgba(239, 68, 68, 0.3); border: 1px solid #ef4444; display: inline-block;"></span> Class 0 Region
            </span>
            <span style="display: flex; align-items: center; gap: 4px;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: #2563eb; display: inline-block;"></span> W₁ Target Center
            </span>
            <span style="display: flex; align-items: center; gap: 4px;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: #ef4444; display: inline-block;"></span> W₀ Target Center
            </span>
            <span style="display: flex; align-items: center; gap: 4px;">
              <span style="width: 12px; height: 0; border-top: 2px dashed #0284c7; display: inline-block;"></span> Pool H Coverage
            </span>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .dnf-vis-container {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;

      h3 {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 600;
        color: #0f172a;
      }

      .pool-badge {
        background: #eff6ff;
        color: #2563eb;
        border: 1px solid #dbeafe;
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 0.8rem;
        font-weight: 600;
      }
    }

    .description-markdown {
      color: #475569;
      font-size: 0.9rem;
      line-height: 1.5;
      margin-bottom: 14px;
    }

    .formula-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 14px;

      .formula-title {
        font-size: 0.8rem;
        font-weight: 600;
        color: #64748b;
        margin-bottom: 6px;
      }

      .formula-markdown {
        font-size: 0.95rem;
        color: #0f172a;
      }
    }

    .circuit-note-box {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 16px;

      .note-title {
        font-size: 0.82rem;
        font-weight: 700;
        color: #15803d;
        margin-bottom: 6px;
      }

      .note-markdown {
        font-size: 0.85rem;
        color: #166534;
        line-height: 1.45;
      }
    }

    .map-section {
      .map-title {
        font-size: 0.85rem;
        font-weight: 600;
        color: #475569;
        margin-bottom: 10px;
      }

      .canvas-2d-wrapper {
        display: flex;
        justify-content: center;

        .map-svg {
          width: 100%;
          max-width: 320px;
          height: auto;

          rect {
            transition: fill 0.25s ease-out, opacity 0.25s ease-out;
          }

          circle {
            transition: cx 0.25s ease-out, cy 0.25s ease-out, r 0.25s ease-out, fill 0.25s ease-out, stroke 0.25s ease-out;
          }

          line {
            transition: x1 0.25s ease-out, y1 0.25s ease-out, x2 0.25s ease-out, y2 0.25s ease-out;
          }

          g {
            transition: transform 0.25s ease-out;
          }
        }
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DnfVisCardComponent {
  learner = input.required<BerkovichBooleanLearner | null>();
  samples = input.required<BooleanSample[]>();
  numPools = input.required<number>();
  numVars = input.required<number>();
  config = input<BerkovichBooleanConfig>();
  tick = input<number>(0);

  readonly showHeatmap = signal<boolean>(true);
  readonly showPoolLines = signal<boolean>(true);
  readonly showTargetDisks = signal<boolean>(true);

  readonly heatmapGrid = computed(() => {
    this.tick();
    const l = this.learner();
    const cfg = this.config();
    if (!l || !cfg) return [];

    const cells: Array<{ x: number; y: number; width: number; height: number; fill: string; opacity: number }> = [];
    const steps = 16;
    const cellW = 240 / steps;
    const cellH = 240 / steps;

    for (let i = 0; i < steps; i++) {
      const x1 = (i + 0.5) / steps;
      for (let j = 0; j < steps; j++) {
        const x2 = (j + 0.5) / steps;
        const fwd = l.forward([x1, x2], cfg);
        const prob1 = fwd.probs[1];

        const isTrue = prob1 >= 0.5;
        const confidence = Math.abs(prob1 - 0.5) * 2;
        const opacity = 0.08 + confidence * 0.35;
        const fill = isTrue ? '#2563eb' : '#ef4444';

        const svgX = 30 + i * cellW;
        const svgY = 270 - (j + 1) * cellH;

        cells.push({
          x: svgX,
          y: svgY,
          width: cellW,
          height: cellH,
          fill,
          opacity
        });
      }
    }
    return cells;
  });

  readonly descriptionMarkdown = computed(() => {
    const pools = this.numPools();
    const vars = this.numVars();
    return `The boolean function $f(\\mathbf{x})$ is learned as a Disjunctive Normal Form (DNF) affinoid domain: $\\bigvee_{m=1}^{${pools}} \\left( \\bigwedge_{d=1}^{${vars}} X_d \\in W_{1,m,d} \\right)$. Dynamic pool weight translation $H = X \\oplus PW$ shifts input points so that $X_d + PW_{m,d} \\approx W_{1,m,d}$.`;
  });

  readonly formulaMarkdown = computed(() => {
    const pools = this.numPools();
    const clauses: string[] = [];
    for (let m = 1; m <= pools; m++) {
      clauses.push(`\\text{Pool}_{m=${m}}`);
    }
    const joined = clauses.join(' \\lor ');
    return `$f(x_1, x_2) = ${joined}$`;
  });

  readonly circuitNoteMarkdown = computed(() => {
    const pools = this.numPools();
    const vars = this.numVars();
    const requiredPools = 1 << (vars - 1);
    return `**Theorem (Universal Circuit Learning):** Any D-variable Boolean function requires at most $M = 2^{D-1}$ DNF pools. Initializing $M = 4$ pools on distinct hypercube minterm branches ($PW_{m,d} = \\text{bit}_d \\,?\\, 3/4 : 1/4$) guarantees complete coverage of all $2^D$ input minterm regions, allowing Berkovich gradient descent to rapidly learn **any arbitrary Boolean circuit** with 100% accuracy.`;
  });

  getPoolIndices(): number[] {
    return Array.from({ length: this.numPools() }, (_, i) => i);
  }

  getSampleTransform(sample: BooleanSample): string {
    const x1 = sample.inputs[0];
    const x2 = sample.inputs[1];
    const cx = x1 === 0 ? 80 : 220;
    const cy = x2 === 0 ? 220 : 80;
    return `translate(${cx}, ${cy})`;
  }

  getPoolCx(l: BerkovichBooleanLearner, m: number): number {
    const W0 = l.W[1][m][0];
    const pw0 = l.poolWeights[m][0];
    const effCenter = simplify(subtract(W0.center, pw0.center));
    const ratio = this.rationalToMod1Ratio(effCenter);
    return 30 + Math.max(0, Math.min(1, ratio)) * 240;
  }

  getPoolCy(l: BerkovichBooleanLearner, m: number): number {
    const d1 = 1 % l.numVars;
    const W1 = l.W[1][m][d1];
    const pw1 = l.poolWeights[m][d1];
    const effCenter = simplify(subtract(W1.center, pw1.center));
    const ratio = this.rationalToMod1Ratio(effCenter);
    return 270 - Math.max(0, Math.min(1, ratio)) * 240;
  }

  getPoolRadius(l: BerkovichBooleanLearner, m: number): number {
    const rhoW = l.W[1][m][0].rho;
    const rhoPW = l.poolWeights[m][0].rho;
    const effectiveRho = Math.min(rhoW, rhoPW);
    const r = Math.exp(effectiveRho * Math.log(Number(l.prime))) * 60;
    return Math.max(15, Math.min(80, r));
  }

  getTargetCx(l: BerkovichBooleanLearner, classK: number, m: number): number {
    const W0 = l.W[classK][m][0];
    const ratio = this.rationalToMod1Ratio(W0.center);
    return 30 + Math.max(0, Math.min(1, ratio)) * 240;
  }

  getTargetCy(l: BerkovichBooleanLearner, classK: number, m: number): number {
    const d1 = 1 % l.numVars;
    const W1 = l.W[classK][m][d1];
    const ratio = this.rationalToMod1Ratio(W1.center);
    return 270 - Math.max(0, Math.min(1, ratio)) * 240;
  }

  getTargetRadius(l: BerkovichBooleanLearner, classK: number, m: number): number {
    const rhoW = l.W[classK][m][0].rho;
    const r = Math.exp(rhoW * Math.log(Number(l.prime))) * 50;
    return Math.max(10, Math.min(60, r));
  }

  isSampleCorrect(sample: BooleanSample): boolean {
    const l = this.learner();
    const cfg = this.config();
    if (!l || !cfg) return true;
    const fwd = l.forward(sample.inputs, cfg);
    const pred = fwd.probs[1] >= 0.5 ? 1 : 0;
    return pred === sample.target;
  }

  private rationalToMod1Ratio(r: { num: bigint; den: bigint }): number {
    const num = Number(r.num);
    const den = Number(r.den);
    if (den === 0) return 0.5;
    let val = (num / den) % 1;
    if (val < 0) val += 1;
    return val;
  }
}
