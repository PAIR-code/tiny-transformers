export interface LayoutNode {
  isActive: boolean;
  children: LayoutNode[];
  x?: number;
}

export function computeTreeLayout<T extends LayoutNode>(
  root: T,
  baseGap: number = 40,
  minNodeGap: number = 40
): number {
  // Returns the contour [left, right] at each depth relative to node.x
  const layout = (node: T): { left: number[], right: number[] } => {
    const activeChildren = node.children.filter(c => c.isActive);
    
    if (activeChildren.length === 0) {
      node.x = 0;
      // Inactive stubs are spaced later
      return { left: [0], right: [0] };
    }
    
    const contours: { left: number[], right: number[] }[] = [];
    
    for (const child of activeChildren) {
      contours.push(layout(child as T));
    }
    
    // Position children relative to the first child
    activeChildren[0].x = 0;
    const currentLeft = [...contours[0].left];
    const currentRight = [...contours[0].right];
    
    for (let i = 1; i < activeChildren.length; i++) {
      const child = activeChildren[i];
      const contour = contours[i];
      
      // Find shift needed to avoid overlap
      let maxShift = baseGap;
      const depthLimit = Math.min(currentRight.length, contour.left.length);
      for (let d = 0; d < depthLimit; d++) {
        const shift = currentRight[d] - contour.left[d] + minNodeGap;
        if (shift > maxShift) {
          maxShift = shift;
        }
      }
      
      child.x = activeChildren[i - 1].x! + maxShift;
      
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
    
    // Parent x is the average of first and last active child
    const firstX = activeChildren[0].x!;
    const lastX = activeChildren[activeChildren.length - 1].x!;
    node.x = (firstX + lastX) / 2;
    
    // Shift all children so parent is at 0
    const shiftChildren = (n: LayoutNode, dx: number) => {
      n.x! += dx;
      for (const c of n.children) {
        if (c.isActive) shiftChildren(c, dx);
      }
    };
    
    const dx = -node.x;
    for (const child of activeChildren) {
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
  
  // Interpolate inactive stubs
  const interpolateStubs = (node: T) => {
    const activeIndices: number[] = [];
    for (let i = 0; i < node.children.length; i++) {
      if (node.children[i].isActive) {
        activeIndices.push(i);
        interpolateStubs(node.children[i] as T);
      }
    }
    
    if (activeIndices.length > 0) {
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (!child.isActive) {
          // Find left and right active siblings
          let leftIdx = -1;
          let rightIdx = -1;
          for (const a of activeIndices) {
            if (a < i) leftIdx = a;
            if (a > i && rightIdx === -1) rightIdx = a;
          }
          
          if (leftIdx !== -1 && rightIdx !== -1) {
            const leftChild = node.children[leftIdx];
            const rightChild = node.children[rightIdx];
            const t = (i - leftIdx) / (rightIdx - leftIdx);
            child.x = leftChild.x! + t * (rightChild.x! - leftChild.x!);
          } else if (leftIdx !== -1) {
            child.x = node.children[leftIdx].x! + (i - leftIdx) * (baseGap * 0.9);
          } else if (rightIdx !== -1) {
            child.x = node.children[rightIdx].x! - (rightIdx - i) * (baseGap * 0.9);
          }
        }
      }
    } else {
      // No active children, just spread stubs around 0
      const mid = (node.children.length - 1) / 2;
      for (let i = 0; i < node.children.length; i++) {
        node.children[i].x = (i - mid) * (baseGap * 0.8);
      }
    }
  };
  
  interpolateStubs(root);
  
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
