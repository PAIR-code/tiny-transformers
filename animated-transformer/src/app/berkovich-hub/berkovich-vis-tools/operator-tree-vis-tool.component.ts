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

import { Component, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatSliderModule } from '@angular/material/slider';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';

import {
  BerkovichMultiTreeVisComponent,
  TrackedNode,
  EditableNodeInputs,
  BerkovichBinaryOperator
} from '../berkovich-operator-gradients-vis/tree-vis/berkovich-multi-tree-vis.component';
import {
  Rational,
  parseDigitSequence,
  truncateToTreeRange,
  formatDigitSequence,
  add,
  subtract,
  multiply,
  getValuation,
  formatRational
} from '../../../lib/berkovich/berkovich';
import {
  BerkovichPoint,
  AdditionOperator,
  MultiplicationOperator,
  VertexResolutionMethod
} from '../../../lib/berkovich/berkovich_gradients';

@Component({
  selector: 'app-operator-tree-vis-tool',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    RouterLinkActive,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    MatSliderModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    BerkovichMultiTreeVisComponent
  ],
  template: `
    <div class="berkovich-explorer">
      <!-- Header Banner -->
      <header class="explorer-header">
        <div class="header-content">
          <button mat-icon-button routerLink="/berkovich/vis-tools" class="back-btn" aria-label="Go back to vis tools">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <div>
            <h1>Operator Tree Vis Sandbox</h1>
            <p class="subtitle">
              Configure binary operator visualizers to see parallel trees for $x_1$, $x_2$ operations, and target $y$.
            </p>
          </div>
        </div>
        <nav class="header-nav">
          <a routerLink="/berkovich/point" routerLinkActive="active-nav">Point SGD</a>
          <a routerLink="/berkovich/disk" routerLinkActive="active-nav">Disk SGD</a>
          <a routerLink="/berkovich/unary-gradients" routerLinkActive="active-nav">Unary Op Gradients</a>
          <a routerLink="/berkovich/operator-gradients" routerLinkActive="active-nav">Binary Op Gradients</a>
          <a routerLink="/berkovich/space-explorers" routerLinkActive="active-nav">Shakespeare Predictor</a>
          <a routerLink="/berkovich/glossary" routerLinkActive="active-nav">Glossary</a>
          <a routerLink="/berkovich/vis-tools" routerLinkActive="active-nav">Vis Tools</a>
        </nav>
      </header>

      <div class="dashboard-grid">
        <!-- Preview Panel -->
        <section class="visualizer-card-container" style="display: flex; flex-direction: column; gap: 16px; background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px;">
          <h2 style="font-size: 18px; font-weight: 700; margin: 0; color: #0f172a; display: flex; align-items: center; gap: 8px;">
            <mat-icon style="color: #3b82f6;">visibility</mat-icon>
            Component Live Preview
          </h2>
          <div style="flex-grow: 1; display: flex; align-items: center; justify-content: center; min-height: 480px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; overflow: auto; padding: 16px;">
            <app-berkovich-multi-tree-vis
              [prime]="prime()"
              [trackedNodes]="trackedNodes()"
              [stepDetails]="stepDetails()"
              [editableInputs]="editableInputs()"
              [operator]="operator()"
              [vertexMethod]="vertexMethod()"
              [learningRateInput]="learningRateInput()"
              (inputChange)="onEditableInputChange($event)"
              (operatorChange)="operator.set($event)"
              (vertexMethodChange)="vertexMethod.set($event)"
              (primeChange)="prime.set($event)"
              (learningRateInputChange)="learningRateInput.set($event)"
              (step)="stepSGD()"
            />
          </div>
        </section>

        <!-- Controls Sidepanel -->
        <aside class="control-panel" style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; display: flex; flex-direction: column; gap: 20px;">
          <h2 style="font-size: 18px; font-weight: 700; margin: 0; color: #0f172a; display: flex; align-items: center; gap: 8px;">
            <mat-icon style="color: #6366f1;">settings</mat-icon>
            Configuration
          </h2>

          <div style="display: flex; flex-direction: column; gap: 16px;">
            <!-- Operator -->
            <mat-form-field appearance="outline" style="width: 100%;">
              <mat-label>Operator</mat-label>
              <mat-select [value]="operator()" (selectionChange)="operator.set($event.value)">
                <mat-option value="addition">Addition (x1 + x2)</mat-option>
                <mat-option value="multiplication">Multiplication (x1 * x2)</mat-option>
              </mat-select>
            </mat-form-field>

            <!-- Prime -->
            <mat-form-field appearance="outline" style="width: 100%;">
              <mat-label>Base Prime (p)</mat-label>
              <mat-select [value]="prime()" (selectionChange)="prime.set($event.value)">
                <mat-option [value]="2">2</mat-option>
                <mat-option [value]="3">3</mat-option>
                <mat-option [value]="5">5</mat-option>
                <mat-option [value]="7">7</mat-option>
              </mat-select>
            </mat-form-field>

            <!-- Vertex Method -->
            <mat-form-field appearance="outline" style="width: 100%;">
              <mat-label>Vertex Resolution Method</mat-label>
              <mat-select [value]="vertexMethod()" (selectionChange)="vertexMethod.set($event.value)">
                <mat-option value="exact-per-coord">Exact Per-Coordinate</mat-option>
                <mat-option value="exact-joint">Exact Joint</mat-option>
                <mat-option value="uniform-branch">Uniform Branch</mat-option>
              </mat-select>
            </mat-form-field>

            <!-- Target Y -->
            <mat-form-field appearance="outline" style="width: 100%;">
              <mat-label>Target Y Digit String (e.g. 00.00)</mat-label>
              <input matInput [ngModel]="rawCenterY()" (ngModelChange)="rawCenterY.set($event)">
            </mat-form-field>

            <!-- X1 Parameter -->
            <fieldset style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; display: flex; flex-direction: column; gap: 10px;">
              <legend style="font-size: 11px; font-weight: 700; color: #2563eb; padding: 0 4px;">Parameter x1</legend>
              <mat-form-field appearance="outline" style="width: 100%; margin-bottom: 0;">
                <mat-label>x1 Digit String (e.g. 12.20)</mat-label>
                <input matInput [ngModel]="rawCenterX1()" (ngModelChange)="rawCenterX1.set($event)">
              </mat-form-field>
              <div>
                <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 500; margin-bottom: 2px;">
                  <span>x1 Log-Radius (rho)</span>
                  <span style="font-weight: 700; color: #2563eb;">{{ rhoX1().toFixed(1) }}</span>
                </div>
                <mat-slider min="-2" max="2" step="0.1" style="width: 100%;">
                  <input matSliderThumb [ngModel]="rhoX1()" (ngModelChange)="rhoX1.set($event)">
                </mat-slider>
              </div>
            </fieldset>

            <!-- X2 Parameter -->
            <fieldset style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; display: flex; flex-direction: column; gap: 10px;">
              <legend style="font-size: 11px; font-weight: 700; color: #db2777; padding: 0 4px;">Parameter x2</legend>
              <mat-form-field appearance="outline" style="width: 100%; margin-bottom: 0;">
                <mat-label>x2 Digit String (e.g. 02.20)</mat-label>
                <input matInput [ngModel]="rawCenterX2()" (ngModelChange)="rawCenterX2.set($event)">
              </mat-form-field>
              <div>
                <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 500; margin-bottom: 2px;">
                  <span>x2 Log-Radius (rho)</span>
                  <span style="font-weight: 700; color: #db2777;">{{ rhoX2().toFixed(1) }}</span>
                </div>
                <mat-slider min="-2" max="2" step="0.1" style="width: 100%;">
                  <input matSliderThumb [ngModel]="rhoX2()" (ngModelChange)="rhoX2.set($event)">
                </mat-slider>
              </div>
            </fieldset>

            <button mat-flat-button color="primary" (click)="stepSGD()" style="width: 100%; height: 40px; font-weight: 600;">
              <mat-icon>play_arrow</mat-icon>
              Simulate 1 SGD Step
            </button>
          </div>
        </aside>
      </div>
    </div>
  `,
  styleUrls: ['../berkovich-point-vis/berkovich-point-vis.component.scss']
})
export class OperatorTreeVisToolComponent {
  readonly prime = signal<number>(3);
  readonly operator = signal<BerkovichBinaryOperator>('addition');
  readonly vertexMethod = signal<VertexResolutionMethod>('exact-per-coord');
  readonly learningRateInput = signal<string>('0.20');

