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

import { Component, input, output, computed, signal, effect, untracked, ChangeDetectionStrategy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, Router } from '@angular/router';
import { MarkdownComponent } from 'ngx-markdown';
import katex from 'katex';
// @ts-ignore
import renderMathInElement from 'katex/dist/contrib/auto-render.js';

if (typeof window !== 'undefined') {
  (window as any).katex = katex;
  (window as any).renderMathInElement = renderMathInElement;
}
import {
  Rational,
  subtract,
  formatRational,
  getValuation,
  extValuationGe,
  ExtendedNumber,
  formatDigitSequence
} from '../../../../lib/berkovich/berkovich';
import {
  GradientDetails
} from '../../../../lib/berkovich/berkovich_gradients';
import {
  VisualNode,
  VisualEdge,
  LayoutConfig,
  rhoToY as layoutRhoToY,
  getPrefixCenter as layoutGetPrefixCenter,
  getRangeForIntegerRho as layoutGetRangeForIntegerRho,
  getParameterXAtLevel as layoutGetParameterXAtLevel,
  calculateBerkovichTreeLayout
} from '../../../../lib/berkovich/berkovich_tree_layout';
import { BerkovichExplainerComponent } from '../explainer/berkovich-explainer.component';
import { BerkovichDualDigitDisplayComponent } from '../../berkovich-dual-digit-display/berkovich-dual-digit-display.component';

