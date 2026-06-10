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

import { Component, OnInit, signal, computed, effect, OnDestroy, ChangeDetectionStrategy, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSliderModule } from '@angular/material/slider';
import { MatCardModule } from '@angular/material/card';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RouterModule } from '@angular/router';
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
  multiply,
  rationalToNumber,
  formatRational,
  parseToRational,
  getValuation,
  getPadicDigits,
  getAlignedDigits,
  isVertex,
  truncateToTreeRange,
  formatDigitSequence,
  parseDigitSequence,
  computeGradientDetails
} from '../../lib/berkovich/berkovich';

// ============================================================================
// VISUAL DATA STRUCTURES
// ============================================================================

interface VisualNode {
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

interface VisualEdge {
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
  selector: 'app-berkovich-vis',
  templateUrl: './berkovich-vis.component.html',
  styleUrls: ['./berkovich-vis.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatSliderModule,
    MatCardModule,
    MatRadioModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    RouterModule,
    MarkdownModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BerkovichVisComponent implements OnInit, OnDestroy {
  // Configurable parameters
  readonly prime = signal<number>(3);
  readonly targetInput = signal<string>('5/3');
  readonly targetDigitsInput = signal<string>('01.20');
  readonly centerInput = signal<string>('0');
  readonly centerDigitsInput = signal<string>('00.00');
  readonly logRadiusInput = signal<string>('0.0');
  readonly learningRateInput = signal<string>('0.20');

  readonly initLogRadius = computed(() => {
    const v = parseFloat(this.logRadiusInput());
    return isNaN(v) ? 0.0 : v;
  });

  readonly learningRate = computed(() => {
    const v = parseFloat(this.learningRateInput());
    return isNaN(v) ? 0.20 : v;
  });
  
  // Track previous node positions for slide-out animations
  private lastPositions = new Map<string, { x: number, y: number }>();
  
  // Simulation run state
  readonly currentCenter = signal<Rational>({ num: 0n, den: 1n });
  readonly currentLogRadius = signal<number>(0.0);
  readonly stepCount = signal<number>(0);
  readonly history = signal<{ step: number; center: Rational; logRadius: number; loss: number; type: string }[]>([]);
  
  // Animation state
  private animationInterval: any = null;
  private dragStartY = 0;
  private dragStartRho = 0.0;
  readonly isPlaying = signal<boolean>(false);
  readonly isConfigCollapsed = signal<boolean>(false);
  readonly isDraggingRho = signal<boolean>(false);
  
  // Real-time displaying values for parameters inputs
  readonly displayCenter = computed(() => {
    if (this.stepCount() > 0) {
      return formatRational(this.currentCenter());
    }
    return this.centerInput();
  });

  readonly displayCenterDigits = computed(() => {
    const p = BigInt(this.prime());
    if (this.stepCount() > 0) {
      return formatDigitSequence(this.currentCenter(), p);
    }
    return this.centerDigitsInput();
  });

  readonly displayLogRadius = computed(() => {
    if (this.stepCount() > 0 || this.isDraggingRho()) {
      return this.currentLogRadius().toFixed(2);
    }
    return this.logRadiusInput();
  });
  
  // Parse targets and starting conditions
  readonly targetRational = computed(() => {
    const p = BigInt(this.prime());
    try {
      const raw = parseToRational(this.targetInput());
      return truncateToTreeRange(raw, p, -2, 1);
    } catch {
      return { num: 0n, den: 1n };
    }
  });

  readonly initCenterRational = computed(() => {
    const p = BigInt(this.prime());
    try {
      const raw = parseToRational(this.centerInput());
      return truncateToTreeRange(raw, p, -2, 1);
    } catch {
      return { num: 0n, den: 1n };
    }
  });

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

  // Calculate current distance and loss
  readonly currentDistanceValuation = computed(() => {
    const p = BigInt(this.prime());
    const c = this.currentCenter();
    const y = this.targetRational();
    const diff = subtract(c, y);
    return getValuation(diff, p);
  });

  readonly currentLoss = computed(() => {
    const rho = this.currentLogRadius();
    const val = this.currentDistanceValuation();
    const d = -val;
    return Math.abs(rho - d) + d;
  });

  readonly currentPointType = computed(() => {
    const rho = this.currentLogRadius();
    if (rho <= -4.0) return 'Type I (Leaf)';
    if (Math.abs(rho - Math.round(rho)) < 1e-7) return 'Type II (Vertex)';
    return 'Type III (Edge)';
  });

  // SVG dimensions
  readonly svgWidth = 800;
  readonly svgHeight = 460;
  readonly paddingY = 40;
  readonly rhoMax = 2;
  readonly rhoMin = -2;

  // Build the static Tree Visuals based on the prime and boundary depth
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
    // we insert a larger extra gap to visual separate target and parameter branches.
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

    const calculateLayoutAttempt = (gap: number) => {
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

      // Pass 5: Center the root node horizontally and shift the rest of the tree in unison
      const idealRootX = this.svgWidth / 2;
      const shift = idealRootX - rootNode.x!;
      const applyShift = (node: LayoutNode) => {
        node.x = node.x! + shift;
        for (const child of node.children) {
          applyShift(child);
        }
      };
      applyShift(rootNode);
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
    for (let attempt = 0; attempt < 10; attempt++) {
      calculateLayoutAttempt(extraGap);
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
    
    return { nodes, edges };
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
      xCoord = this.svgWidth / 2;
    }
    
    return { x: xCoord, y: yCoord };
  });

  // Paths along the tree towards target y and current center c
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

  // Helper to convert logRadius to Y coordinate in SVG space
  rhoToY(rho: number): number {
    const levelsCount = this.rhoMax - this.rhoMin;
    const stepY = (this.svgHeight - 2 * this.paddingY) / levelsCount;
    return this.paddingY + (this.rhoMax - rho) * stepY;
  }

  // Helper to determine if a node is the closest integer vertex to the parameter state
  isCurrentParameterVertex(node: VisualNode): boolean {
    const c = this.currentCenter();
    const rho = this.currentLogRadius();
    const k = Math.round(rho);
    return formatRational(node.center) === formatRational(c) && node.logRadius === k;
  }

  // Aligned digit row comparisons
  readonly digitRows = computed(() => {
    const p = BigInt(this.prime());
    const y = this.targetRational();
    const c = this.currentCenter();
    const rho = this.currentLogRadius();
    
    const minP = -2;
    const maxP = 2;
    const columns: {
      power: number;
      powerLabel: string;
      targetDigit: number;
      centerDigit: number;
      isResolved: boolean;
      isMatching: boolean;
    }[] = [];
    
    const targetDigits = getAlignedDigits(y, p, minP, maxP);
    const centerDigits = getAlignedDigits(c, p, minP, maxP);
    
    for (let i = 0; i < targetDigits.length; i++) {
      const k = targetDigits[i].power;
      const tDigit = targetDigits[i].digit;
      const cDigit = centerDigits[i].digit;
      
      const isResolved = k < -rho;
      const isMatching = tDigit === cDigit;
      
      let powerLabel = `p^${k}`;
      if (k === 0) powerLabel = '1';
      else if (k === 1) powerLabel = 'p';
      else if (k === -1) powerLabel = '1/p';
      
      columns.push({
        power: k,
        powerLabel,
        targetDigit: tDigit,
        centerDigit: cDigit,
        isResolved,
        isMatching
      });
    }
    
    return columns.reverse();
  });

  // Dynamic gradient and calculus updates
  readonly gradientBreakdown = computed(() => {
    const p = BigInt(this.prime());
    const c = this.currentCenter();
    const rho = this.currentLogRadius();
    const y = this.targetRational();
    const eta = this.learningRate();
    
    return computeGradientDetails(c, rho, y, p, eta);
  });

  constructor() {
    // Re-initialize state when config parameters change
    effect(() => {
      this.prime();
      this.targetRational();
      this.initCenterRational();
      this.initLogRadius();
      untracked(() => {
        this.reset();
      });
    });

    // Keep digit sequence string in sync with starting center and prime
    effect(() => {
      const c = this.initCenterRational();
      const p = BigInt(this.prime());
      untracked(() => {
        this.centerDigitsInput.set(formatDigitSequence(c, p));
      });
    });

    // Keep target digit sequence string in sync with target rational and prime
    effect(() => {
      const y = this.targetRational();
      const p = BigInt(this.prime());
      untracked(() => {
        this.targetDigitsInput.set(formatDigitSequence(y, p));
      });
    });

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

  ngOnInit(): void {
    this.reset();
  }

  ngOnDestroy(): void {
    this.stopAnimation();
  }

  reset(): void {
    this.stopAnimation();
    this.currentCenter.set(this.initCenterRational());
    this.currentLogRadius.set(this.initLogRadius());
    this.stepCount.set(0);
    this.history.set([{
      step: 0,
      center: this.initCenterRational(),
      logRadius: this.initLogRadius(),
      loss: this.currentLoss(),
      type: 'Initialization'
    }]);
  }

  step(): void {
    const p = BigInt(this.prime());
    const c = this.currentCenter();
    const rho = this.currentLogRadius();
    const y = this.targetRational();
    const eta = this.learningRate();
    
    const details = computeGradientDetails(c, rho, y, p, eta);
    
    // Update state signals
    this.currentCenter.set(details.nextCenter);
    this.currentLogRadius.set(details.nextLogRadius);
    this.stepCount.update(s => s + 1);
    
    // Add to history
    this.history.update(h => [...h, {
      step: this.stepCount(),
      center: details.nextCenter,
      logRadius: details.nextLogRadius,
      loss: details.loss,
      type: details.stepType
    }]);
    
    // Stop playing if we reach the leaf resolution limit of the tree
    if (details.nextLogRadius <= this.rhoMin) {
      this.stopAnimation();
    }
  }

  randomizeCenterAndTarget(): void {
    this.stopAnimation();
    const p = BigInt(this.prime());
    const pNum = Number(p);
    
    const getRandomSeqString = (): string => {
      const d1 = Math.floor(Math.random() * pNum);
      const d0 = Math.floor(Math.random() * pNum);
      const dm1 = Math.floor(Math.random() * pNum);
      const dm2 = Math.floor(Math.random() * pNum);
      return `${d1}${d0}.${dm1}${dm2}`;
    };
    
    let cSeq = getRandomSeqString();
    let ySeq = getRandomSeqString();
    while (cSeq === ySeq) {
      ySeq = getRandomSeqString();
    }
    
    const cRational = parseDigitSequence(cSeq, p);
    const yRational = parseDigitSequence(ySeq, p);
    
    this.centerInput.set(formatRational(cRational));
    this.centerDigitsInput.set(cSeq);
    this.targetInput.set(formatRational(yRational));
    this.targetDigitsInput.set(ySeq);
    
    this.reset();
  }

  isNodeOnTargetPath(node: VisualNode): boolean {
    const y = this.targetRational();
    return node.logRadius === this.rhoMin && formatRational(node.center) === formatRational(y);
  }

  isNodeOnParameterPath(node: VisualNode): boolean {
    const p = BigInt(this.prime());
    const c = this.currentCenter();
    return getValuation(subtract(c, node.center), p) >= -node.logRadius;
  }

  togglePlay(): void {
    if (this.isPlaying()) {
      this.stopAnimation();
    } else {
      this.startAnimation();
    }
  }

  undo(): void {
    if (this.isPlaying()) {
      this.stopAnimation();
    }
    const currentHist = this.history();
    if (currentHist.length <= 1) {
      return;
    }
    const newHist = currentHist.slice(0, -1);
    const prevStep = newHist[newHist.length - 1];
    
    this.currentCenter.set(prevStep.center);
    this.currentLogRadius.set(prevStep.logRadius);
    this.stepCount.set(prevStep.step);
    this.history.set(newHist);
  }

  toggleConfigCollapse(): void {
    this.isConfigCollapsed.update(c => !c);
  }

  private startAnimation(): void {
    this.isPlaying.set(true);
    this.animationInterval = setInterval(() => {
      this.step();
    }, 600);
  }

  private stopAnimation(): void {
    this.isPlaying.set(false);
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
    }
  }

  onTargetBlur(): void {
    const p = BigInt(this.prime());
    try {
      const r = parseToRational(this.targetInput());
      const truncated = truncateToTreeRange(r, p, -2, 1);
      this.targetInput.set(formatRational(truncated));
    } catch {
      this.targetInput.set('0');
    }
  }

  onTargetDigitsBlur(): void {
    const p = BigInt(this.prime());
    try {
      const parsed = parseDigitSequence(this.targetDigitsInput(), p);
      this.targetInput.set(formatRational(parsed));
      this.targetDigitsInput.set(formatDigitSequence(parsed, p));
    } catch {
      this.targetInput.set('0');
      this.targetDigitsInput.set('00.00');
    }
  }

  onCenterBlur(): void {
    const p = BigInt(this.prime());
    try {
      const r = parseToRational(this.centerInput());
      const truncated = truncateToTreeRange(r, p, -2, 1);
      this.centerInput.set(formatRational(truncated));
    } catch {
      this.centerInput.set('0');
    }
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

  onCenterDigitsBlur(): void {
    const p = BigInt(this.prime());
    try {
      const parsed = parseDigitSequence(this.centerDigitsInput(), p);
      this.centerInput.set(formatRational(parsed));
      this.centerDigitsInput.set(formatDigitSequence(parsed, p));
    } catch {
      this.centerInput.set('0');
      this.centerDigitsInput.set('00.00');
    }
  }

  onLogRadiusBlur(): void {
    let v = parseFloat(this.logRadiusInput());
    if (isNaN(v)) {
      v = 0.0;
    } else {
      v = Math.max(-2, Math.min(2, v));
    }
    this.logRadiusInput.set(v.toFixed(1));
  }

  onLearningRateBlur(): void {
    let v = parseFloat(this.learningRateInput());
    if (isNaN(v)) {
      v = 0.2;
    } else {
      v = Math.max(0.01, Math.min(1.0, v));
    }
    this.learningRateInput.set(v.toFixed(2));
  }

  onPointerDown(event: PointerEvent): void {
    event.preventDefault();
    (event.target as Element).setPointerCapture(event.pointerId);
    this.isDraggingRho.set(true);
    
    this.dragStartY = event.clientY;
    this.dragStartRho = this.currentLogRadius();
    
    if (this.isPlaying()) {
      this.stopAnimation();
    }
  }

  onPointerMove(event: PointerEvent): void {
    if (this.isDraggingRho()) {
      const deltaY = event.clientY - this.dragStartY;
      const levelsCount = this.rhoMax - this.rhoMin;
      const stepY = (this.svgHeight - 2 * this.paddingY) / levelsCount;
      const deltaRho = -deltaY / stepY;
      
      let rho = this.dragStartRho + deltaRho;
      rho = Math.max(this.rhoMin, Math.min(this.rhoMax, rho));
      
      this.currentLogRadius.set(rho);
      if (this.stepCount() === 0) {
        this.logRadiusInput.set(rho.toFixed(2));
      }
    }
  }

  onPointerUp(event: PointerEvent): void {
    if (this.isDraggingRho()) {
      this.isDraggingRho.set(false);
      try {
        (event.target as Element).releasePointerCapture(event.pointerId);
      } catch {}
      
      const lossVal = this.currentLoss();
      this.history.update(h => [...h, {
        step: this.stepCount(),
        center: this.currentCenter(),
        logRadius: this.currentLogRadius(),
        loss: lossVal,
        type: `Manual adjust log-radius to ρ=${this.currentLogRadius().toFixed(2)}`
      }]);
    }
  }

  // Format helper for history center values
  formatRationalValue(r: Rational): string {
    return formatRational(r);
  }

  renderMath(formula: string, displayMode = false): string {
    try {
      return katex.renderToString(formula, { displayMode, throwOnError: false });
    } catch (e) {
      return formula;
    }
  }

  renderExplanation(text: string): string {
    if (!text) return '';
    let html = text.replace(/\$([^\$]+)\$/g, (_, math) => {
      try {
        return katex.renderToString(math, { displayMode: false, throwOnError: false });
      } catch {
        return math;
      }
    });
    html = html.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
    return html;
  }
}
