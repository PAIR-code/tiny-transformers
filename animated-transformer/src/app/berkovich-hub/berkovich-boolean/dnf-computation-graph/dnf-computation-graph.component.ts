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
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import {
  BerkovichBooleanLearner,
  BerkovichBooleanConfig
} from '../models/berkovich-boolean-learner';
import { BerkovichDisk } from '../../berkovich-mnist/models/berkovich-mnist-learner';
import { BerkovichDigitDisplayComponent } from '../../berkovich-digit-display/berkovich-digit-display.component';

export type InspectTargetType = 'input' | 'pool-weight' | 'pool' | 'pool-target' | 'class-target';

export interface InspectTarget {
  type: InspectTargetType;
  title: string;
  subtitle: string;
  dimIndex?: number;
  poolIndex?: number;
  classIndex?: number;
  disk?: BerkovichDisk | null;
  diskTitle?: string;
  secondDisk?: BerkovichDisk | null;
  secondTitle?: string;
}

export interface GraphInputNode {
  dimIndex: number;
  bitValue: number;
  x: number;
  y: number;
}

export interface GraphPoolNode {
  poolIndex: number;
  andLoss: number;
  isWinner: boolean;
  x: number;
  y: number;
}

export interface GraphClassNode {
  classIndex: number;
  minLoss: number;
  isPredicted: boolean;
  x: number;
  y: number;
}

export interface GraphOutputNode {
  classIndex: number;
  prob: number;
  isPredicted: boolean;
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  dimIndex: number;
  poolIndex: number;
  classIndex: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  midX: number;
  midY: number;
  badgeX: number;
  badgeY: number;
  pathD: string;
}