@Component({
  selector: 'app-berkovich-tree-vis',
  templateUrl: './berkovich-tree-vis.component.html',
  styleUrls: ['./berkovich-tree-vis.component.scss'],
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MarkdownComponent,
    BerkovichExplainerComponent,
    BerkovichDualDigitDisplayComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BerkovichTreeVisComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // Vis mode
  readonly currentVisMode = signal<'tree' | 'dual-digit'>('tree');

  ngOnInit(): void {
    // Sync from URL params on load / route changes
    this.route.queryParams.subscribe(params => {
      const mode = params['visMode'];
      if ((mode === 'tree' || mode === 'dual-digit') && mode !== this.currentVisMode()) {
        this.currentVisMode.set(mode);
      }
    });
  }

  // Inputs
  readonly prime = input.required<number>();
  readonly targetRational = input.required<Rational>();
  readonly targetLogRadius = input<number>(); // Optional: If provided, shows disk target features
  readonly targetDigitsInput = input.required<string>();
  readonly currentCenter = input.required<Rational>();
  readonly centerDigitsInput = input.required<string>();
  readonly currentLogRadius = input.required<number>();
  readonly isDraggingRho = input.required<boolean>();
  readonly gradientBreakdown = input<GradientDetails>();
  readonly currentDistanceValuation = input<ExtendedNumber>();

  readonly animationPhase = input<'idle' | 'fadeout' | 'show'>('idle');
  readonly history = input<{ center: Rational; logRadius: number }[]>([]);
  readonly showNodeComputations = input<boolean>(false);
  readonly isPlaying = input<boolean>(false);
  readonly canUndo = input<boolean>(false);
  readonly canStep = input<boolean>(true);
  readonly learningRateInput = input<string>('0.20');

  // Outputs
  readonly logRadiusChange = output<number>();
  readonly targetLogRadiusChange = output<number>();
  readonly draggingChange = output<boolean>();
  readonly manualLogRadiusAdjust = output<number>();
  readonly targetDigitsInputChange = output<string>();
  readonly centerDigitsInputChange = output<string>();
  readonly targetDigitsBlur = output<void>();
  readonly centerDigitsBlur = output<void>();
  readonly showNodeComputationsChange = output<boolean>();
  readonly playToggle = output<void>();
  readonly stepAction = output<void>();
  readonly undoAction = output<void>();
  readonly resetAction = output<void>();
  readonly randomizeAction = output<void>();
  readonly primeChange = output<number>();
  readonly learningRateInputChange = output<string>();
  readonly learningRateBlur = output<void>();

  // Constants
  readonly svgHeight = 460;
  readonly paddingY = 40;
  readonly rhoMax = 2;
  readonly rhoMin = -2;
  readonly activePathStepY = 95;
  readonly stubPathStepY = 66.5;

  // Track previous node positions for slide-out animations
  private lastPositions = new Map<string, { x: number, y: number }>();
  private dragStartY = 0;
  private dragStartRho = 0.0;

  // Derived layout calculations
  readonly treeVisuals = computed(() => {
    const p = BigInt(this.prime());
    const y = this.targetRational();
    const c_curr = this.currentCenter();
    const rho_curr = this.currentLogRadius();
    const y_rho_opt = this.targetLogRadius();
    
    return calculateBerkovichTreeLayout(
      c_curr,
      rho_curr,
      y,
      y_rho_opt,
      p,
      this.getLayoutConfig(),
      this.lastPositions
    );
  });

  readonly svgWidth = computed(() => this.treeVisuals().width);

  readonly rhoLineRange = computed(() => {
    const c_curr = this.currentCenter();
    const rho = this.currentLogRadius();
    const p = BigInt(this.prime());
    const visuals = this.treeVisuals();
    
    if (rho <= this.rhoMin) {
      return this.getRangeForIntegerRho(c_curr, this.rhoMin, p, visuals);
    }
    if (rho >= this.rhoMax) {
      return this.getRangeForIntegerRho(c_curr, this.rhoMax, p, visuals);
    }
    
    const k_child = Math.floor(rho);
    const k_parent = Math.ceil(rho);
    
    const rangeChild = this.getRangeForIntegerRho(c_curr, k_child, p, visuals);
    const rangeParent = this.getRangeForIntegerRho(c_curr, k_parent, p, visuals);
    
    if (k_child === k_parent) {
      return rangeChild;
    }
    
    const t = (rho - k_child) / (k_parent - k_child);
    
    return {
      x1: rangeChild.x1 + t * (rangeParent.x1 - rangeChild.x1),
      x2: rangeChild.x2 + t * (rangeParent.x2 - rangeChild.x2)
    };
  });

  readonly rhoLabelX = computed(() => {
    const range = this.rhoLineRange();
    const paramX = this.currentParameterCoord().x;
    const visuals = this.treeVisuals();
    
    const targetNode = visuals.nodes.find(n => 
      n.logRadius === this.rhoMin && formatRational(n.center) === formatRational(this.targetRational())
    );
    
    const targetX = targetNode ? targetNode.x : this.svgWidth() / 2;
    const targetOnLeft = targetX < paramX - 0.1;
    const side = targetOnLeft ? 'right' : 'left';
    
    const labelWidth = 73;
    const margin = 5;
    
    let x: number;
    if (side === 'right') {
      x = range.x2 + margin;
    } else {
      x = range.x1 - margin - labelWidth;
    }
    
    const minAllowed = 5;
    const maxAllowed = this.svgWidth() - labelWidth - 5;
    
    return Math.max(minAllowed, Math.min(maxAllowed, x));
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
      if (edge.id.startsWith(targetNodeId + '_to_') || edge.id.endsWith('_to_' + targetNodeId)) {
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

  readonly targetRhoLineRange = computed(() => {
    const y_rho = this.targetLogRadius();
    if (y_rho === undefined) return null;
    
    const y = this.targetRational();
    const p = BigInt(this.prime());
    const visuals = this.treeVisuals();
    
    if (y_rho <= this.rhoMin) {
      return this.getRangeForIntegerRho(y, this.rhoMin, p, visuals);
    }
    if (y_rho >= this.rhoMax) {
      return this.getRangeForIntegerRho(y, this.rhoMax, p, visuals);
    }
    
    const k_child = Math.floor(y_rho);
    const k_parent = Math.ceil(y_rho);
    
    const rangeChild = this.getRangeForIntegerRho(y, k_child, p, visuals);
    const rangeParent = this.getRangeForIntegerRho(y, k_parent, p, visuals);
    
    if (k_child === k_parent) {
      return rangeChild;
    }
    
    const t = (y_rho - k_child) / (k_parent - k_child);
    
    return {
      x1: rangeChild.x1 + t * (rangeParent.x1 - rangeChild.x1),
      x2: rangeChild.x2 + t * (rangeParent.x2 - rangeChild.x2)
    };
  });

  readonly targetParameterCoord = computed(() => {
    const y_rho = this.targetLogRadius();
    if (y_rho === undefined) return null;
    
    const y = this.targetRational();
    const p = BigInt(this.prime());
    const yCoord = this.rhoToY(y_rho);
    const nodes = this.treeVisuals().nodes;
    
    const k_parent = Math.ceil(y_rho);
    const k_child = Math.floor(y_rho);
    
    const parentNode = nodes.find(n => 
      n.logRadius === k_parent && extValuationGe(getValuation(subtract(y, n.center), p), -n.logRadius)
    );
    const childNode = nodes.find(n => 
      n.logRadius === k_child && extValuationGe(getValuation(subtract(y, n.center), p), -n.logRadius)
    );
    
    let xCoord: number;
    if (parentNode && childNode && k_parent !== k_child) {
      const t = (k_parent - y_rho) / (k_parent - k_child);
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

  readonly targetCoord = computed(() => {
    const y = this.targetRational();
    const p = BigInt(this.prime());
    const yCoord = this.rhoToY(this.rhoMin);
    const nodes = this.treeVisuals().nodes;
    
    const node = nodes.find(n => 
      n.logRadius === this.rhoMin && formatRational(n.center) === formatRational(y)
    );
    
    return { x: node ? node.x : this.svgWidth() / 2, y: yCoord };
  });

  readonly lcaCoord = computed(() => {
    const val = this.currentDistanceValuation();
    if (val === undefined || val.type !== 'finite') return null;
    const k = -val.value;
    
    // LCA radius cannot exceed rhoMax or go below rhoMin
    if (k > this.rhoMax || k < this.rhoMin) return null;
    
    const c = this.currentCenter();
    const p = BigInt(this.prime());
    const prefix = this.getPrefixCenter(c, k, p);
    const nodes = this.treeVisuals().nodes;
    
    const node = nodes.find(n => 
      n.logRadius === k && formatRational(n.center) === formatRational(prefix)
    );
    return node ? { x: node.x, y: this.rhoToY(k) } : null;
  });

  readonly lcaDistanceVal = computed(() => {
    const val = this.currentDistanceValuation();
    if (val === undefined || val.type !== 'finite') return 0;
    return -val.value;
  });

  readonly distanceExplainerText = `
The distance $d = -\\nu_p(c - y)$ indicates the **height (log-radius)** of the Lowest Common Ancestor (LCA) of the current center $c$ and target $y$ on the tree.

**Key Interpretations:**
1. **Branching Point:** It is the height at which the target's digit path and the parameter's digit path split apart (where they differ).
2. **Digit Resolution:**
   - If $d = 1$, the paths differ at $p^1$.
   - If $d = -1$, the paths match down to $p^{-1}$ and differ at $p^{-2}$.
3. **Loss Contribution:** The path-metric loss is $L = |\\rho - d| + d$. This pushes the parameter radius $\\rho$ to match the branching height $d$, and then discrete transitions will move the center $c$ onto the correct child branch at that level.
`;

  // Local state signals for transitioning candidate losses
  readonly cachedCandidates = signal<any[]>([]);
  readonly cachedBestBranch = signal<string>('');
  readonly showCandidates = signal<boolean>(false);
  // When true, non-optimal candidate loss labels fade out while the best stays visible.
  readonly fadingOutNonOptimal = signal<boolean>(false);

  readonly currentParameterCoord = computed(() => {
    return this.getParameterCoord(this.currentCenter(), this.currentLogRadius());
  });

  readonly historyCoords = computed(() => {
    const hist = this.history();
    const sliced = hist.slice(-3);
    const count = sliced.length;
    return sliced.map((h, index) => {
      const coord = this.getParameterCoord(h.center, h.logRadius);
      const age = count - 1 - index;
      const opacity = age === 0 ? 0.6 : age === 1 ? 0.35 : 0.15;
      return { ...coord, opacity };
    });
  });

  getParameterCoord(c_curr: Rational, rho: number): { x: number; y: number } {
    const p = BigInt(this.prime());
    const yCoord = this.rhoToY(rho);
    const nodes = this.treeVisuals().nodes;
    
    const k_parent = Math.ceil(rho);
    const k_child = Math.floor(rho);
    
    const parentNode = nodes.find(n => 
      n.logRadius === k_parent && extValuationGe(getValuation(subtract(c_curr, n.center), p), -n.logRadius)
    );
    const childNode = nodes.find(n => 
      n.logRadius === k_child && extValuationGe(getValuation(subtract(c_curr, n.center), p), -n.logRadius)
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
  }

  constructor() {
    effect(() => {
      const mode = this.currentVisMode();
      untracked(() => {
        const currentParams = this.route.snapshot.queryParams;
        if (currentParams['visMode'] !== mode) {
          this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { visMode: mode },
            queryParamsHandling: 'merge',
            replaceUrl: true
          });
        }
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

    // Handle candidate losses visibility and cache
    effect(() => {
      const breakdown = this.gradientBreakdown();
      const phase = this.animationPhase();
      
      untracked(() => {
        if (phase === 'fadeout') {
          // Phase 1: keep candidates visible but start fading non-optimal ones out
          this.fadingOutNonOptimal.set(true);
        } else if (breakdown?.isVertex && breakdown?.candidates) {
          this.cachedCandidates.set(breakdown.candidates);
          this.cachedBestBranch.set(breakdown.bestBranch ?? '');
          this.showCandidates.set(true);
          this.fadingOutNonOptimal.set(false);
        } else {
          this.showCandidates.set(false);
          this.fadingOutNonOptimal.set(false);
        }
      });
    });
  }

  getLayoutConfig(): LayoutConfig {
    return {
      rhoMax: this.rhoMax,
      rhoMin: this.rhoMin,
      paddingY: this.paddingY,
      activePathStepY: this.activePathStepY,
      stubPathStepY: this.stubPathStepY
    };
  }

  rhoToY(rho: number): number {
    return layoutRhoToY(rho, this.getLayoutConfig());
  }

  getParameterXAtLevel(c_curr: Rational, k: number, p: bigint, nodes: VisualNode[]): number {
    return layoutGetParameterXAtLevel(c_curr, k, p, nodes, this.svgWidth());
  }

  getRangeForIntegerRho(
    c_curr: Rational,
    k: number,
    p: bigint,
    visuals: { nodes: VisualNode[]; edges: VisualEdge[] }
  ): { x1: number; x2: number } {
    return layoutGetRangeForIntegerRho(c_curr, k, p, visuals, this.svgWidth());
  }

  getPrefixCenter(x: Rational, rho: number, p: bigint): Rational {
    return layoutGetPrefixCenter(x, rho, p);
  }

  formatRationalValue(r: Rational): string {
    return formatRational(r);
  }

  isNodeOnTargetPath(node: VisualNode): boolean {
    const y = this.targetRational();
    return node.logRadius === this.rhoMin && formatRational(node.center) === formatRational(y);
  }

  getCandidateCoords(cand: any): { x: number, y: number } {
    const p = BigInt(this.prime());
    const visuals = this.treeVisuals();
    
    // 1. Try exact match by center and logRadius.
    const exactNode = visuals.nodes.find(n => 
      n.logRadius === cand.logRadius && formatRational(n.center) === formatRational(cand.center)
    );
    if (exactNode) {
      return { x: exactNode.x, y: exactNode.y };
    }
    
    // 2. Fallback: find the tree node at this level whose disk contains the candidate center.
    //    This handles the "parent" candidate, whose center is the current parameter center c,
    //    not the tree node's center. The containing node's visual position (including stub offsets)
    //    is the correct placement for the loss label.
    const containingNode = visuals.nodes.find(n => {
      if (n.logRadius !== cand.logRadius) return false;
      return extValuationGe(getValuation(subtract(cand.center, n.center), p), -n.logRadius);
    });
    if (containingNode) {
      return { x: containingNode.x, y: containingNode.y };
    }
    
    // 3. Last resort: use computed x and standard level y.
    const x = this.getParameterXAtLevel(cand.center, cand.logRadius, p, visuals.nodes);
    const y = this.rhoToY(cand.logRadius);
    return { x, y };
  }

  formatCenterDigitString(r: Rational): string {
    return formatDigitSequence(r, BigInt(this.prime()));
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
      const deltaRho = -deltaY / this.activePathStepY;
      
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


  onVisModeChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.currentVisMode.set(select.value as 'tree' | 'dual-digit');
  }

  onLogRadiusInputChange(val: string): void {
    const sanitized = val.replace(',', '.');
    let v = parseFloat(sanitized);
    if (!isNaN(v)) {
      v = Math.max(this.rhoMin, Math.min(this.rhoMax, v));
      this.logRadiusChange.emit(v);
      this.manualLogRadiusAdjust.emit(v);
    }
  }

  onTargetLogRadiusInputChange(val: string): void {
    const sanitized = val.replace(',', '.');
    let v = parseFloat(sanitized);
    if (!isNaN(v)) {
      v = Math.max(this.rhoMin, Math.min(this.rhoMax, v));
      this.targetLogRadiusChange.emit(v);
    }
  }

  toggleShowNodeComputations(): void {
    this.showNodeComputationsChange.emit(!this.showNodeComputations());
  }

  onCheckboxChange(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    this.showNodeComputationsChange.emit(inputEl.checked);
  }

  onPrimeChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const value = parseInt(select.value, 10);
    if (!isNaN(value)) {
      this.primeChange.emit(value);
    }
  }
}