  readonly rawCenterY = signal<string>('00.00');
  readonly rawCenterX1 = signal<string>('12.20');
  readonly rhoX1 = signal<number>(0.0);
  readonly rawCenterX2 = signal<string>('02.20');
  readonly rhoX2 = signal<number>(-1.0);

  readonly centerY = computed<Rational>(() => this.parseParam(this.rawCenterY()));
  readonly centerX1 = computed<Rational>(() => this.parseParam(this.rawCenterX1()));
  readonly centerX2 = computed<Rational>(() => this.parseParam(this.rawCenterX2()));

  private parseParam(s: string): Rational {
    try {
      return truncateToTreeRange(
        parseDigitSequence(s, BigInt(this.prime())),
        BigInt(this.prime()), -2, 1
      );
    } catch {
      return { num: 0n, den: 1n };
    }
  }

  readonly stepDetails = computed(() => {
    const op = this.operator();
    const p = BigInt(this.prime());
    const x1 = new BerkovichPoint(this.centerX1(), this.rhoX1());
    const x2 = new BerkovichPoint(this.centerX2(), this.rhoX2());
    const targetY = this.centerY();
    const eta = parseFloat(this.learningRateInput()) || 0.2;

    if (op === 'multiplication') {
      const res = new MultiplicationOperator().step(x1, x2, targetY, p, eta, this.vertexMethod());
      const diff = subtract(res.prod.center, targetY);
      const valDiff = getValuation(diff, p);
      const d = valDiff.type === 'finite' ? -valDiff.value : -Infinity;
      return {
        nextX1: res.nextX1,
        nextX2: res.nextX2,
        outCenter: truncateToTreeRange(res.prod.center, p, -2, 1),
        outRho: res.prod.rho,
        loss: res.loss,
        drhoX1: res.drhoProd_drhoX1,
        drhoX2: res.drhoProd_drhoX2,
        drOut: res.drProd,
        dY1: d,
        dY2: d
      };
    } else {
      const res = new AdditionOperator().step(x1, x2, targetY, p, eta, this.vertexMethod());
      const diff = subtract(res.sum.center, targetY);
      const valDiff = getValuation(diff, p);
      const d = valDiff.type === 'finite' ? -valDiff.value : -Infinity;
      return {
        nextX1: res.nextX1,
        nextX2: res.nextX2,
        outCenter: truncateToTreeRange(res.sum.center, p, -2, 1),
        outRho: res.sum.rho,
        loss: res.loss,
        drhoX1: res.drhoSum_drhoX1,
        drhoX2: res.drhoSum_drhoX2,
        drOut: res.drSum,
        dY1: d,
        dY2: d
      };
    }
  });

