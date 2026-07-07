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
  Rational,
  simplify,
  add,
  subtract,
  formatRational,
  getValuation,
  getAlignedDigits,
  extValuationGe
} from './berkovich';

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

export interface LayoutConfig {
  rhoMax: number;
  rhoMin: number;
  paddingY: number;
  activePathStepY: number;
  stubPathStepY: number;
}

export interface LayoutNode {
  id: string;
  center: Rational;
  rho: number;
  isActive: boolean;
  children: LayoutNode[];
  ancestors: string[];
  x?: number;
}

export function rhoToY(rho: number, config: LayoutConfig): number {
  return config.paddingY + (config.rhoMax - rho) * config.activePathStepY;
}

export function getPrefixCenter(x: Rational, rho: number, p: bigint): Rational {
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

export function getParameterXAtLevel(
  c_curr: Rational,
  k: number,
  p: bigint,
  nodes: VisualNode[],
  svgWidth: number
): number {
  const node = nodes.find(n =>
    n.logRadius === k && extValuationGe(getValuation(subtract(c_curr, n.center), p), -n.logRadius)
  );
  return node ? node.x : svgWidth / 2;
}

export function getRangeForIntegerRho(
  c_curr: Rational,
  k: number,
  p: bigint,
  visuals: { nodes: VisualNode[]; edges: VisualEdge[] },
  svgWidth: number
): { x1: number; x2: number } {
  const nodesInDisk = visuals.nodes.filter(n => {
    if (n.logRadius > k) return false;
    return extValuationGe(getValuation(subtract(n.center, c_curr), p), -k);
  });

  if (nodesInDisk.length === 0) {
    const x = getParameterXAtLevel(c_curr, k, p, visuals.nodes, svgWidth);
    return { x1: x - 15, x2: x + 15 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  for (const node of nodesInDisk) {
    if (node.x < minX) minX = node.x;
    if (node.x > maxX) maxX = node.x;
  }

  if (minX === maxX) {
    return { x1: minX - 15, x2: minX + 15 };
  }

  return { x1: minX, x2: maxX };
}

export function calculateBerkovichTreeLayout(
  c_curr: Rational,
  rho_curr: number,
  y: Rational,
  y_rho_opt: number | undefined,
  p: bigint,
  config: LayoutConfig,
  lastPositions: Map<string, { x: number; y: number }>
): { nodes: VisualNode[]; edges: VisualEdge[]; width: number } {
  const pNum = Number(p);
  const rho_target = y_rho_opt !== undefined && y_rho_opt !== null ? y_rho_opt : config.rhoMin;
  const stepY = config.activePathStepY;

  // Pass 1: Build visual tree topology recursively while tracking ancestor lists
  const buildNode = (c: Rational, rho: number, ancestors: string[]): LayoutNode => {
    const nodeId = `${formatRational(c)}_${rho}`;

    const valY = getValuation(subtract(y, c), p);
    const activeForY = valY.type === 'pos-infinity' || (valY.type === 'finite' && valY.value >= -rho);

    const valC = getValuation(subtract(c_curr, c), p);
    const activeForC = valC.type === 'pos-infinity' || (valC.type === 'finite' && valC.value >= -rho);

    const nodeActive = activeForY || activeForC;

    const children: LayoutNode[] = [];
    const nextAncestors = [...ancestors, nodeId];

    if (rho > config.rhoMin && nodeActive) {
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
      ancestors,
      children
    };
  };

  const rootCenter = simplify({ num: 0n, den: 1n });
  const rootNode = buildNode(rootCenter, config.rhoMax, []);

  // Pass 2: Layout coordinates recursively
  const bottomLeaves: LayoutNode[] = [];
  const collectBottomLeaves = (node: LayoutNode) => {
    const activeChildren = node.children.filter(c => c.isActive);
    if (node.rho === config.rhoMin || (node.isActive && activeChildren.length === 0)) {
      bottomLeaves.push(node);
    } else {
      for (const child of node.children) {
        collectBottomLeaves(child);
      }
    }
  };
  collectBottomLeaves(rootNode);

  // Find the split vertex level between parameter path (c) and target path (y)
  const valResult = getValuation(subtract(c_curr, y), p);
  const splitVal = valResult.type === 'finite' ? -valResult.value : -Infinity;
  const splitLevel = Math.ceil(splitVal);

  let paramChildId = '';
  let targetChildId = '';
  if (splitLevel <= config.rhoMax && splitLevel - 1 >= config.rhoMin) {
    const splitChildRho = splitLevel - 1;
    const paramPrefix = getPrefixCenter(c_curr, splitChildRho, p);
    const targetPrefix = getPrefixCenter(y, splitChildRho, p);
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

  const baseGap = 40;

  const clearX = (node: LayoutNode) => {
    node.x = undefined;
    for (const child of node.children) {
      clearX(child);
    }
  };

  // Pass 4: Compute X coordinates for parent nodes bottom-up (average of children)
  const computeX = (node: LayoutNode): number => {
    if (node.x !== undefined) {
      if (node.children.length > 0) {
        const mid = (node.children.length - 1) / 2;
        for (let g = 0; g < node.children.length; g++) {
          const child = node.children[g];
          if (child.x === undefined) {
            child.x = node.x! + (g - mid) * baseGap;
            computeX(child);
          }
        }
      }
      return node.x;
    }
    if (node.rho === config.rhoMin) {
      return node.x || 0;
    }

    // First, recursively compute coordinates for all active child branches
    const activeIndices: number[] = [];
    for (let g = 0; g < node.children.length; g++) {
      const child = node.children[g];
      if (child.x !== undefined || child.children.length > 0) {
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
    const computedWidth = Math.max(350, Math.round(treeSpan + 190));

    // Shift all nodes based on minX and the left margin boundary
    const shift = 95 - minX;
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
    let yCoord = config.paddingY + (config.rhoMax - node.rho) * stepY;
    if (!node.isActive && parentY !== undefined) {
      yCoord = parentY + config.stubPathStepY;
    }

    let startX: number | undefined;
    let startY: number | undefined;
    if (parentId) {
      const prevParent = lastPositions.get(parentId);
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
}
