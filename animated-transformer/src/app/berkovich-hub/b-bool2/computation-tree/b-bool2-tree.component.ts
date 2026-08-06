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

import {
  Component,
  input,
  output,
  signal,
  computed,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MarkdownComponent } from 'ngx-markdown';

import {
  BBool2Learner,
  BBool2Config,
  BBool2ForwardResult
} from '../models/b-bool2-learner';
import { BerkovichDisk } from '../../berkovich-mnist/models/berkovich-mnist-learner';
import { BerkovichDigitDisplayComponent } from '../../berkovich-digit-display/berkovich-digit-display.component';
import {
  Rational,
  formatDigitSequence,
  formatRational,
  parsePadicOrRationalInput,
  subtract,
  add,
  simplify
} from '../../../../lib/berkovich/berkovich';
import { computeGradientDetails } from '../../../../lib/berkovich/berkovich_gradients';

export type TreeNodeId =
  | 'x1'
  | 'x2'
  | 'b'
  | 'w1'
  | 'w2'
  | 'w3'
  | 't1'
  | 't2'
  | 't3'
  | 'f_out'
  | 'target_loss';

export type NodeOperationCategory = 'input' | 'param' | 'multiplication' | 'addition' | 'loss';

export interface TreeNode {
  id: TreeNodeId;
  label: string;
  sublabel: string;
  formula: string;
  category: NodeOperationCategory;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TreeEdge {
  id: string;
  from: TreeNodeId;
  to: TreeNodeId;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  pathD: string;
  badgeX: number;
  badgeY: number;
}

@Component({
  selector: 'app-b-bool2-tree',
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MarkdownComponent,
    BerkovichDigitDisplayComponent
  ],
  templateUrl: './b-bool2-tree.component.html',
  styleUrls: ['./b-bool2-tree.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BBool2TreeComponent {
  readonly formatCenter = formatRational;
  readonly learner = input.required<BBool2Learner | null>();
  readonly config = input.required<BBool2Config>();
  readonly activeSample = input<[number, number]>([1, 1]);
  readonly target = input<number>(0);
  readonly tick = input<number>(0);

  readonly sampleChange = output<[number, number]>();
  readonly paramEdit = output<{ param: 'b' | 'w1' | 'w2' | 'w3'; center: Rational; rho: number }>();

  readonly selectedNodeId = signal<TreeNodeId>('f_out');
  readonly showBackprop = signal<boolean>(true);

  readonly nodes: TreeNode[] = [
    // Column 1: Trainable Bias & Inputs & Weights (x = 95, width = 150, height = 92)
    {
      id: 'b',
      label: 'Bias b',
      sublabel: 'Trainable bias',
      formula: 'b \\in \\mathcal{B}(\\mathbb{Q}_p)',
      category: 'param',
      x: 95,
      y: 55,
      width: 150,
      height: 92
    },
    {
      id: 'x1',
      label: 'Input x₁',
      sublabel: 'Binary feature 1',
      formula: 'x_1 \\in \\{0, 1\\}',
      category: 'input',
      x: 95,
      y: 165,
      width: 150,
      height: 92
    },
    {
      id: 'w1',
      label: 'Weight w₁',
      sublabel: 'Weight for x₁',
      formula: 'w_1 \\in \\mathcal{B}(\\mathbb{Q}_p)',
      category: 'param',
      x: 95,
      y: 275,
      width: 150,
      height: 92
    },
    {
      id: 'x2',
      label: 'Input x₂',
      sublabel: 'Binary feature 2',
      formula: 'x_2 \\in \\{0, 1\\}',
      category: 'input',
      x: 95,
      y: 385,
      width: 150,
      height: 92
    },
    {
      id: 'w2',
      label: 'Weight w₂',
      sublabel: 'Weight for x₂',
      formula: 'w_2 \\in \\mathcal{B}(\\mathbb{Q}_p)',
      category: 'param',
      x: 95,
      y: 495,
      width: 150,
      height: 92
    },
    {
      id: 'w3',
      label: 'Weight w₃',
      sublabel: 'Interaction weight',
      formula: 'w_3 \\in \\mathcal{B}(\\mathbb{Q}_p)',
      category: 'param',
      x: 95,
      y: 605,
      width: 150,
      height: 92
    },

    // Column 2: 3 Multiplication Terms (x = 410, width = 155, height = 92)
    {
      id: 't1',
      label: 'T₁ = w₁·x₁',
      sublabel: 'Linear term 1',
      formula: 'T_1 = w_1 \\cdot x_1',
      category: 'multiplication',
      x: 410,
      y: 220,
      width: 155,
      height: 92
    },
    {
      id: 't2',
      label: 'T₂ = w₂·x₂',
      sublabel: 'Linear term 2',
      formula: 'T_2 = w_2 \\cdot x_2',
      category: 'multiplication',
      x: 410,
      y: 440,
      width: 155,
      height: 92
    },
    {
      id: 't3',
      label: 'T₃ = w₃·x₁·x₂',
      sublabel: 'Interaction term (3-way product)',
      formula: 'T_3 = w_3 \\cdot x_1 \\cdot x_2',
      category: 'multiplication',
      x: 410,
      y: 605,
      width: 155,
      height: 92
    },

    // Column 3: Single Addition Node (b + T1 + T2 + T3) (x = 710, width = 165, height = 96)
    {
      id: 'f_out',
      label: '∑ f(x₁, x₂)',
      sublabel: 'Single sum of all terms',
      formula: 'f(x_1, x_2) = b + T_1 + T_2 + T_3',
      category: 'addition',
      x: 710,
      y: 330,
      width: 165,
      height: 96
    },

    // Column 4: Loss & Target Evaluation (x = 900, width = 140, height = 92)
    {
      id: 'target_loss',
      label: 'Target & Loss',
      sublabel: 'Cross-entropy evaluation',
      formula: '\\mathcal{L}(f, y)',
      category: 'loss',
      x: 900,
      y: 330,
      width: 140,
      height: 92
    }
  ];

  readonly edges: TreeEdge[] = [
    // Inputs & Weights to Multiplications
    this.createEdge('x1', 't1', 170, 165, 332, 206),
    this.createEdge('w1', 't1', 170, 275, 332, 234),

    this.createEdge('x2', 't2', 170, 385, 332, 426),
    this.createEdge('w2', 't2', 170, 495, 332, 454),

    // 3 Inputs directly to T3: x1, x2, w3
    this.createEdge('x1', 't3', 170, 175, 332, 585),
    this.createEdge('x2', 't3', 170, 395, 332, 605),
    this.createEdge('w3', 't3', 170, 605, 332, 625),

    // Terms directly entering Single Addition Node: b, T1, T2, T3 -> f_out
    this.createEdge('b', 'f_out', 170, 55, 627, 300),
    this.createEdge('t1', 'f_out', 487, 220, 627, 320),
    this.createEdge('t2', 'f_out', 487, 440, 627, 340),
    this.createEdge('t3', 'f_out', 487, 605, 627, 360),

    // Addition Output to Target & Loss
    this.createEdge('f_out', 'target_loss', 792, 330, 830, 330)
  ];

  private createEdge(
    from: TreeNodeId,
    to: TreeNodeId,
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): TreeEdge {
    const dx = Math.abs(endX - startX) * 0.45;
    const pathD = `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;
    const badgeX = (startX + endX) / 2;
    const badgeY = (startY + endY) / 2;

    return {
      id: `${from}->${to}`,
      from,
      to,
      startX,
      startY,
      endX,
      endY,
      pathD,
      badgeX,
      badgeY
    };
  }

  readonly currentForward = computed<BBool2ForwardResult | null>(() => {
    this.tick();
    const l = this.learner();
    const cfg = this.config();
    const sample = this.activeSample();
    const tgt = this.target();
    if (!l || !cfg) return null;
    return l.forward(sample, cfg, tgt);
  });

  readonly allSamplesForward = computed(() => {
    this.tick();
    const l = this.learner();
    const cfg = this.config();
    if (!l || !cfg) return [];
    const samples: [number, number][] = [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1]
    ];
    return samples.map((s) => l.forward(s, cfg, 0));
  });

  selectNode(id: TreeNodeId) {
    this.selectedNodeId.set(id);
  }

  selectSample(x1: number, x2: number) {
    this.sampleChange.emit([x1, x2]);
  }

  getNodeDisk(nodeId: TreeNodeId, fwd?: BBool2ForwardResult | null): BerkovichDisk | null {
    const res = fwd || this.currentForward();
    if (!res) return null;
    const tree = res.tree;

    switch (nodeId) {
      case 'x1':
        return tree.x1;
      case 'x2':
        return tree.x2;
      case 'b':
        return tree.b;
      case 'w1':
        return tree.w1;
      case 'w2':
        return tree.w2;
      case 'w3':
        return tree.w3;
      case 't1':
        return tree.t1_w1x1;
      case 't2':
        return tree.t2_w2x2;
      case 't3':
        return tree.t3_w3x1x2;
      case 'f_out':
        return tree.f_out;
      case 'target_loss':
        return tree.targetDisk;
    }
  }

  formatNodeValue(nodeId: TreeNodeId): string {
    const res = this.currentForward();
    if (!res) return '-';
    if (nodeId === 'target_loss') {
      return `P(1)=${(res.probs[1] * 100).toFixed(0)}%`;
    }
    const disk = this.getNodeDisk(nodeId, res);
    if (!disk) return '-';
    return `${formatRational(disk.center)} (ρ=${disk.rho.toFixed(1)})`;
  }

  getNodeCenterStr(nodeId: TreeNodeId): string {
    const res = this.currentForward();
    if (!res) return '-';
    if (nodeId === 'target_loss') {
      return `Target: ${res.target}`;
    }
    const disk = this.getNodeDisk(nodeId, res);
    if (!disk) return '-';
    return `c = ${formatRational(disk.center)}`;
  }

  getNodeRhoStr(nodeId: TreeNodeId): string {
    const res = this.currentForward();
    if (!res) return '';
    if (nodeId === 'target_loss') {
      return `P(1)=${(res.probs[1] * 100).toFixed(0)}% (L=${res.loss.toFixed(2)})`;
    }
    const disk = this.getNodeDisk(nodeId, res);
    if (!disk) return '';
    return `ρ = ${disk.rho.toFixed(1)}`;
  }

  formatNodeDigits(nodeId: TreeNodeId): string {
    const res = this.currentForward();
    if (!res) return '-';
    const disk = this.getNodeDisk(nodeId, res);
    if (!disk) return '-';
    const p = BigInt(this.config().prime);
    return formatDigitSequence(disk.center, p, {
      minPower: -this.config().digitsRight,
      maxPower: this.config().digitsLeft - 1
    });
  }

  isInputNode(nodeId: TreeNodeId): boolean {
    return nodeId === 'x1' || nodeId === 'x2';
  }

  isParamNode(nodeId: TreeNodeId): boolean {
    return nodeId === 'b' || nodeId === 'w1' || nodeId === 'w2' || nodeId === 'w3';
  }

  onNodeCenterChange(nodeId: TreeNodeId, newCenter: Rational) {
    if (this.isParamNode(nodeId)) {
      const disk = this.getNodeDisk(nodeId);
      if (!disk) return;
      this.paramEdit.emit({
        param: nodeId as 'b' | 'w1' | 'w2' | 'w3',
        center: newCenter,
        rho: disk.rho
      });
    } else if (nodeId === 'x1') {
      const bit0 = newCenter.num !== 0n ? 1 : 0;
      this.sampleChange.emit([bit0, this.activeSample()[1]]);
    } else if (nodeId === 'x2') {
      const bit1 = newCenter.num !== 0n ? 1 : 0;
      this.sampleChange.emit([this.activeSample()[0], bit1]);
    }
  }

  onNodeRhoChange(nodeId: TreeNodeId, newRho: number) {
    if (this.isParamNode(nodeId)) {
      const disk = this.getNodeDisk(nodeId);
      if (!disk) return;
      this.paramEdit.emit({
        param: nodeId as 'b' | 'w1' | 'w2' | 'w3',
        center: disk.center,
        rho: newRho
      });
    }
  }

  getWeightGradientDetails(param: 'b' | 'w1' | 'w2' | 'w3'): {
    active: boolean;
    nextCenter?: Rational;
    nextRho?: number;
    targetRational: Rational;
    loss: number;
    stepType: string;
  } {
    const l = this.learner();
    if (!l) {
      return { active: false, targetRational: { num: 0n, den: 1n }, loss: 0, stepType: '' };
    }

    const [x1, x2] = this.activeSample();
    const target = this.target();
    const targetRational: Rational = target === 1 ? { num: 1n, den: 1n } : { num: 0n, den: 1n };
    const p = BigInt(this.config().prime);
    const lr = this.config().lr;

    let active = false;
    let targetParam: Rational = { num: 0n, den: 1n };

    if (param === 'b') {
      active = true; // b always contributes to f(x1, x2) because d(f)/db = 1
      let otherTerms: Rational = { num: 0n, den: 1n };
      if (x1 === 1) otherTerms = add(otherTerms, l.w1.center);
      if (x2 === 1) otherTerms = add(otherTerms, l.w2.center);
      if (x1 === 1 && x2 === 1) otherTerms = add(otherTerms, l.w3.center);
      targetParam = subtract(targetRational, otherTerms);
    } else if (param === 'w1') {
      active = x1 === 1; // d(f)/dw1 = x1
      let otherTerms: Rational = l.b.center;
      if (x2 === 1) {
        otherTerms = add(add(otherTerms, l.w2.center), l.w3.center);
      }
      targetParam = subtract(targetRational, otherTerms);
    } else if (param === 'w2') {
      active = x2 === 1; // d(f)/dw2 = x2
      let otherTerms: Rational = l.b.center;
      if (x1 === 1) {
        otherTerms = add(add(otherTerms, l.w1.center), l.w3.center);
      }
      targetParam = subtract(targetRational, otherTerms);
    } else if (param === 'w3') {
      active = x1 === 1 && x2 === 1; // d(f)/dw3 = x1*x2
      const sumLinear = add(add(l.b.center, l.w1.center), l.w2.center);
      targetParam = subtract(targetRational, sumLinear);
    }

    const disk = l[param];
    const details = computeGradientDetails(disk.center, disk.rho, targetParam, -2, p, lr);

    return {
      active,
      nextCenter: active && this.showBackprop() ? details.nextCenter : undefined,
      nextRho: active && this.showBackprop() ? details.nextLogRadius : undefined,
      targetRational: targetParam,
      loss: details.loss,
      stepType: details.stepType
    };
  }

  isEdgeBackpropActive(edgeId: string): boolean {
    if (!this.showBackprop()) return false;
    const [x1, x2] = this.activeSample();

    if (edgeId === 'f_out->target_loss') return true;
    if (edgeId === 'b->f_out') return true; // b always contributes to f_out

    if (x1 === 1 && (edgeId === 't1->f_out' || edgeId === 'w1->t1')) {
      return true;
    }
    if (x2 === 1 && (edgeId === 't2->f_out' || edgeId === 'w2->t2')) {
      return true;
    }
    if (x1 === 1 && x2 === 1 && (edgeId === 't3->f_out' || edgeId === 'w3->t3')) {
      return true;
    }
    return false;
  }
}