  readonly trackedNodes = computed<TrackedNode[]>(() => {
    const op = this.operator();
    const details = this.stepDetails();

    const labelOut = op === 'multiplication' ? '(x1*x2)_ρ' : '(x1+x2)_ρ';
    const idOut = op === 'multiplication' ? 'X1*X2' : 'X1+X2';
    return [
      { id: 'X1', center: this.centerX1(), rho: this.rhoX1(), color: '#60a5fa', label: 'x1_ρ' },
      { id: 'X2', center: this.centerX2(), rho: this.rhoX2(), color: '#f472b6', label: 'x2_ρ' },
      { id: idOut, center: details.outCenter, rho: details.outRho, color: '#a78bfa', label: labelOut },
      { id: 'Y', center: this.centerY(), rho: -2, color: '#eab308', label: 'y_c (Target)' }
    ];
  });

  readonly editableInputs = computed<EditableNodeInputs[]>(() => {
    const p = BigInt(this.prime());
    const op = this.operator();
    const details = this.stepDetails();
    const idOut = op === 'multiplication' ? 'X1*X2' : 'X1+X2';
    const labelOut = op === 'multiplication' ? 'x₁·x₂' : 'x₁+x₂';

    return [
      {
        nodeId: 'X1',
        trackedNodeId: 'X1',
        centerInput: this.rawCenterX1(),
        rhoInput: this.rhoX1().toFixed(1),
        color: '#2563eb',
        labelPrefix: 'x₁'
      },
      {
        nodeId: 'X2',
        trackedNodeId: 'X2',
        centerInput: this.rawCenterX2(),
        rhoInput: this.rhoX2().toFixed(1),
        color: '#db2777',
        labelPrefix: 'x₂'
      },
      {
        nodeId: idOut,
        trackedNodeId: idOut,
        centerInput: formatDigitSequence(details.outCenter, p),
        rhoInput: details.outRho.toFixed(2),
        color: '#7c3aed',
        labelPrefix: labelOut,
        readonly: true
      },
      {
        nodeId: 'Y',
        trackedNodeId: 'Y',
        centerInput: this.rawCenterY(),
        color: '#eab308',
        labelPrefix: 'y'
      }
    ];
  });

  onEditableInputChange(change: { nodeId: string; field: 'center' | 'rho'; value: string }) {
    if (change.nodeId === 'X1') {
      if (change.field === 'center') this.rawCenterX1.set(change.value);
      if (change.field === 'rho') this.rhoX1.set(parseFloat(change.value) || 0.0);
    } else if (change.nodeId === 'X2') {
      if (change.field === 'center') this.rawCenterX2.set(change.value);
      if (change.field === 'rho') this.rhoX2.set(parseFloat(change.value) || 0.0);
    } else if (change.nodeId === 'Y') {
      if (change.field === 'center') this.rawCenterY.set(change.value);
    }
  }

  stepSGD() {
    const details = this.stepDetails();
    const p = BigInt(this.prime());
    
    this.rawCenterX1.set(formatDigitSequence(details.nextX1.center, p));
    this.rhoX1.set(details.nextX1.rho);
    this.rawCenterX2.set(formatDigitSequence(details.nextX2.center, p));
    this.rhoX2.set(details.nextX2.rho);
  }
}
