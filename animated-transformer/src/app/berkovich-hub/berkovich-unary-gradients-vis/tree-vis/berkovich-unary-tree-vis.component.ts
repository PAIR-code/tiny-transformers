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

import { Component, input, output, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import {
  Rational,
  simplify,
  add,
  subtract,
  formatDigitSequence,
  getValuation,
  extValuationGe,
  computeSpaceOuter,
  computeTreeLayout,
  LayoutNode,
  BerkovichUnaryOperator
} from '../../../../lib/berkovich/berkovich';

export interface TrackedNode {
  id: string;
  center: Rational;
  rho: number;
  color: string;
  label: string;
}

export interface EditableNodeInputs {
  nodeId: string;
  trackedNodeId: string;
  centerInput: string;
  rhoInput?: string;
  color: string;
  labelPrefix: string;
}

interface MultiVisualNode {
  id: string;
  x: number;
  y: number;
  center: Rational;
  logRadius: number;
  label: string;
  isActive: boolean;
  colors: string[];
}

interface MultiVisualEdge {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  digitLabel: string;
  isActive: boolean;
  colors: string[];
}

@Component({
  selector: 'app-berkovich-unary-tree-vis',
  templateUrl: './berkovich-unary-tree-vis.component.html',
  styleUrls: ['./berkovich-unary-tree-vis.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatSelectModule,
    MatFormFieldModule,
    FormsModule
  ]
})
export class BerkovichUnaryTreeVisComponent {
  readonly operator = input<BerkovichUnaryOperator>('shift');
  readonly prime = input.required<number>();
  readonly learningRateInput = input.required<string>();
  readonly vertexMethod = input.required<any>();
  readonly trackedNodes = input.required<TrackedNode[]>();
  readonly editableInputs = input<EditableNodeInputs[]>();

  readonly operatorChange = output<BerkovichUnaryOperator>();
  readonly primeChange = output<number>();
  readonly vertexMethodChange = output<any>();
  readonly inputChange = output<{ nodeId: string; field: 'center' | 'rho'; value: string }>();
  readonly inputBlur = output<{ nodeId: string; field: 'center' | 'rho' }>();
  readonly step = output<void>();
  readonly randomize = output<void>();
  readonly runToggle = output<void>();
  readonly isPlaying = input.required<boolean>();
  readonly learningRateInputChange = output<string>();
  readonly learningRateBlur = output<void>();
  readonly undo = output<void>();

  readonly treeGap = 32;
  readonly sideMargin = 20;
  readonly svgHeight = 440;
  readonly paddingY = 75;
  readonly rhoMax = 2;
  readonly rhoMin = -2;
  readonly activePathStepY = 80;
  readonly stubPathStepY = 56;

  readonly treeInputLabels = computed<{
    x: number;
    editorX: number;
    trackedNodeId: string;
    inp: EditableNodeInputs | undefined;
  }[]>(() => {
    const visuals = this.treeVisuals();
    const editable = this.editableInputs();
    const svgW = visuals.width;
    return visuals.rootPositions.map(rp => {
      const inp = editable?.find(e => e.trackedNodeId === rp.trackedNodeId);
      const editorX = Math.max(2, Math.min(svgW - 112, rp.x - 55));
      return { x: rp.x, editorX, trackedNodeId: rp.trackedNodeId, inp };
    });
  });

  readonly spaceOuter = computed(() => {
    return computeSpaceOuter(this.prime());
  });

  readonly treeVisuals = computed(() => {
    const p = BigInt(this.prime());
    const pNum = Number(p);
    const tracked = this.trackedNodes();
    const stepY = this.activePathStepY;
    const n = tracked.length;
    const sOuter = this.spaceOuter();
    const colWidth = 2 * sOuter;
    const colGap = this.treeGap;
    const sideMargin = this.sideMargin;

    interface LayoutNodeWithData extends LayoutNode {
      id: string;
      center: Rational;
      rho: number;
      activeFor: string[];
      children: LayoutNodeWithData[];
    }

    const nodes: MultiVisualNode[] = [];
    const edges: MultiVisualEdge[] = [];
    const titles: { x: number; text: string; color: string }[] = [];
    const rootPositions: { trackedNodeId: string; x: number }[] = [];

    const treeData: {
      tn: TrackedNode;
      rootNode: LayoutNodeWithData;
      treeWidth: number;
    }[] = [];

    for (const tn of tracked) {
      const buildNode = (c: Rational, rho: number): LayoutNodeWithData => {
        const activeFor: string[] = [];
        if (extValuationGe(getValuation(subtract(tn.center, c), p), -rho)) {
          activeFor.push(tn.color);
        }
        const isActive = activeFor.length > 0;
        const children: LayoutNodeWithData[] = [];
        if (rho > this.rhoMin && isActive) {
          for (let g = 0; g < pNum; g++) {
            const childRho = rho - 1;
            let shift: Rational;
            const power = -rho;
            if (power <= 0) {
              shift = simplify({ num: BigInt(g), den: p ** BigInt(-power) });
            } else {
              shift = simplify({ num: BigInt(g) * (p ** BigInt(power)), den: 1n });
            }
            const childCenter = add(c, shift);
            children.push(buildNode(childCenter, childRho));
          }
        }
        return {
          id: `${tn.id}_${formatDigitSequence(c, p)}_${rho}`,
          center: c, rho, isActive, activeFor, children
        };
      };

      const rootCenter = simplify({ num: 0n, den: 1n });
      const rootNode = buildNode(rootCenter, this.rhoMax);
      const treeWidth = computeTreeLayout(rootNode, 40, 50);
      treeData.push({ tn, rootNode, treeWidth });
    }

    for (let idx = 0; idx < n; idx++) {
      const td = treeData[idx];
      const colStart = sideMargin + idx * (colWidth + colGap);
      const colCenter = colStart + colWidth / 2;

      const offset = colCenter - td.rootNode.x!;

      const positionNode = (node: LayoutNodeWithData, parentX?: number, parentY?: number, digitLabel?: string) => {
        const xCoord = node.x! + offset;
        let yCoord = this.paddingY + (this.rhoMax - node.rho) * stepY;
        if (!node.isActive && parentY !== undefined) {
          yCoord = parentY + this.stubPathStepY;
        }

        nodes.push({
          id: node.id, x: xCoord, y: yCoord, center: node.center,
          logRadius: node.rho, label: formatDigitSequence(node.center, p),
          isActive: node.isActive, colors: node.activeFor
        });

        if (parentX !== undefined && parentY !== undefined && digitLabel !== undefined) {
          edges.push({
            id: `to_${node.id}`, x1: parentX, y1: parentY, x2: xCoord, y2: yCoord,
            digitLabel, isActive: node.isActive, colors: node.activeFor
          });
        }

        for (let g = 0; g < node.children.length; g++) {
          positionNode(node.children[g], xCoord, yCoord, g.toString());
        }
      };

      positionNode(td.rootNode);

      const rootX = td.rootNode.x! + offset;
      rootPositions.push({ trackedNodeId: td.tn.id, x: rootX });
      titles.push({ x: rootX, text: td.tn.id.toLowerCase(), color: td.tn.color });
    }

    const totalWidth = n > 0 
      ? sideMargin * 2 + n * colWidth + (n - 1) * colGap 
      : 400;

    return { nodes, edges, titles, rootPositions, width: totalWidth };
  });

  readonly svgWidth = computed(() => this.treeVisuals().width);
  readonly treeTitles = computed(() => this.treeVisuals().titles);
  
  rhoToY(rho: number): number {
    return this.paddingY + (this.rhoMax - rho) * this.activePathStepY;
  }
  
  getParameterXAtLevel(c_curr: Rational, k: number, p: bigint, nodes: MultiVisualNode[]): number {
    const node = nodes.find(n => 
      n.logRadius === k && extValuationGe(getValuation(subtract(c_curr, n.center), p), -n.logRadius)
    );
    return node ? node.x : this.svgWidth() / 2;
  }

  readonly rhoIndicatorX = computed(() => {
    const tracked = this.trackedNodes();
    const xNode = tracked.find(tn => tn.id === 'X');
    if (!xNode) return this.svgWidth() - 40;
    
    const treeVis = this.treeVisuals();
    const p = BigInt(this.prime());
    const x = this.getParameterXAtLevel(xNode.center, xNode.rho, p, treeVis.nodes);
    return x;
  });

  getRhoLineForTrackedNode(tn: TrackedNode) {
    const treeVis = this.treeVisuals();
    const p = BigInt(this.prime());
    const x = this.getParameterXAtLevel(tn.center, tn.rho, p, treeVis.nodes);
    const y = this.rhoToY(tn.rho);
    return { x1: x - 18, y1: y, x2: x + 18, y2: y };
  }

  readonly leafNodes = computed(() => {
    return this.treeVisuals().nodes.filter(n => n.logRadius === this.rhoMin);
  });

  parseSubscripts(s: string): { text: string; isSub: boolean }[] {
    const parts = s.split('.');
    if (parts.length < 2) return [{ text: s, isSub: false }];
    return [
      { text: parts[0] + '.', isSub: false },
      { text: parts[1], isSub: true }
    ];
  }

  onPrimeChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.primeChange.emit(parseInt(select.value, 10));
  }
}
