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

export const DEFAULT_BASE_GAP = 40;
export const DEFAULT_MIN_NODE_GAP = 40;

export interface LayoutNode {
  isActive: boolean;
  children: LayoutNode[];
  x?: number;
}

export function computeTreeLayout<T extends LayoutNode>(
  root: T,
  baseGap: number = DEFAULT_BASE_GAP,
  minNodeGap: number = DEFAULT_MIN_NODE_GAP
): number {
  const shiftDescendants = (n: LayoutNode, dx: number) => {
    for (const c of n.children) {
      c.x! += dx;
      shiftDescendants(c, dx);
    }
  };

  // Returns the contour [left, right] at each depth relative to node.x
  const layout = (node: T): { left: number[], right: number[] } => {
    const children = node.children;
    
    if (children.length === 0) {
      node.x = 0;
      return { left: [0], right: [0] };
    }
    
    const contours: { left: number[], right: number[] }[] = [];
    for (const child of children) {
      contours.push(layout(child as T));
    }
    
    // Position children relative to the first child
    children[0].x = 0;
    const currentLeft = [...contours[0].left];
    const currentRight = [...contours[0].right];
    
    for (let i = 1; i < children.length; i++) {
      const child = children[i];
      const contour = contours[i];
      
      // Find shift needed to avoid overlap
      let maxShift = children[i - 1].x! + baseGap;
      const depthLimit = Math.min(currentRight.length, contour.left.length);
      for (let d = 0; d < depthLimit; d++) {
        const shift = currentRight[d] - contour.left[d] + minNodeGap;
        if (shift > maxShift) {
          maxShift = shift;
        }
      }
      
      child.x = maxShift;
      shiftDescendants(child, child.x);
      
      // Update current contours
      for (let d = 0; d < contour.left.length; d++) {
        const leftCoord = contour.left[d] + child.x;
        const rightCoord = contour.right[d] + child.x;
        if (d >= currentLeft.length) {
          currentLeft.push(leftCoord);
          currentRight.push(rightCoord);
        } else {
          currentRight[d] = rightCoord;
        }
      }
    }
    
    // Parent x: align with the active children if any exist, otherwise align with center of all children.
    const activeChildren = children.filter(c => c.isActive);
    if (activeChildren.length > 0) {
      const firstX = activeChildren[0].x!;
      const lastX = activeChildren[activeChildren.length - 1].x!;
      node.x = (firstX + lastX) / 2;
    } else {
      const firstX = children[0].x!;
      const lastX = children[children.length - 1].x!;
      node.x = (firstX + lastX) / 2;
    }
    
    // Shift all children so parent is at 0
    const shiftChildren = (n: LayoutNode, dx: number) => {
      n.x! += dx;
      for (const c of n.children) {
        shiftChildren(c, dx);
      }
    };
    
    const dx = -node.x;
    for (const child of children) {
      shiftChildren(child, dx);
    }
    
    // Update contours relative to new parent 0
    const newLeft = [0];
    const newRight = [0];
    for (let d = 0; d < currentLeft.length; d++) {
      newLeft.push(currentLeft[d] + dx);
      newRight.push(currentRight[d] + dx);
    }
    
    return { left: newLeft, right: newRight };
  };
  
  layout(root);
  root.x = 0;
  
  // Find min/max bounds to center the tree
  let minX = Infinity;
  let maxX = -Infinity;
  const findBounds = (n: T) => {
    if (n.x !== undefined) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
    }
    for (const child of n.children) {
      findBounds(child as T);
    }
  };
  findBounds(root);
  
  if (minX === Infinity) {
    minX = 0;
    maxX = 0;
  }
  
  const treeSpan = maxX - minX;
  
  const shift = -minX;
  const applyShift = (n: T) => {
    n.x = n.x! + shift;
    for (const child of n.children) {
      applyShift(child as T);
    }
  };
  applyShift(root);
  
  return treeSpan;
}
