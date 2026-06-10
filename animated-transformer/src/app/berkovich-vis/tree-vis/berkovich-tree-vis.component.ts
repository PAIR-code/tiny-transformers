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

import { Component, input, output, computed, signal, effect, untracked, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MarkdownModule } from 'ngx-markdown';
import katex from 'katex';
// @ts-ignore
import renderMathInElement from 'katex/dist/contrib/auto-render.js';

if (typeof window !== 'undefined') {
  (window as any).katex = katex;
  (window as any).renderMathInElement = renderMathInElement;
}
import {
  Rational,
  simplify,
  add,
  subtract,
  formatRational,
  getValuation,
  getAlignedDigits
} from '../../../lib/berkovich/berkovich';

export interface VisualNode {
  id: string;
  x: number;
  y: number;
  center: Rational;
  logRadius: number;
  label: string;
  isActive: boolean;
  startX?: number;
  startY?: number;
}

export interface VisualEdge {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  digitLabel: string;
  isActive: boolean;
  startX?: number;
  startY?: number;
}

@Component({
  selector: 'app-berkovich-tree-vis',
  templateUrl: './berkovich-tree-vis.component.html',
  styleUrls: ['./berkovich-tree-vis.component.scss'],
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MarkdownModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BerkovichTreeVisComponent {
  // Inputs
  readonly prime = input.required<number>();
  readonly targetRational = input.required<Rational>();
  readonly currentCenter = input.required<Rational>();
  readonly currentLogRadius = input.required<number>();
  readonly isDraggingRho = input.required<boolean>();

  // Outputs
  readonly logRadiusChange = output<number>();
  readonly draggingChange = output<boolean>();
  readonly manualLogRadiusAdjust = output<number>();

  // Constants
  readonly svgHeight = 460;
  readonly paddingY = 40;
  readonly rhoMax = 2;
  readonly rhoMin = -2;

  // Track previous node positions for slide-out animations
  private lastPositions = new Map<string, { x: number, y: number }>();
  private dragStartY = 0;
  private dragStartRho = 0.0;

  // Derived layout calculations
  readonly treeVisuals = computed(() => {
    const p = BigInt(this.prime());
    const pNum = Number(p);
    const y = this.targetRational();
    const c_curr = this.currentCenter();
    const levelsCount = this.rhoMax - this.rhoMin;
    const stepY = (this.svgHeight - 2 * this.paddingY) / levelsCount;
    
    interface LayoutNode {
      id: string;
      center: Rational;
      rho: number;
      isActive: boolean;
      children: LayoutNode[];
      ancestors: string[];
      x?: number;
    }
    
    // Pass 1: Build visual tree topology recursively while tracking ancestor lists
    const buildNode = (c: Rational, rho: number, ancestors: string[]): LayoutNode => {
      const nodeId = `${formatRational(c)}_${rho}`;
      const nodeActive =
        getValuation(subtract(y, c), p) >= -rho || getValuation(subtract(c_curr, c), p) >= -rho;
      
      const children: LayoutNode[] = [];
      const nextAncestors = [...ancestors, nodeId];
      
      if (rho > this.rhoMin && nodeActive) {
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
          children.push(buildNode(childCenter, childRho, nextAncestors));
        }
      }
      
      return {
        id: nodeId,
        center: c,
        rho,
        isActive: nodeActive,
        children,
        ancestors
      };
    };
    
    const rootCenter = simplify({ num: 0n, den: 1n });
    const rootNode = buildNode(rootCenter, this.rhoMax, []);
    
    // Pass 2: Collect all bottom-most leaves (only at rhoMin)
    const bottomLeaves: LayoutNode[] = [];
    const collectBottomLeaves = (node: LayoutNode) => {
      if (node.rho === this.rhoMin) {
        bottomLeaves.push(node);
      } else {
        for (const child of node.children) {
          collectBottomLeaves(child);
        }
      }
    };
    collectBottomLeaves(rootNode);
    
    // Find the split vertex level between parameter path (c) and target path (y)
    const splitVal = -getValuation(subtract(c_curr, y), p);
    const splitLevel = Math.ceil(splitVal);
    
    let paramChildId = "";
    let targetChildId = "";
    if (splitLevel <= this.rhoMax && splitLevel - 1 >= this.rhoMin) {
      const splitChildRho = splitLevel - 1;
      const paramPrefix = this.getPrefixCenter(c_curr, splitChildRho, p);
      const targetPrefix = this.getPrefixCenter(y, splitChildRho, p);
      paramChildId = `${formatRational(paramPrefix)}_${splitChildRho}`;
      targetChildId = `${formatRational(targetPrefix)}_${splitChildRho}`;
    }
    
    const isOnParameterBranch = (node: LayoutNode): boolean => {
      if (!paramChildId) return false;
      return node.id === paramChildId || node.ancestors.includes(paramChildId);
    };
    
    const isOnTargetBranch = (node: LayoutNode): boolean => {
      if (!targetChildId) return false;
      return node.id === targetChildId || node.ancestors.includes(targetChildId);
    };
    
    // Pass 3: Space bottom-most leaves. Sibling leaves inside a branch are placed next to each other
    // with a base gap. If they belong to different branches crossing the split vertex,
    // we insert a larger extra gap to visually separate target and parameter branches.
    const baseGap = 40;
    
    const clearX = (node: LayoutNode) => {
      node.x = undefined;
      for (const child of node.children) {
        clearX(child);
      }
    };

    // Pass 4: Compute X coordinates for parent nodes bottom-up (average of children)
    // Inactive stub placeholder nodes (which have no visual children) are interpolated
    // between their nearest active siblings at parent level.
    const computeX = (node: LayoutNode): number => {
      if (node.x !== undefined) {
        return node.x;
      }
      if (node.rho === this.rhoMin) {
        return node.x || 0;
      }
      
      // First, recursively compute coordinates for all active child branches
      const activeIndices: number[] = [];
      for (let g = 0; g < node.children.length; g++) {
        const child = node.children[g];
        if (child.children.length > 0 || child.rho === this.rhoMin) {
          computeX(child);
          activeIndices.push(g);
        }
      }
      
      // Second, interpolate coordinates for inactive sibling stubs
      if (activeIndices.length > 0) {
        for (let g = 0; g < node.children.length; g++) {
          const child = node.children[g];
          if (child.x !== undefined) continue;
          
          let g_left = -1;
          for (const idx of activeIndices) {
            if (idx < g) g_left = idx;
          }
          let g_right = -1;
          for (const idx of activeIndices) {
            if (idx > g) {
              g_right = idx;
              break;
            }
          }
          
          if (g_left !== -1 && g_right !== -1) {
            const childLeft = node.children[g_left];
            const childRight = node.children[g_right];
            const t = (g - g_left) / (g_right - g_left);
            child.x = childLeft.x! + t * (childRight.x! - childLeft.x!);
          } else if (g_left !== -1) {
            const childLeft = node.children[g_left];
            child.x = childLeft.x! + (g - g_left) * baseGap;
          } else if (g_right !== -1) {
            const childRight = node.children[g_right];
            child.x = childRight.x! - (g_right - g) * baseGap;
          }
        }
      }
      
      // Parent sits at the average X coordinate of its children
      let sum = 0;
      for (const child of node.children) {
        sum += child.x!;
      }
      node.x = sum / node.children.length;
      return node.x;
    };

    const calculateLayoutAttempt = (gap: number): number => {
      clearX(rootNode);

      const N = bottomLeaves.length;
      if (N === 1) {
        bottomLeaves[0].x = 0;
      } else if (N > 1) {
        bottomLeaves[0].x = 0;
        for (let i = 1; i < N; i++) {
          const leafA = bottomLeaves[i - 1];
          const leafB = bottomLeaves[i];
          
          const isA_Param = isOnParameterBranch(leafA);
          const isB_Param = isOnParameterBranch(leafB);
          const isA_Target = isOnTargetBranch(leafA);
          const isB_Target = isOnTargetBranch(leafB);
          
          const crossesBoundary = (isA_Param !== isB_Param) || (isA_Target !== isB_Target);
          const currentGap = crossesBoundary ? gap : baseGap;
          leafB.x = leafA.x! + currentGap;
        }
      }

      computeX(rootNode);

      let minX = Infinity;
      let maxX = -Infinity;
      const findBounds = (n: LayoutNode) => {
        if (n.x !== undefined) {
          if (n.x < minX) minX = n.x;
          if (n.x > maxX) maxX = n.x;
        }
        for (const child of n.children) {
          findBounds(child);
        }
      };
      findBounds(rootNode);

      if (minX === Infinity) {
        minX = 0;
        maxX = 0;
      }

      const treeSpan = maxX - minX;
      const computedWidth = Math.max(300, Math.round(treeSpan + 130));

      // Pass 5: Shift all nodes based on minX and the left margin boundary
      const shift = 40 - minX;
      const applyShift = (node: LayoutNode) => {
        node.x = node.x! + shift;
        for (const child of node.children) {
          applyShift(child);
        }
      };
      applyShift(rootNode);

      return computedWidth;
    };

    const hasOverlap = (): boolean => {
      const byLevel = new Map<number, number[]>();
      const collectCoords = (node: LayoutNode) => {
        if (!byLevel.has(node.rho)) {
          byLevel.set(node.rho, []);
        }
        byLevel.get(node.rho)!.push(node.x!);
        for (const child of node.children) {
          collectCoords(child);
        }
      };
      collectCoords(rootNode);

      for (const [level, xCoords] of byLevel.entries()) {
        xCoords.sort((a, b) => a - b);
        for (let i = 1; i < xCoords.length; i++) {
          if (xCoords[i] - xCoords[i - 1] < 39.9) {
            return true;
          }
        }
      }
      return false;
    };

    let extraGap = 80;
    let finalWidth = 400;
    for (let attempt = 0; attempt < 10; attempt++) {
      finalWidth = calculateLayoutAttempt(extraGap);
      if (hasOverlap()) {
        extraGap += 40;
      } else {
        break;
      }
    }
    
    // Pass 6: Build final VisualNode and VisualEdge layout representations top-down
    const nodes: VisualNode[] = [];
    const edges: VisualEdge[] = [];
    
    const positionNode = (
      node: LayoutNode,
      parentId?: string,
      parentX?: number,
      parentY?: number,
      digitLabel?: string
    ) => {
      const xCoord = node.x!;
      const yCoord = this.paddingY + (this.rhoMax - node.rho) * stepY;
      
      // Look up parent previous position for slide-out starting coordinates
      let startX: number | undefined;
      let startY: number | undefined;
      if (parentId) {
        const prevParent = this.lastPositions.get(parentId);
        if (prevParent) {
          startX = prevParent.x;
          startY = prevParent.y;
        }
      }
      
      nodes.push({
        id: node.id,
        x: xCoord,
        y: yCoord,
        center: node.center,
        logRadius: node.rho,
        label: `${formatRational(node.center)} (p^${node.rho})`,
        isActive: node.isActive,
        startX,
        startY
      });
      
      if (parentId !== undefined && parentX !== undefined && parentY !== undefined && digitLabel !== undefined) {
        edges.push({
          id: `${parentId}_to_${node.id}`,
          x1: parentX,
          y1: parentY,
          x2: xCoord,
          y2: yCoord,
          digitLabel,
          isActive: node.isActive,
          startX,
          startY
        });
      }
      
      for (let g = 0; g < node.children.length; g++) {
        const child = node.children[g];
        positionNode(child, node.id, xCoord, yCoord, g.toString());
      }
    };
    
    positionNode(rootNode);
    
    return { nodes, edges, width: finalWidth };
  });

  readonly svgWidth = computed(() => this.treeVisuals().width);

  readonly isEvaluatingJunction = computed(() => {
    const rho = this.currentLogRadius();
    return Math.abs(rho - Math.round(rho)) < 1e-7;
  });

  readonly junctionCandidates = computed(() => {
    if (!this.isEvaluatingJunction()) {
      return { nodes: new Set<string>(), edges: new Set<string>() };
    }
    
    const c = this.currentCenter();
    const rho = Math.round(this.currentLogRadius());
    const p = BigInt(this.prime());
    const prefix = this.getPrefixCenter(c, rho, p);
    const targetNodeId = `${formatRational(prefix)}_${rho}`;
    
    const candidateEdges = new Set<string>();
    const candidateNodes = new Set<string>();
    
    for (const edge of this.treeVisuals().edges) {
      if (edge.id.startsWith(targetNodeId + '_to_')) {
        candidateEdges.add(edge.id);
      }
    }
    
    for (const node of this.treeVisuals().nodes) {
      if (node.id !== targetNodeId) {
        const childEdgeId = `${targetNodeId}_to_${node.id}`;
        const parentEdgeId = `${node.id}_to_${targetNodeId}`;
        if (candidateEdges.has(childEdgeId) || candidateEdges.has(parentEdgeId)) {
          candidateNodes.add(node.id);
        }
      }
    }
    
    return { nodes: candidateNodes, edges: candidateEdges };
  });

  readonly targetPathEdges = computed(() => {
    const p = BigInt(this.prime());
    const y = this.targetRational();
    const visuals = this.treeVisuals();
    const edgeIds = new Set<string>();
    
    const pathNodes = visuals.nodes.filter(n => {
      const prefix = this.getPrefixCenter(y, n.logRadius, p);
      return formatRational(n.center) === formatRational(prefix);
    });
    
    for (const edge of visuals.edges) {
      const fromNode = visuals.nodes.find(n => n.x === edge.x1 && n.y === edge.y1);
      const toNode = visuals.nodes.find(n => n.x === edge.x2 && n.y === edge.y2);
      if (fromNode && toNode) {
        const fromInPath = pathNodes.some(n => n.id === fromNode.id);
        const toInPath = pathNodes.some(n => n.id === toNode.id);
        if (fromInPath && toInPath) {
          edgeIds.add(edge.id);
        }
      }
    }
    
    return edgeIds;
  });

  readonly parameterPathEdges = computed(() => {
    const p = BigInt(this.prime());
    const c = this.currentCenter();
    const visuals = this.treeVisuals();
    const edgeIds = new Set<string>();
    
    const pathNodes = visuals.nodes.filter(n => {
      const prefix = this.getPrefixCenter(c, n.logRadius, p);
      return formatRational(n.center) === formatRational(prefix);
    });
    
    for (const edge of visuals.edges) {
      const fromNode = visuals.nodes.find(n => n.x === edge.x1 && n.y === edge.y1);
      const toNode = visuals.nodes.find(n => n.x === edge.x2 && n.y === edge.y2);
      if (fromNode && toNode) {
        const fromInPath = pathNodes.some(n => n.id === fromNode.id);
        const toInPath = pathNodes.some(n => n.id === toNode.id);
        if (fromInPath && toInPath) {
          edgeIds.add(edge.id);
        }
      }
    }
    
    return edgeIds;
  });

  readonly currentParameterCoord = computed(() => {
    const c_curr = this.currentCenter();
    const rho = this.currentLogRadius();
    const p = BigInt(this.prime());
    const yCoord = this.rhoToY(rho);
    const nodes = this.treeVisuals().nodes;
    
    const k_parent = Math.ceil(rho);
    const k_child = Math.floor(rho);
    
    const parentNode = nodes.find(n => 
      n.logRadius === k_parent && getValuation(subtract(c_curr, n.center), p) >= -n.logRadius
    );
    const childNode = nodes.find(n => 
      n.logRadius === k_child && getValuation(subtract(c_curr, n.center), p) >= -n.logRadius
    );
    
    let xCoord: number;
    if (parentNode && childNode && k_parent !== k_child) {
      const t = (k_parent - rho) / (k_parent - k_child);
      xCoord = parentNode.x + t * (childNode.x - parentNode.x);
    } else if (parentNode) {
      xCoord = parentNode.x;
    } else if (childNode) {
      xCoord = childNode.x;
    } else {
      xCoord = this.svgWidth() / 2;
    }
    
    return { x: xCoord, y: yCoord };
  });

  constructor() {
    // Track previous node positions for slide-out animations
    effect(() => {
      const visuals = this.treeVisuals();
      const nextMap = new Map<string, { x: number, y: number }>();
      for (const node of visuals.nodes) {
        nextMap.set(node.id, { x: node.x, y: node.y });
      }
      untracked(() => {
        this.lastPositions = nextMap;
      });
    });
  }

  rhoToY(rho: number): number {
    const levelsCount = this.rhoMax - this.rhoMin;
    const stepY = (this.svgHeight - 2 * this.paddingY) / levelsCount;
    return this.paddingY + (this.rhoMax - rho) * stepY;
  }

  getPrefixCenter(x: Rational, rho: number, p: bigint): Rational {
    const aligned = getAlignedDigits(x, p, -2, 1);
    let sum: Rational = { num: 0n, den: 1n };
    for (const item of aligned) {
      if (item.power < -rho) {
        const k = item.power;
        const a = BigInt(item.digit);
        let term: Rational;
        if (k >= 0) {
          term = { num: a * (p ** BigInt(k)), den: 1n };
        } else {
          term = { num: a, den: p ** BigInt(-k) };
        }
        sum = simplify(add(sum, term));
      }
    }
    return sum;
  }

  formatRationalValue(r: Rational): string {
    return formatRational(r);
  }

  isNodeOnTargetPath(node: VisualNode): boolean {
    const y = this.targetRational();
    return node.logRadius === this.rhoMin && formatRational(node.center) === formatRational(y);
  }

  onPointerDown(event: PointerEvent): void {
    event.preventDefault();
    (event.target as Element).setPointerCapture(event.pointerId);
    this.draggingChange.emit(true);
    
    this.dragStartY = event.clientY;
    this.dragStartRho = this.currentLogRadius();
  }

  onPointerMove(event: PointerEvent): void {
    if (this.isDraggingRho()) {
      const deltaY = event.clientY - this.dragStartY;
      const levelsCount = this.rhoMax - this.rhoMin;
      const stepY = (this.svgHeight - 2 * this.paddingY) / levelsCount;
      const deltaRho = -deltaY / stepY;
      
      let rho = this.dragStartRho + deltaRho;
      rho = Math.max(this.rhoMin, Math.min(this.rhoMax, rho));
      
      this.logRadiusChange.emit(rho);
    }
  }

  onPointerUp(event: PointerEvent): void {
    if (this.isDraggingRho()) {
      this.draggingChange.emit(false);
      try {
        (event.target as Element).releasePointerCapture(event.pointerId);
      } catch {}
      this.manualLogRadiusAdjust.emit(this.currentLogRadius());
    }
  }
}
