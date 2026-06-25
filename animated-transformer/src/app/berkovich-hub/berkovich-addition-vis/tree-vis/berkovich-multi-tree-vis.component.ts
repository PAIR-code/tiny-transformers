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
import { MatCardModule } from '@angular/material/card';
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
  VertexResolutionMethod,
} from '../../../../lib/berkovich/berkovich';
import { computeTreeLayout, LayoutNode } from '../../../../lib/berkovich/tree_layout';

function computeSpaceOuter(p: number, baseGap: number = 40, minNodeGap: number = 50): number {
  interface DummyNode extends LayoutNode {
    children: DummyNode[];
  }
  const buildLeftmostTree = (depth: number): DummyNode => {
    const node: DummyNode = {
      isActive: true,
      children: []
    };
    if (depth > 0) {
      for (let i = 0; i < p; i++) {
        if (i === 0) { // leftmost active
          node.children.push(buildLeftmostTree(depth - 1));
        } else {
          node.children.push({
            isActive: false,
            children: []
          });
        }
      }
    }
    return node;
  };

  const rootLeft = buildLeftmostTree(4);
  const treeSpan = computeTreeLayout(rootLeft, baseGap, minNodeGap);
  const rootX = rootLeft.x!;
  return treeSpan - rootX;
}

export interface TrackedNode {
  id: string;
  center: Rational;
  rho: number;
  color: string;
  label: string;
}

export interface EditableNodeInputs {
  nodeId: string;
  trackedNodeId: string; // maps to the TrackedNode.id this input controls
  centerInput: string;
  rhoInput?: string;
  color: string;
  labelPrefix: string;
}


export interface MultiVisualNode {
  id: string;
  x: number;
  y: number;
  center: Rational;
  logRadius: number;
  label: string;
  isActive: boolean;
  colors: string[]; // which tracked nodes is this path active for
}

export interface MultiVisualEdge {
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
  selector: 'app-berkovich-multi-tree-vis',
  templateUrl: './berkovich-multi-tree-vis.component.html',
  styleUrls: ['./berkovich-multi-tree-vis.component.scss'],
  imports: [
    CommonModule, MatCardModule, MatIconModule, MatButtonModule,
    MatSelectModule, MatFormFieldModule, FormsModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BerkovichMultiTreeVisComponent {
  readonly prime = input.required<number>();
  readonly trackedNodes = input.required<TrackedNode[]>();

  // Optional inline editing inputs
  readonly editableInputs = input<EditableNodeInputs[]>();
  readonly vertexMethod = input<VertexResolutionMethod>('exact-per-coord');

  // Action outputs
  readonly step = output<void>();
  readonly randomize = output<void>();
  readonly inputChange = output<{ nodeId: string; field: 'center' | 'rho'; value: string }>();
  readonly inputBlur = output<{ nodeId: string; field: 'center' | 'rho' }>();
  readonly vertexMethodChange = output<VertexResolutionMethod>();

  readonly treeGap = 32; // 2em gap between trees
  readonly sideMargin = 20;
  readonly svgHeight = 440; // reduced height to avoid vertical scrolling
  readonly paddingY = 75; // extra room at top for input labels
  readonly rhoMax = 2;
  readonly rhoMin = -2;
  readonly activePathStepY = 80; // reduced vertical step
  readonly stubPathStepY = 56; // scaled proportionally


  /** Data for each per-tree input label rendered inside the SVG. */
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
      // Clamp editor X coordinate to stay within SVG boundaries [2, svgWidth - 112]
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

    // First pass: build all trees and measure their widths
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

    // Second pass: position trees in their respective columns
    for (let idx = 0; idx < n; idx++) {
      const td = treeData[idx];
      const colStart = sideMargin + idx * (colWidth + colGap);
      const colCenter = colStart + colWidth / 2;

      // Align rootNode.x exactly with the column center (colCenter)
      // to guarantee spaceOuter on both sides.
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

      const rootX = td.rootNode.x! + offset; // which is exactly colCenter
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

  getRhoLineForTrackedNode(tn: TrackedNode) {
    const p = BigInt(this.prime());
    const visuals = this.treeVisuals();
    const k = Math.floor(tn.rho);
    const prefix = tn.id + '_';
    const nodesInDisk = visuals.nodes.filter(n => {
      if (!n.id.startsWith(prefix)) return false;
      if (n.logRadius > Math.ceil(tn.rho)) return false;
      return extValuationGe(getValuation(subtract(n.center, tn.center), p), -tn.rho);
    });
    
    if (nodesInDisk.length === 0) {
      const x = this.getParameterXAtLevel(tn.center, k, p, visuals.nodes.filter(n => n.id.startsWith(prefix)));
      return { x1: x - 15, x2: x + 15, y: this.rhoToY(tn.rho) };
    }
    
    let minX = Infinity;
    let maxX = -Infinity;
    for (const node of nodesInDisk) {
      if (node.x < minX) minX = node.x;
      if (node.x > maxX) maxX = node.x;
    }
    
    if (minX === maxX) {
      return { x1: minX - 15, x2: minX + 15, y: this.rhoToY(tn.rho) };
    }
    return { x1: minX, x2: maxX, y: this.rhoToY(tn.rho) };
  }

  parseSubscripts(val: string): { text: string; isSub: boolean }[] {
    const segs: { text: string; isSub: boolean }[] = [];
    const regex = /([^_]*)_([a-zA-Z0-9ρ\(\)\+]+)/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(val)) !== null) {
      if (match[1]) {
        segs.push({ text: match[1], isSub: false });
      }
      segs.push({ text: match[2], isSub: true });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < val.length) {
      segs.push({ text: val.substring(lastIndex), isSub: false });
    }
    return segs.length > 0 ? segs : [{ text: val, isSub: false }];
  }

  onInputChange(nodeId: string, field: 'center' | 'rho', value: string): void {
    this.inputChange.emit({ nodeId, field, value });
  }
}
