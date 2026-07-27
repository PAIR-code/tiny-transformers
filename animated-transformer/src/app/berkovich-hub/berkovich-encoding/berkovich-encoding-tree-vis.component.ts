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
  ElementRef,
  ViewChild,
  input,
  effect,
  ChangeDetectionStrategy,
  untracked
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';
import { BinarySearchStep } from './berkovich-encoding.component';
import { simplify, formatRational } from '../../../lib/berkovich/berkovich';

export interface EncodingTreeNode {
  id: string;
  depth: number;
  index: number;
  centerVal: number;
  num: bigint;
  den: bigint;
  lower: number;
  upper: number;
  bit: number | null;
  pathBits: number[];
  x: number;
  y: number;
  isActive: boolean;
  isLeaf: boolean;
}

export interface EncodingTreeEdge {
  id: string;
  source: EncodingTreeNode;
  target: EncodingTreeNode;
  isActive: boolean;
  bit: number;
  stepIndex: number;
}

@Component({
  selector: 'app-berkovich-encoding-tree-vis',
  imports: [CommonModule],
  template: `
    <div class="tree-vis-card">
      <div class="card-header">
        <h3>2-adic Tree Traversal Map & 1D Sub-Interval Halving</h3>
      </div>

      <p class="description">
        Visualizing the 2-adic tree starting from the <strong>rightmost digit</strong> (right of the decimal point) and stepping leftwards. With precision K = {{ depth() }}, there are {{ totalDigits() }} digit levels going down aligned directly with the 1D interval halving bar.
      </p>

      <div class="svg-container" #svgContainer>
        <svg #svgRef class="tree-svg"></svg>
      </div>
    </div>
  `,
  styles: [`
    .tree-vis-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;

      h3 {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 600;
        color: #0f172a;
      }
    }

    .description {
      color: #475569;
      font-size: 0.88rem;
      line-height: 1.5;
      margin: 0;
    }

    .svg-container {
      width: 100%;
      overflow-x: auto;
      display: flex;
      justify-content: center;

      .tree-svg {
        width: 100%;
        max-width: 770px;
        height: 385px;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BerkovichEncodingTreeVisComponent {
  steps = input.required<BinarySearchStep[]>();
  targetValue = input.required<number>();
  biasedValue = input<number | undefined>(undefined);
  depth = input.required<number>();
  useRhoNormalization = input<boolean>(false);
  padicRho = input<number>(0);

  @ViewChild('svgRef', { static: true }) svgRef!: ElementRef<SVGSVGElement>;

  constructor() {
    effect(() => {
      const stepsList = this.steps();
      const targetVal = this.targetValue();
      const biasedVal = this.biasedValue() ?? targetVal;
      const useRhoNorm = this.useRhoNormalization();
      const rhoVal = this.padicRho();
      const depthVal = this.depth();

      const maxDepth = Math.min(depthVal * 2, 4);

      untracked(() => {
        this.renderD3Tree(stepsList, targetVal, biasedVal, useRhoNorm, rhoVal, maxDepth);
      });
    });
  }

  totalDigits(): number {
    return this.depth() * 2;
  }

  activeInterval() {
    const s = this.steps();
    if (!s || s.length === 0) return { lower: 0, upper: 1, mid: 0.5 };
    const last = s[s.length - 1];
    return { lower: last.lower, upper: last.upper, mid: last.midpoint };
  }

  certaintyInterval(m: number): { lower: number; upper: number; mid: number } {
    const s = this.steps();
    if (!s || s.length === 0 || m <= 0) {
      return { lower: 0, upper: 1, mid: 0.5 };
    }
    const N = s.length;
    if (m >= N) {
      const last = s[N - 1];
      return { lower: last.lower, upper: last.upper, mid: last.midpoint };
    }
    const k = Math.min(Math.floor(m), N - 1);
    if (k === 0) {
      return { lower: 0, upper: 1, mid: 0.5 };
    }
    const step = s[k - 1];
    return { lower: step.lower, upper: step.upper, mid: step.midpoint };
  }

  activePathString(): string {
    const s = this.steps();
    if (!s || s.length === 0) return 'root';
    const K = this.depth();
    // Label digit bits starting from rightmost (b_{-K})
    return (
      'root → ' +
      s
        .map((item, idx) => {
          const digitIdx = idx < K ? `-${K - idx}` : `${idx - K}`;
          return `b_${digitIdx}=${item.bit}`;
        })
        .join(' → ')
    );
  }

  private renderD3Tree(
    steps: BinarySearchStep[],
    targetVal: number,
    biasedVal: number,
    useRhoNorm: boolean,
    rhoVal: number,
    maxDepth: number
  ) {
    if (!this.svgRef || typeof window === 'undefined') return;

    const svgElement = d3.select(this.svgRef.nativeElement);
    svgElement.selectAll('*').remove();

    const width = 770;
    const height = 385;
    const margin = { top: 35, right: 65, bottom: 40, left: 65 };

    svgElement.attr('viewBox', `0 0 ${width} ${height}`);

    const xMin = margin.left;
    const xMax = width - margin.right;
    const xSpan = xMax - xMin;

    const xVal = (v: number) => xMin + v * xSpan;
    const treeHeight = 200;

    const nodes: EncodingTreeNode[] = [];
    const edges: EncodingTreeEdge[] = [];
    const nodeMap = new Map<string, EncodingTreeNode>();

    const activeBits = steps.map((s) => s.bit);
    const K = this.depth();

    const createNodes = (
      d: number,
      idx: number,
      lower: number,
      upper: number,
      num: bigint,
      den: bigint,
      bit: number | null,
      pathBits: number[]
    ): EncodingTreeNode => {
      const id = `d${d}_i${idx}`;
      const centerVal = (lower + upper) / 2;

      let isActive = true;
      for (let k = 0; k < d; k++) {
        if (k >= activeBits.length || pathBits[k] !== activeBits[k]) {
          isActive = false;
          break;
        }
      }

      const x = xMin + ((idx + 0.5) / Math.pow(2, d)) * xSpan;
      const y = margin.top + (d / maxDepth) * treeHeight;

      const node: EncodingTreeNode = {
        id,
        depth: d,
        index: idx,
        centerVal,
        num,
        den,
        lower,
        upper,
        bit,
        pathBits,
        x,
        y,
        isActive,
        isLeaf: d === maxDepth
      };

      nodes.push(node);
      nodeMap.set(id, node);

      if (d < maxDepth) {
        const nextDen = den * 2n;
        // Left child (bit 0)
        const leftChild = createNodes(
          d + 1,
          idx * 2,
          lower,
          centerVal,
          num * 2n - 1n,
          nextDen,
          0,
          [...pathBits, 0]
        );
        edges.push({
          id: `e_${id}_to_${leftChild.id}`,
          source: node,
          target: leftChild,
          isActive: isActive && d < activeBits.length && activeBits[d] === 0,
          bit: 0,
          stepIndex: d
        });

        // Right child (bit 1)
        const rightChild = createNodes(
          d + 1,
          idx * 2 + 1,
          centerVal,
          upper,
          num * 2n + 1n,
          nextDen,
          1,
          [...pathBits, 1]
        );
        edges.push({
          id: `e_${id}_to_${rightChild.id}`,
          source: node,
          target: rightChild,
          isActive: isActive && d < activeBits.length && activeBits[d] === 1,
          bit: 1,
          stepIndex: d
        });
      }

      return node;
    };

    createNodes(0, 0, 0, 1, 1n, 2n, null, []);

    const g = svgElement.append('g');

    // Tooltip container at top layer
    const tooltipGroup = svgElement
      .append('g')
      .attr('class', 'tree-tooltip')
      .attr('opacity', 0)
      .attr('pointer-events', 'none');

    const tooltipBg = tooltipGroup
      .append('rect')
      .attr('fill', '#0f172a')
      .attr('rx', 6)
      .attr('ry', 6)
      .attr('opacity', 0.92);

    const tooltipTextRat = tooltipGroup
      .append('text')
      .attr('fill', '#38bdf8')
      .attr('font-size', '11px')
      .attr('font-family', 'monospace')
      .attr('font-weight', 'bold')
      .attr('text-anchor', 'middle');

    const tooltipTextBounds = tooltipGroup
      .append('text')
      .attr('fill', '#94a3b8')
      .attr('font-size', '10px')
      .attr('font-family', 'sans-serif')
      .attr('text-anchor', 'middle');

    // Level labels on left side showing digit indices b_{-K} ... b_{K-1}
    for (let d = 0; d <= maxDepth; d++) {
      const y = margin.top + (d / maxDepth) * treeHeight;
      let label = 'root';
      if (d > 0) {
        const digitIdx = d <= K ? `-${K - d + 1}` : `${d - K - 1}`;
        label = `k=${d} (b_${digitIdx})`;
      }
      g.append('text')
        .attr('x', 5)
        .attr('y', y + 4)
        .attr('font-size', '10px')
        .attr('font-weight', '600')
        .attr('fill', '#64748b')
        .text(label);
    }

    // Render tree edges
    g.selectAll('.tree-edge')
      .data(edges)
      .enter()
      .append('line')
      .attr('class', 'tree-edge')
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y)
      .attr('stroke', (d) => (d.isActive ? '#2563eb' : '#cbd5e1'))
      .attr('stroke-width', (d) => (d.isActive ? 2.5 : 1.2))
      .attr('stroke-dasharray', (d) => (d.isActive ? 'none' : '3 3'))
      .attr('opacity', (d) => (d.isActive ? 1.0 : 0.4));

    // Render edge bit labels
    g.selectAll('.edge-label')
      .data(edges)
      .enter()
      .append('text')
      .attr('x', (d) => (d.source.x + d.target.x) / 2 + (d.bit === 1 ? 8 : -8))
      .attr('y', (d) => (d.source.y + d.target.y) / 2)
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .attr('font-family', 'monospace')
      .attr('text-anchor', 'middle')
      .attr('fill', (d) => (d.isActive ? '#1d4ed8' : '#64748b'))
      .text((d) => `${d.bit}`);

    // Render tree nodes
    const nodeGroups = g
      .selectAll('.tree-node')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'tree-node')
      .attr('transform', (d) => `translate(${d.x}, ${d.y})`)
      .style('cursor', 'pointer');

    // Accessibility SVG title
    nodeGroups.append('title').text((d) => {
      const ratStr = formatRational(simplify({ num: d.num, den: d.den }));
      return `Center: ${ratStr} (${d.centerVal.toFixed(4)})\nInterval: [${d.lower.toFixed(4)}, ${d.upper.toFixed(4)}]`;
    });

    // Node circles (r = 4.5, smooth transition on hover)
    const nodeCircles = nodeGroups
      .append('circle')
      .attr('r', 4.5)
      .attr('fill', (d) => (d.isActive ? '#2563eb' : '#ffffff'))
      .attr('stroke', (d) => (d.isActive ? '#1d4ed8' : '#94a3b8'))
      .attr('stroke-width', 1.5);

    // Interactive Hover / Tap Pop-up Tooltip Handler
    nodeGroups
      .on('mouseenter click', function (event, d) {
        event.stopPropagation();
        d3.select(this).select('circle').transition().duration(150).attr('r', 7);

        const ratStr = formatRational(simplify({ num: d.num, den: d.den }));
        tooltipTextRat.text(`Center: ${ratStr} (${d.centerVal.toFixed(4)})`);
        tooltipTextBounds.text(`Interval: [${d.lower.toFixed(4)}, ${d.upper.toFixed(4)}]`);

        const tY = d.y < 50 ? d.y + 36 : d.y - 32;
        tooltipGroup.attr('transform', `translate(${d.x}, ${tY})`);
        tooltipTextRat.attr('y', -4);
        tooltipTextBounds.attr('y', 10);

        const boxWidth = Math.max(140, ratStr.length * 10 + 90);
        tooltipBg
          .attr('x', -boxWidth / 2)
          .attr('y', -20)
          .attr('width', boxWidth)
          .attr('height', 38);

        tooltipGroup.transition().duration(150).attr('opacity', 1);
      })
      .on('mouseleave', function () {
        d3.select(this).select('circle').transition().duration(150).attr('r', 4.5);
        tooltipGroup.transition().duration(150).attr('opacity', 0);
      });

    // Leaf binary string labels under bottom leaf nodes
    nodeGroups
      .filter((d) => d.isLeaf)
      .append('text')
      .attr('y', 22)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('font-family', 'monospace')
      .attr('font-weight', (d) => (d.isActive ? 'bold' : 'normal'))
      .attr('fill', (d) => (d.isActive ? '#2563eb' : '#94a3b8'))
      .text((d) => {
        const digitStr = [...d.pathBits].reverse().join('');
        return `${digitStr}₂`;
      });

    const barY = 295;
    const barHeight = 20;

    // -------------------------------------------------------------------
    // Rho Cutoff Line and Grey Overlay on Tree
    // -------------------------------------------------------------------
    const N = this.depth() * 2;
    const m = Math.max(0, Math.min(N, N - rhoVal));
    const rDepth = m / N;
    const yRho = margin.top + rDepth * treeHeight;

    if (useRhoNorm) {
      const overlayHeight = Math.max(0, barY - yRho - 14);
      if (overlayHeight > 0) {
        g.append('rect')
          .attr('class', 'rho-grey-overlay')
          .attr('x', xMin - 4)
          .attr('y', yRho)
          .attr('width', xSpan + 8)
          .attr('height', overlayHeight)
          .attr('fill', '#475569')
          .attr('opacity', 0.18)
          .attr('rx', 4)
          .attr('pointer-events', 'none');
      }

      g.append('line')
        .attr('class', 'rho-cutoff-line')
        .attr('x1', xMin - 4)
        .attr('y1', yRho)
        .attr('x2', xMax + 4)
        .attr('y2', yRho)
        .attr('stroke', '#64748b')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '4 4');

      g.append('text')
        .attr('x', xMax + 8)
        .attr('y', yRho + 4)
        .attr('text-anchor', 'start')
        .attr('font-size', '10px')
        .attr('font-weight', 'bold')
        .attr('fill', '#64748b')
        .text(`ρ = ${rhoVal.toFixed(1)}`);
    }

    // -------------------------------------------------------------------
    // Integrated 1D Sub-Interval Halving Bar ([0, 1]) directly under leaves
    // -------------------------------------------------------------------
    const numLineGroup = g.append('g').attr('class', 'integrated-number-line');

    // Full [0, 1] bar background
    numLineGroup
      .append('rect')
      .attr('x', xMin)
      .attr('y', barY)
      .attr('width', xSpan)
      .attr('height', barHeight)
      .attr('fill', '#e2e8f0')
      .attr('rx', 4);

    // End Ticks & Labels
    const ticks = [
      { val: 0.0, label: '0.0', anchor: 'start' },
      { val: 0.5, label: '0.5', anchor: 'middle' },
      { val: 1.0, label: '1.0', anchor: 'end' }
    ];
    ticks.forEach((t) => {
      const tx = xVal(t.val);
      numLineGroup
        .append('text')
        .attr('x', tx)
        .attr('y', barY + barHeight + 16)
        .attr('text-anchor', t.anchor)
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .attr('fill', '#64748b')
        .text(t.label);
    });

    // Certainty Sub-interval highlight
    const interval = useRhoNorm ? this.certaintyInterval(m) : this.activeInterval();
    if (interval) {
      const iLeft = xVal(interval.lower);
      const iWidth = (interval.upper - interval.lower) * xSpan;
      numLineGroup
        .append('rect')
        .attr('x', iLeft)
        .attr('y', barY)
        .attr('width', iWidth)
        .attr('height', barHeight)
        .attr('fill', '#3b82f6')
        .attr('opacity', 0.35)
        .attr('rx', 4);

      // Midpoint line
      const midX = xVal(interval.mid);
      numLineGroup
        .append('line')
        .attr('x1', midX)
        .attr('y1', barY - 8)
        .attr('x2', midX)
        .attr('y2', barY + barHeight + 8)
        .attr('stroke', '#2563eb')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '3 3');
    }

    // Target Pin (x_biased blue when rho is enabled, red x when disabled)
    const activePinVal = useRhoNorm ? biasedVal : targetVal;
    const targetX = xVal(activePinVal);
    const pinGroup = numLineGroup.append('g').attr('transform', `translate(${targetX}, ${barY})`);
    const primaryColor = useRhoNorm ? '#2563eb' : '#ef4444';

    pinGroup
      .append('line')
      .attr('x1', 0)
      .attr('y1', -6)
      .attr('x2', 0)
      .attr('y2', barHeight + 18)
      .attr('stroke', primaryColor)
      .attr('stroke-width', 2);

    pinGroup
      .append('circle')
      .attr('cx', 0)
      .attr('cy', barHeight / 2)
      .attr('r', 5)
      .attr('fill', primaryColor)
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1.5);

    pinGroup
      .append('text')
      .attr('x', 0)
      .attr('y', barHeight + 30)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('font-weight', 'bold')
      .attr('fill', primaryColor)
      .text(useRhoNorm ? `x_biased = ${activePinVal.toFixed(4)}` : `x = ${activePinVal.toFixed(4)}`);

    // Red Dashed Ghost Pin for exact target x when rho is enabled and shifted
    if (useRhoNorm && Math.abs(activePinVal - targetVal) > 0.005) {
      const exactX = xVal(targetVal);
      const ghostGroup = numLineGroup.append('g').attr('transform', `translate(${exactX}, ${barY})`);

      ghostGroup
        .append('line')
        .attr('x1', 0)
        .attr('y1', -6)
        .attr('x2', 0)
        .attr('y2', barHeight + 18)
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '2 2');

      ghostGroup
        .append('circle')
        .attr('cx', 0)
        .attr('cy', barHeight / 2)
        .attr('r', 4)
        .attr('fill', '#ef4444')
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 1);

      ghostGroup
        .append('text')
        .attr('x', 0)
        .attr('y', barHeight + 44)
        .attr('text-anchor', 'middle')
        .attr('font-size', '10px')
        .attr('font-weight', '600')
        .attr('fill', '#ef4444')
        .text(`x_exact = ${targetVal.toFixed(4)}`);
    }
  }
}
