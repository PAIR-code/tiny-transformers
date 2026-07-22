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

import { Component, input, output, computed, signal, ChangeDetectionStrategy, model } from '@angular/core';
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
  formatRational
} from '../../../../lib/berkovich/berkovich';
import {
  VertexResolutionMethod,
  BerkovichUnaryOperator
} from '../../../../lib/berkovich/berkovich_gradients';
import { computeTreeLayout, LayoutNode, DEFAULT_BASE_GAP, DEFAULT_MIN_NODE_GAP } from '../../../../lib/berkovich/tree_layout';
import { BerkovichDualDigitDisplayComponent } from '../../berkovich-dual-digit-display/berkovich-dual-digit-display.component';
import { BerkovichDigitDisplayComponent } from '../../berkovich-digit-display/berkovich-digit-display.component';

/** Horizontal spacing (in pixels) between the individual subtrees in the SVG layout. */
const TREE_COLUMN_GAP = 48;



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
  readonly?: boolean;
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
  selector: 'app-berkovich-unary-tree-vis',
  templateUrl: './berkovich-unary-tree-vis.component.html',
  styleUrls: ['./berkovich-unary-tree-vis.component.scss'],
  imports: [
    CommonModule, MatCardModule, MatIconModule, MatButtonModule,
    MatSelectModule, MatFormFieldModule, FormsModule,
    BerkovichDualDigitDisplayComponent, BerkovichDigitDisplayComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BerkovichUnaryTreeVisComponent {
  formatRational = formatRational;

  readonly prime = input.required<number>();
  readonly trackedNodes = input.required<TrackedNode[]>();
  readonly stepDetails = input.required<any>();
  readonly constantLabel = input<string>('k');

  // Visual mode state
  readonly visMode = model<'tree' | 'digits'>('tree');

  formatDigitSequenceHelper(r: Rational): string {
    return formatDigitSequence(r, BigInt(this.prime()));
  }

  readonly intermediateLabel = computed(() => {
    const op = this.operator();
    if (op === 'shift') return `x+${this.constantLabel()}`;
    if (op === 'scale') return `${this.constantLabel()}·x`;
    if (op === 'square') return 'x²';
    return 'x³';
  });

  // Computed properties to extract variables for dual digit display
  readonly centerX = computed(() => this.trackedNodes().find(n => n.id === 'X')?.center ?? { num: 0n, den: 1n });
  readonly rhoX = computed(() => this.trackedNodes().find(n => n.id === 'X')?.rho ?? 0.0);
  readonly centerY = computed(() => this.trackedNodes().find(n => n.id === 'Y')?.center ?? { num: 0n, den: 1n });
  readonly constantNode = computed(() => this.trackedNodes().find(n => n.id === 'C'));

  // Optional inline editing inputs
  readonly editableInputs = input<EditableNodeInputs[]>();
  readonly operator = input<BerkovichUnaryOperator>('shift');
  readonly vertexMethod = input<VertexResolutionMethod>('exact-per-coord');
  readonly isPlaying = input<boolean>(false);
  readonly learningRateInput = input<string>('0.20');
  readonly canUndo = input<boolean>(false);

  // Action outputs
  readonly operatorChange = output<BerkovichUnaryOperator>();
  readonly step = output<void>();
  readonly randomize = output<void>();
  readonly togglePlay = output<void>();
  readonly inputChange = output<{ nodeId: string; field: 'center' | 'rho'; value: string }>();
  readonly inputBlur = output<{ nodeId: string; field: 'center' | 'rho' }>();
  readonly vertexMethodChange = output<VertexResolutionMethod>();
  readonly primeChange = output<number>();
  readonly learningRateInputChange = output<string>();
  readonly learningRateBlur = output<void>();
  readonly undo = output<void>();
  readonly playStepMs = input<number>(500);
  readonly playStepMsChange = output<number>();
 
  readonly baseGap = signal<number>(DEFAULT_BASE_GAP);
  readonly minNodeGap = signal<number>(DEFAULT_MIN_NODE_GAP);
  readonly showSettings = signal<boolean>(false);

  toggleSettings() {
    this.showSettings.update(v => !v);
  }

  onPlayStepMsChange(event: Event) {
    const val = Number((event.target as HTMLInputElement).value);
    if (!isNaN(val) && val >= 100) {
      this.playStepMsChange.emit(val);
    }
  }

  onBaseGapChange(event: Event) {
    const val = Number((event.target as HTMLInputElement).value);
    if (!isNaN(val) && val > 0) {
      this.baseGap.set(val);
    }
  }

  onMinNodeGapChange(event: Event) {
    const val = Number((event.target as HTMLInputElement).value);
    if (!isNaN(val) && val > 0) {
      this.minNodeGap.set(val);
    }
  }

  readonly treeGap = TREE_COLUMN_GAP; // gap between trees
  readonly sideMargin = 20;
  readonly svgHeight = 455; // increased slightly to accommodate Y input label at bottom
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
    inputs: EditableNodeInputs[];
    width: number;
    height: number;
  }[]>(() => {
    const visuals = this.treeVisuals();
    const editable = this.editableInputs();
    const svgW = visuals.width;
    return visuals.rootPositions.map(rp => {
      const inputs: EditableNodeInputs[] = [];
      const primaryInp = editable?.find(e => e.trackedNodeId === rp.trackedNodeId);
      if (primaryInp) {
        inputs.push(primaryInp);
      }
      const width = 125;
      const height = primaryInp?.rhoInput !== undefined ? 62 : 38;
      const editorX = Math.max(2, Math.min(svgW - width - 4, rp.x - (width / 2)));
      return { x: rp.x, editorX, trackedNodeId: rp.trackedNodeId, inputs, width, height };
    });
  });

  readonly targetYInputLabel = computed<{
    editorX: number;
    editorY: number;
    input: EditableNodeInputs;
    width: number;
    height: number;
  } | null>(() => {
    const visuals = this.treeVisuals();
    const editable = this.editableInputs();
    if (!editable) return null;
    const targetInp = editable.find(e => e.trackedNodeId === 'Y');
    if (!targetInp) return null;

    if (visuals.rootPositions.length === 0) return null;
    const outRp = visuals.rootPositions[visuals.rootPositions.length - 1];
    
    const width = 125;
    const height = 38;
    const svgW = visuals.width;
    
    const editorX = Math.max(2, Math.min(svgW - width - 4, outRp.x - (width / 2)));
    const editorY = 405;
    
    return { editorX, editorY, input: targetInp, width, height };
  });

  readonly treeVisuals = computed(() => {
    const p = BigInt(this.prime());
    const pNum = Number(p);
    const tracked = this.trackedNodes();
    if (tracked.length < 3) {
      return { nodes: [], edges: [], titles: [], rootPositions: [], width: 400 };
    }
    const stepY = this.activePathStepY;
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

    const hasConstant = tracked.some(n => n.id === 'C');
    const outNode = hasConstant ? tracked[2] : tracked[1];
    const targetNode = hasConstant ? tracked[3] : tracked[2];

    const buildNodeSingle = (c: Rational, rho: number, tn: TrackedNode): LayoutNodeWithData => {
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
          children.push(buildNodeSingle(childCenter, childRho, tn));
        }
      }
      return {
        id: `${tn.id}_${formatDigitSequence(c, p)}_${rho}`,
        center: c, rho, isActive, activeFor, children
      };
    };

    const buildNodeCombined = (c: Rational, rho: number): LayoutNodeWithData => {
      const activeFor: string[] = [];
      if (extValuationGe(getValuation(subtract(outNode.center, c), p), -rho)) {
        activeFor.push(outNode.color);
      }
      if (extValuationGe(getValuation(subtract(targetNode.center, c), p), -rho)) {
        activeFor.push(targetNode.color);
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
          children.push(buildNodeCombined(childCenter, childRho));
        }
      }
      return {
        id: `${outNode.id}_${formatDigitSequence(c, p)}_${rho}`,
        center: c, rho, isActive, activeFor, children
      };
    };

    const baseGapVal = this.baseGap();
    const minNodeGapVal = this.minNodeGap();

    const rootCenter = simplify({ num: 0n, den: 1n });
    const rootNodeX = buildNodeSingle(rootCenter, this.rhoMax, tracked[0]);
    const spanX = computeTreeLayout(rootNodeX, baseGapVal, minNodeGapVal);

    let rootNodeC: LayoutNodeWithData | null = null;
    let spanC = 0;
    if (hasConstant) {
      const constNode = tracked.find(n => n.id === 'C')!;
      rootNodeC = buildNodeSingle(rootCenter, this.rhoMax, constNode);
      spanC = computeTreeLayout(rootNodeC, baseGapVal, minNodeGapVal);
    }

    const rootNodeCombined = buildNodeCombined(rootCenter, this.rhoMax);
    const spanCombined = computeTreeLayout(rootNodeCombined, baseGapVal, minNodeGapVal);

    const cols: { tnId: string; color: string; rootNode: LayoutNodeWithData; span: number; title: string }[] = [
      { tnId: tracked[0].id, color: tracked[0].color, rootNode: rootNodeX, span: spanX, title: tracked[0].id.toLowerCase() }
    ];
    if (hasConstant && rootNodeC) {
      const constNode = tracked.find(n => n.id === 'C')!;
      cols.push({ tnId: constNode.id, color: constNode.color, rootNode: rootNodeC, span: spanC, title: constNode.id.toLowerCase() });
    }
    cols.push({ tnId: outNode.id, color: outNode.color, rootNode: rootNodeCombined, span: spanCombined, title: outNode.id.toLowerCase() });

    const n = cols.length;

    let currentX = sideMargin;
    for (let idx = 0; idx < n; idx++) {
      const col = cols[idx];
      const colStart = currentX;
      const offset = colStart;

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

      positionNode(col.rootNode);

      const rootX = col.rootNode.x! + offset;
      rootPositions.push({ trackedNodeId: col.tnId, x: rootX });
      titles.push({ x: rootX, text: col.title, color: col.color });

      currentX += col.span + colGap;
    }

    const totalWidth = currentX - colGap + sideMargin;
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
    const getTreePrefix = (tnId: string): string => {
      if (tnId === 'Y') {
        const outNode = this.trackedNodes().find(n => n.id !== 'X' && n.id !== 'Y');
        return outNode ? outNode.id + '_' : 'Y_';
      }
      return tnId + '_';
    };
    const prefix = getTreePrefix(tn.id);
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

  onInputChange(nodeId: string, field: 'center' | 'rho', value: string) {
    this.inputChange.emit({ nodeId, field, value });
  }

  parseSubscripts(label: string): { text: string; isSub: boolean }[] {
    const parts: { text: string; isSub: boolean }[] = [];
    let current = '';
    let isSub = false;

    for (let i = 0; i < label.length; i++) {
      const char = label[i];
      if (char === '_') {
        if (current) {
          parts.push({ text: current, isSub });
          current = '';
        }
        isSub = true;
      } else if (isSub && char === '{') {
        // Skip '{'
      } else if (isSub && char === '}') {
        if (current) {
          parts.push({ text: current, isSub });
          current = '';
        }
        isSub = false;
      } else if (isSub && (char === ' ' || char === ',' || char === '(' || char === ')')) {
        if (current) {
          parts.push({ text: current, isSub });
          current = '';
        }
        isSub = false;
        current += char;
      } else {
        current += char;
      }
    }
    if (current) {
      parts.push({ text: current, isSub });
    }
    return parts;
  }

  onPrimeChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.primeChange.emit(Number(select.value));
  }
}