@Component({
  selector: 'app-dnf-computation-graph',
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    BerkovichDigitDisplayComponent
  ],
  templateUrl: './dnf-computation-graph.component.html',
  styleUrls: ['./dnf-computation-graph.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DnfComputationGraphComponent {
  learner = input.required<BerkovichBooleanLearner | null>();
  inputs = input.required<number[]>();
  numVars = input.required<number>();
  numPools = input.required<number>();
  prime = input<number>(2);
  config = input<BerkovichBooleanConfig>();
  tick = input<number>(0);

  readonly toggleBit = output<number>();

  readonly hoveredPoolIndex = signal<number | null>(null);

  readonly inspectedTarget = signal<InspectTarget | null>({
    type: 'pool',
    title: 'Affinoid Hidden Pool 1',
    subtitle: 'AND Clause across D dimensions (supremum norm max Loss)',
    poolIndex: 0
  });

  readonly forwardResult = computed(() => {
    this.tick();
    const l = this.learner();
    const cfg = this.config();
    const x = this.inputs();
    if (!l || !cfg || !x || x.length === 0) return null;

    return l.forward(x, cfg);
  });

  readonly inputNodes = computed<GraphInputNode[]>(() => {
    const x = this.inputs();
    const vars = this.numVars();
    const nodes: GraphInputNode[] = [];
    const count = Math.max(1, vars);
    const topY = 135;
    const bottomY = 385;
    const spacing = count > 1 ? (bottomY - topY) / (count - 1) : 0;

    for (let d = 0; d < count; d++) {
      const yPos = count > 1 ? topY + d * spacing : (topY + bottomY) / 2;
      nodes.push({
        dimIndex: d,
        bitValue: x[d] ?? 0,
        x: 70,
        y: yPos
      });
    }
    return nodes;
  });

  readonly poolNodes = computed<GraphPoolNode[]>(() => {
    const res = this.forwardResult();
    const pools = this.numPools();
    const nodes: GraphPoolNode[] = [];
    const count = Math.max(1, pools);
    const topY = 115;
    const bottomY = 405;
    const spacing = count > 1 ? (bottomY - topY) / (count - 1) : 0;

    const winnerPool = res ? res.activeConstraints[1] : 0;

    for (let m = 0; m < count; m++) {
      const yPos = count > 1 ? topY + m * spacing : (topY + bottomY) / 2;
      const lossList = res ? res.pathLosses[1][m] : [0];
      const maxLoss = lossList && lossList.length > 0 ? Math.max(...lossList) : 0;

      nodes.push({
        poolIndex: m,
        andLoss: maxLoss,
        isWinner: m === winnerPool,
        x: 470,
        y: yPos
      });
    }
    return nodes;
  });

  readonly classNodes = computed<GraphClassNode[]>(() => {
    const res = this.forwardResult();
    const isOnePred = res ? res.logits[1] >= res.logits[0] : false;

    const minLoss0 = res ? Math.min(...res.pathLosses[0].map(l => Math.max(...l))) : 0;
    const minLoss1 = res ? Math.min(...res.pathLosses[1].map(l => Math.max(...l))) : 0;

    return [
      {
        classIndex: 0,
        minLoss: minLoss0,
        isPredicted: !isOnePred,
        x: 680,
        y: 150
      },
      {
        classIndex: 1,
        minLoss: minLoss1,
        isPredicted: isOnePred,
        x: 680,
        y: 360
      }
    ];
  });

  readonly outputNodes = computed<GraphOutputNode[]>(() => {
    const res = this.forwardResult();
    const prob0 = res ? res.probs[0] : 0.5;
    const prob1 = res ? res.probs[1] : 0.5;
    const isOnePred = prob1 >= prob0;

    return [
      {
        classIndex: 0,
        prob: prob0,
        isPredicted: !isOnePred,
        x: 800,
        y: 150
      },
      {
        classIndex: 1,
        prob: prob1,
        isPredicted: isOnePred,
        x: 800,
        y: 360
      }
    ];
  });

  readonly inputToPoolEdges = computed<GraphEdge[]>(() => {
    const inNodes = this.inputNodes();
    const pNodes = this.poolNodes();
    const edges: GraphEdge[] = [];

    for (const inNode of inNodes) {
      for (const pNode of pNodes) {
        const startX = inNode.x + 28;
        const startY = inNode.y;
        const endX = pNode.x - 67;
        const endY = pNode.y;
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;

        edges.push({
          id: `in-${inNode.dimIndex}-pool-${pNode.poolIndex}`,
          dimIndex: inNode.dimIndex,
          poolIndex: pNode.poolIndex,
          classIndex: 0,
          startX,
          startY,
          endX,
          endY,
          midX,
          midY,
          badgeX: midX,
          badgeY: midY,
          pathD: this.computeBezier(startX, startY, endX, endY)
        });
      }
    }
    return edges;
  });

  readonly poolToClassEdges = computed<GraphEdge[]>(() => {
    const pNodes = this.poolNodes();
    const cNodes = this.classNodes();
    const edges: GraphEdge[] = [];

    for (const pNode of pNodes) {
      for (const cNode of cNodes) {
        const startX = pNode.x + 67;
        const startY = pNode.y;
        const endX = cNode.x - 39;
        const endY = cNode.y;
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;
        const pt = this.computeBezierPoint(startX, startY, endX, endY, cNode.classIndex === 0 ? 0.38 : 0.62);

        edges.push({
          id: `pool-${pNode.poolIndex}-cls-${cNode.classIndex}`,
          dimIndex: 0,
          poolIndex: pNode.poolIndex,
          classIndex: cNode.classIndex,
          startX,
          startY,
          endX,
          endY,
          midX,
          midY,
          badgeX: pt.x,
          badgeY: pt.y,
          pathD: this.computeBezier(startX, startY, endX, endY)
        });
      }
    }
    return edges;
  });

  shouldShowTargetBadge(poolIndex: number, classIndex: number): boolean {
    const h = this.hoveredPoolIndex();
    if (h !== null && h === poolIndex) return true;

    const cur = this.inspectedTarget();
    if (cur && cur.poolIndex === poolIndex) return true;

    if (this.isWinningClassEdge(poolIndex, classIndex)) return true;

    return false;
  }

  onInputNodeClick(dimIndex: number) {
    this.toggleBit.emit(dimIndex);
  }

  inspectInputNode(dimIndex: number, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    const l = this.learner();
    const x = this.inputs();
    let disk: BerkovichDisk | null = null;
    if (l) {
      const encoded = l.encodeInputs(x);
      disk = encoded[dimIndex] ?? null;
    }

    this.inspectedTarget.set({
      type: 'input',
      title: `Input Leaf Disk X(${dimIndex + 1})`,
      subtitle: `2-adic leaf point embedding for input bit x(${dimIndex + 1}) = ${x[dimIndex] ?? 0}`,
      dimIndex,
      disk,
      diskTitle: `2-adic Digit Sequence for Input Bit x(${dimIndex + 1})`
    });
  }

  inspectPoolWeight(poolIndex: number, dimIndex: number, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    const l = this.learner();
    const res = this.forwardResult();
    let disk: BerkovichDisk | null = null;
    let secondDisk: BerkovichDisk | null = null;
    if (l && l.poolWeights && l.poolWeights[poolIndex]) {
      disk = l.poolWeights[poolIndex][dimIndex] ?? null;
    }
    if (res && res.pools && res.pools[poolIndex]) {
      secondDisk = res.pools[poolIndex][dimIndex] ?? null;
    }

    this.inspectedTarget.set({
      type: 'pool-weight',
      title: `Pool Weight Parameter PW(${poolIndex + 1},${dimIndex + 1})`,
      subtitle: `Learned translation weight in Q_p connecting Input X(${dimIndex + 1}) to Pool ${poolIndex + 1}`,
      poolIndex,
      dimIndex,
      disk,
      diskTitle: `Learned Weight Disk PW(${poolIndex + 1},${dimIndex + 1})`,
      secondDisk,
      secondTitle: `Resulting Pooled Hidden Disk H(${poolIndex + 1},${dimIndex + 1}) = X(${dimIndex + 1}) ⊕ PW`
    });
  }

  inspectPoolNode(poolIndex: number, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.inspectedTarget.set({
      type: 'pool',
      title: `Affinoid Hidden Pool ${poolIndex + 1}`,
      subtitle: `AND Clause across D=${this.numVars()} dimensions (supremum norm max Loss)`,
      poolIndex
    });
  }

  inspectClassTarget(classIndex: number, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.inspectedTarget.set({
      type: 'class-target',
      title: `Target Constraints W(${classIndex},m,d) for Class ${classIndex} (${classIndex === 1 ? 'True' : 'False'})`,
      subtitle: `Learned affinoid target disks in B for DNF OR aggregator`,
      classIndex
    });
  }

  inspectPoolTarget(poolIndex: number, classIndex: number, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.inspectedTarget.set({
      type: 'pool-target',
      title: `Learned Target Constraint Disks W(${classIndex}, ${poolIndex + 1}, d)`,
      subtitle: `Affinoid target disks in B for Class ${classIndex} (${classIndex === 1 ? 'True' : 'False'}), Pool ${poolIndex + 1} across all D dimensions`,
      poolIndex,
      classIndex
    });
  }

  isInspected(
    type: InspectTargetType,
    poolIndex?: number,
    dimIndex?: number,
    classIndex?: number
  ): boolean {
    const cur = this.inspectedTarget();
    if (!cur || cur.type !== type) {
      return false;
    }
    if (poolIndex !== undefined && cur.poolIndex !== poolIndex) {
      return false;
    }
    if (dimIndex !== undefined && cur.dimIndex !== dimIndex) {
      return false;
    }
    if (classIndex !== undefined && cur.classIndex !== classIndex) {
      return false;
    }
    return true;
  }

  getTargetTypeLabel(type: InspectTargetType): string {
    switch (type) {
      case 'input':
        return 'Input Bit Node';
      case 'pool-weight':
        return 'Learned Parameter';
      case 'pool':
        return 'Affinoid Hidden Pool';
      case 'pool-target':
        return 'Target Constraint Disks';
      case 'class-target':
        return 'Class Target Constraints';
    }
  }

  getVarIndices(): number[] {
    return Array.from({ length: this.numVars() }, (_, i) => i);
  }

  getPoolIndices(): number[] {
    return Array.from({ length: this.numPools() }, (_, i) => i);
  }

  getPoolDimDisk(m: number, d: number): BerkovichDisk | null {
    const res = this.forwardResult();
    if (!res || !res.pools || !res.pools[m]) return null;
    return res.pools[m][d] || null;
  }

  getTargetDimDisk(classK: number, m: number, d: number): BerkovichDisk | null {
    const l = this.learner();
    if (!l || !l.W || !l.W[classK] || !l.W[classK][m]) return null;
    return l.W[classK][m][d] || null;
  }

  isEdgeActive(poolIndex: number): boolean {
    const h = this.hoveredPoolIndex();
    if (h !== null) {
      return h === poolIndex;
    }
    const res = this.forwardResult();
    const winner = res ? res.activeConstraints[1] : 0;
    return poolIndex === winner;
  }

  isEdgeDimmed(poolIndex: number): boolean {
    const h = this.hoveredPoolIndex();
    if (h !== null) {
      return h !== poolIndex;
    }
    return false;
  }

  isWinningClassEdge(poolIndex: number, classIndex: number): boolean {
    const res = this.forwardResult();
    if (!res) return false;
    return res.activeConstraints[classIndex] === poolIndex;
  }

  private computeBezier(x1: number, y1: number, x2: number, y2: number): string {
    const dx = Math.abs(x2 - x1) * 0.45;
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }

  private computeBezierPoint(x1: number, y1: number, x2: number, y2: number, t: number): { x: number; y: number } {
    const dx = Math.abs(x2 - x1) * 0.45;
    const c0x = x1;
    const c1x = x1 + dx;
    const c2x = x2 - dx;
    const c3x = x2;

    const u = 1 - t;
    const x = u * u * u * c0x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * c3x;
    const y = (u * u * (1 + 2 * t)) * y1 + (t * t * (3 - 2 * t)) * y2;
    return { x, y };
  }
}
