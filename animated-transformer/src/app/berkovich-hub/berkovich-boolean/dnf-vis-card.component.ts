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

import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BerkovichBooleanLearner, BooleanSample } from './models/berkovich-boolean-learner';
import { formatRational } from '../../../lib/berkovich/berkovich';

@Component({
  selector: 'app-dnf-vis-card',
  imports: [CommonModule],
  template: `
    <div class="dnf-vis-container">
      <div class="card-header">
        <h3>DNF Affinoid Domain Structure</h3>
        <span class="pool-badge">{{ numPools() }} Berkovich Pools</span>
      </div>

      <p class="description">
        The boolean function f(<b>x</b>) is learned as a Disjunctive Normal Form (DNF) affinoid domain:
        &bigvee;<sub>m=1</sub><sup>{{ numPools() }}</sup> (&bigwedge;<sub>d=1</sub><sup>{{ numVars() }}</sup> X<sub>d</sub> &in; W<sub>1,m,d</sub>).
      </p>

      <!-- Symbolic DNF Logic Formula Box -->
      <div class="formula-box">
        <div class="formula-title">Symbolic Affinoid Formula:</div>
        <div class="formula-body">
          <span class="func-name">f(x<sub>1</sub>, x<sub>2</sub>) = </span>
          @for (m of getPoolIndices(); track m; let isLast = $last) {
            <span class="pool-clause">
              (Disk<sub>m={{ m + 1 }}</sub>)
            </span>
            @if (!isLast) {
              <span class="op-or"> &nbsp;&amp;#8744;&nbsp; </span>
            }
          }
        </div>
      </div>

      <!-- 2D 2-adic Unit Square Map for 2-variable functions -->
      @if (numVars() === 2) {
        <div class="map-section">
          <div class="map-title">2-adic Unit Square Embedding Map ([0, 1] &times; [0, 1]):</div>

          <div class="canvas-2d-wrapper">
            <svg class="map-svg" viewBox="0 0 300 300">
              <!-- Grid background -->
              <rect x="30" y="30" width="240" height="240" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/>
              <line x1="150" y1="30" x2="150" y2="270" stroke="#e2e8f0" stroke-dasharray="4"/>
              <line x1="30" y1="150" x2="270" y2="150" stroke="#e2e8f0" stroke-dasharray="4"/>

              <!-- Axis Labels -->
              <text x="150" y="295" text-anchor="middle" font-size="11" fill="#64748b">x₁ (2-adic position)</text>
              <text x="10" y="150" text-anchor="middle" font-size="11" fill="#64748b" transform="rotate(-90 10 150)">x₂ (2-adic position)</text>

              <!-- Affinoid Pool Disks Overlay for Class 1 (True) -->
              @if (learner(); as l) {
                @for (m of getPoolIndices(); track m) {
                  <circle
                    [attr.cx]="getPoolCx(l, m)"
                    [attr.cy]="getPoolCy(l, m)"
                    [attr.r]="getPoolRadius(l, m)"
                    fill="rgba(37, 99, 235, 0.15)"
                    stroke="#2563eb"
                    stroke-width="1.5"
                    stroke-dasharray="3 3"
                  />
                  <text
                    [attr.x]="getPoolCx(l, m)"
                    [attr.y]="getPoolCy(l, m)"
                    text-anchor="middle"
                    dominant-baseline="central"
                    font-size="10"
                    font-weight="bold"
                    fill="#1d4ed8"
                  >
                    W₁,{{ m + 1 }}
                  </text>
                }
              }

              <!-- Truth Table Sample Points -->
              @for (sample of samples(); track sample.label) {
                <g [attr.transform]="getSampleTransform(sample)">
                  <circle
                    r="12"
                    [attr.fill]="sample.target === 1 ? '#22c55e' : '#ef4444'"
                    stroke="#ffffff"
                    stroke-width="2"
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
                    y="-16"
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
      margin-bottom: 8px;

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

    .description {
      color: #475569;
      font-size: 0.88rem;
      line-height: 1.5;
      margin-bottom: 16px;
    }

    .formula-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 16px;

      .formula-title {
        font-size: 0.8rem;
        font-weight: 600;
        color: #64748b;
        margin-bottom: 6px;
      }

      .formula-body {
        font-family: monospace;
        font-size: 0.95rem;
        color: #0f172a;
        display: flex;
        align-items: center;
        flex-wrap: wrap;

        .func-name {
          font-weight: bold;
          color: #2563eb;
        }

        .pool-clause {
          background: #eff6ff;
          color: #1d4ed8;
          padding: 2px 6px;
          border-radius: 4px;
          border: 1px solid #dbeafe;
        }

        .op-or {
          font-weight: bold;
          color: #dc2626;
        }
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
    const num = Number(W0.center.num);
    const den = Number(W0.center.den);
    const ratio = den === 0 ? 0.5 : num / den;
    return 30 + Math.max(0, Math.min(1, ratio)) * 240;
  }

  getPoolCy(l: BerkovichBooleanLearner, m: number): number {
    const W1 = l.W[1][m][1 % l.numVars];
    const num = Number(W1.center.num);
    const den = Number(W1.center.den);
    const ratio = den === 0 ? 0.5 : num / den;
    return 270 - Math.max(0, Math.min(1, ratio)) * 240;
  }

  getPoolRadius(l: BerkovichBooleanLearner, m: number): number {
    const rho0 = l.W[1][m][0].rho;
    const r = Math.exp(rho0 * Math.log(Number(l.prime))) * 60;
    return Math.max(15, Math.min(80, r));
  }
}
