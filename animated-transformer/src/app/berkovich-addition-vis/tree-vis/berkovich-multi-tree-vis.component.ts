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

import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import {
  Rational,
  simplify,
  add,
  subtract,
  formatDigitSequence,
  getValuation,
  extValuationGe,
} from '../../../lib/berkovich/berkovich';
import { computeTreeLayout, LayoutNode } from '../../../lib/berkovich/tree_layout';

export interface TrackedNode {
  id: string;
  center: Rational;
  rho: number;
  color: string;
  label: string;
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
  imports: [CommonModule, MatCardModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BerkovichMultiTreeVisComponent {
  readonly prime = input.required<number>();
  readonly trackedNodes = input.required<TrackedNode[]>();

  readonly svgHeight = 460;
  readonly paddingY = 40;
  readonly rhoMax = 2;
  readonly rhoMin = -2;
  readonly activePathStepY = 95;
  readonly stubPathStepY = 66.5;

  readonly treeVisuals = computed(() => {
    const p = BigInt(this.prime());
    const pNum = Number(p);
    const tracked = this.trackedNodes();
    const stepY = this.activePathStepY;
    
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
    
    const leftMargin = 30;
    const rightMargin = 30;
    const gap = 24; // horizontal gap between trees
    let currentOffset = leftMargin;
    
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
          center: c,
          rho,
          isActive,
          activeFor,
          children
        };
      };
      
      const rootCenter = simplify({ num: 0n, den: 1n });
      const rootNode = buildNode(rootCenter, this.rhoMax);
      
      // Increased minNodeGap from 40 to 50 to give more space between active branch and stubs
      const treeWidth = computeTreeLayout(rootNode, 40, 50);
      
      const positionNode = (node: LayoutNodeWithData, parentX?: number, parentY?: number, digitLabel?: string) => {
        const xCoord = node.x! + currentOffset;
        let yCoord = this.paddingY + (this.rhoMax - node.rho) * stepY;
        if (!node.isActive && parentY !== undefined) {
          yCoord = parentY + this.stubPathStepY;
        }
        
        nodes.push({
          id: node.id,
          x: xCoord,
          y: yCoord,
          center: node.center,
          logRadius: node.rho,
          label: formatDigitSequence(node.center, p),
          isActive: node.isActive,
          colors: node.activeFor
        });
        
        if (parentX !== undefined && parentY !== undefined && digitLabel !== undefined) {
          edges.push({
            id: `to_${node.id}`,
            x1: parentX,
            y1: parentY,
            x2: xCoord,
            y2: yCoord,
            digitLabel,
            isActive: node.isActive,
            colors: node.activeFor
          });
        }
        
        for (let g = 0; g < node.children.length; g++) {
          positionNode(node.children[g], xCoord, yCoord, g.toString());
        }
      };
      
      positionNode(rootNode);
      
      const rootX = rootNode.x! + currentOffset;
      const name = tn.id.toLowerCase();
      const titleText = name;

      titles.push({
        x: rootX,
        text: titleText,
        color: tn.color
      });
      
      currentOffset += treeWidth + gap;
    }
    
    const totalWidth = Math.max(800, currentOffset - gap + rightMargin);
    
    return { nodes, edges, titles, width: totalWidth };
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
}
