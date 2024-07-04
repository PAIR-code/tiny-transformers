/* Copyright 2023 Google LLC. All Rights Reserved.

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

// --------------------------------------------------------------------------
/* Tubes for JSON objects.
Based on: http://strictlypositive.org/Holes.pdf

A "Tube" represents a location in a tree structure of some kind of data.
The strutcure has up-pointers to the parent, this can be used to take the

"Tube" to different locations in the tree.

This is an implementation for the "JSON"-fragment of JavaScript values, and
it is used to support some slightly formatting of JSON (very pretty printing).
---------------------------------------------------------------------------- */
import { quote } from '../pretty_json/json';

// ----------------------------------------------------------------------------
// Abstract Tube type has a parent.
export abstract class AbsTube {
  // The path up...
  public parent:
    | null
    | { idx: number; node: Tube }
    | { key: string; node: Tube } = null;

  accessorString(): string {
    if (this.parent === null) {
      return '';
    } else if ('idx' in this.parent) {
      return this.parent.node.accessorString() + `[${this.parent.idx}]`;
    } else {
      return this.parent.node.accessorString() + '.' + this.parent.key;
    }
  }

  abstract totalStrLen(): number;
}

// A Tube can be a Leaf, Array, or Object.
export type Tube = LeafTube | ArrTube | ObjTube;

export class LeafTube extends AbsTube {
  public str: string;

  constructor(public value: string | number | boolean | null) {
    super();
    if (typeof value !== 'string') {
      this.str = String(value);
    } else {
      this.str = quote(String(value));
    }
  }

  totalStrLen(): number {
    return this.str.length;
  }
}

const OBJ_WRAP = '{}';
const OBJ_WRAP_LEN = OBJ_WRAP.length;

const KEY_OBJ_SEP = ': ';
const KEY_OBJ_SEP_LEN = KEY_OBJ_SEP.length;

const OBJ_KEYVAL_SEP = ', ';
const OBJ_KEYVAL_SEP_LEN = OBJ_KEYVAL_SEP.length;

const ARR_VALUE_SEP = ', ';
const ARR_VALUE_SEP_LEN = ARR_VALUE_SEP.length;

const ARR_WRAP = '[]';
const ARR_WRAP_LEN = ARR_WRAP.length;

export class ObjTube extends AbsTube {
  public maxKeyLen = 0;
  public maxValueLen = 0;
  public maxItemLen = 0;
  public totalLen = OBJ_WRAP_LEN;
  public obj: { [key: string]: Tube } = {};
  public nKeys = 0;

  addKeyChild(key: string, c: Tube): void {
    c.parent = { key, node: this };
    const cLen = c.totalStrLen();
    if (this.nKeys >= 1) {
      this.totalLen += OBJ_KEYVAL_SEP_LEN;
    }
    const keyLen = quote(key).length;
    const itemLen = keyLen + KEY_OBJ_SEP_LEN + cLen;
    this.totalLen += itemLen;

    if (itemLen > this.maxItemLen) {
      this.maxItemLen = itemLen;
    }
    if (keyLen > this.maxKeyLen) {
      this.maxKeyLen = keyLen;
    }
    if (cLen > this.maxValueLen) {
      this.maxValueLen = cLen;
    }
    this.nKeys++;
    this.obj[key] = c;
  }

  totalStrLen(): number {
    return this.totalLen;
  }
}

export class ArrTube extends AbsTube {
  // Length of largest item.
  public maxItemLen = 0;
  // Total string length if we put it on one line.
  public totalLen = ARR_WRAP_LEN;
  // True when some child is not leaf.
  public hasCompoundChild = false;
  // The elements in this array.
  public arr: Tube[] = [];

  addArrChild(c: Tube): void {
    c.parent = { idx: this.arr.length, node: this };
    if (!isLeaf(c)) {
      this.hasCompoundChild = true;
    }
    const cLen = c.totalStrLen();
    if (this.arr.length >= 1) {
      this.totalLen += ARR_VALUE_SEP_LEN + cLen;
    } else {
      this.totalLen += cLen;
    }
    if (cLen > this.maxItemLen) {
      this.maxItemLen = cLen;
    }
    this.arr.push(c);
  }

  totalStrLen(): number {
    return this.totalLen;
  }
}

// TODO: make these assert the type correctly.
function isLeaf(t: AbsTube): t is LeafTube {
  return t instanceof LeafTube;
}
function isObj(t: AbsTube): t is ObjTube {
  return t instanceof ObjTube;
}
function isArr(t: AbsTube): t is ArrTube {
  return t instanceof ArrTube;
}

export interface StringifyConfig {
  curIndent: string;
  arrWrapAt: number;
  objWrapAt: number;
  sortObjKeys: boolean;
  // | ((a: string, b: string) => number);  // default = true;
  // commasForLastArrayEntry: boolean;
  // commasForLastObjEntry: boolean;
  // ---
  // listNewline?: boolean;  // default is undefined = false;
  // listSepNewline?: boolean;  // default is undefined = false;
  // listWrapMaxLen?: number;  // default is undefined = no wrap;
  // objNewline?: boolean;
  // objWrapMaxLen?: boolean;
  // sortCmp?: (a: [string, JSONValue], b: [string, JSONValue]) => number;
}

export function stringifyOneLine(config: StringifyConfig, t: Tube): string {
  if (isLeaf(t)) {
    return t.str;
  } else if (isArr(t)) {
    return `[${t.arr.map((c) => stringifyOneLine(config, c)).join(', ')}]`;
  } else {
    let keys = Object.keys(t.obj);
    if (config.sortObjKeys) {
      keys = keys.sort();
    }
    return (
      '{' +
      keys
        .map((k) => `${k}: ${stringifyOneLine(config, t.obj[k])}`)
        .join(', ') +
      '}'
    );
  }
}

function maxLineStrWidth(s: string): {
  maxLineWidth: number;
  firstLineWidth: number;
  lastLineWidth: number;
  nLines: number;
} {
  const lines = s.split('\n');
  return {
    maxLineWidth: lines.reduce(
      (maxWidth, l) => (l.length > maxWidth ? l.length : maxWidth),
      0
    ),
    firstLineWidth: lines[0].length,
    lastLineWidth: lines[lines.length - 1].length,
    nLines: lines.length,
  };
}

// ----------------------------------------------------------------------------
// Note: Caller is responsible for the adding the indent to the returned string.
export function stringifyTube(config: StringifyConfig, t: Tube): string {
  if (isLeaf(t)) {
    return t.str;
  } else if (isArr(t)) {
    // fits on one line...
    if (t.totalStrLen() + config.curIndent.length < config.arrWrapAt) {
      return stringifyOneLine(config, t);
    } else if (t.hasCompoundChild) {
      // Break the child nodes onto separate lines
      const subConfig = { ...config };
      subConfig.curIndent += '  ';
      const joinStr = ',\n' + subConfig.curIndent;
      // IDEA: know the pre-string, to help define line break for first item
      // in list.
      return `[ ${t.arr
        .map((c) => stringifyTube(subConfig, c))
        .join(joinStr)} ]`;
    } else {
      if (t.arr.length === 0) {
        return stringifyOneLine(config, t);
      }
      let curLine = '[ ';
      let curStr = '';
      // All items are atomic values, lets write them out and wrap them...
      t.arr.forEach((c, i) => {
        const s = stringifyOneLine(config, c);
        if (
          curLine.length > 2 &&
          config.curIndent.length +
            curLine.length +
            s.length +
            ARR_VALUE_SEP_LEN >=
            config.arrWrapAt
        ) {
          curStr += curLine + ',\n';
          curLine = config.curIndent + '  ' + s;
          // Wrap this item onto a new line.
        } else {
          // add this time to the current line.
          if (i > 0) {
            curLine += ', ' + s;
          } else {
            curLine += s;
          }
        }
      });
      if (curLine.length + 2 < config.arrWrapAt) {
        curStr += curLine + ' ]';
      } else {
        curStr += curLine + '\n' + config.curIndent + ']';
      }

      return curStr;
      // Atomic child greater than wrap, we have no choice but to put it on
      // one line...
      // return stringifyOneLine(config, t);
    }
  } else {
    if (t.totalStrLen() + config.curIndent.length < config.objWrapAt) {
      return stringifyOneLine(config, t);
    } else {
      let keys = Object.keys(t.obj);
      if (config.sortObjKeys) {
        keys = keys.sort();
      }
      const subConfig = { ...config };
      subConfig.curIndent += '  ';
      let joinStr = ',\n' + subConfig.curIndent;
      const innerStr = keys
        .map((k) => `${k}: ${stringifyTube(subConfig, t.obj[k])}`)
        .join(joinStr);
      // TODO:
      let prefix = '{ ';
      const postfix = ' }';
      const { maxLineWidth, firstLineWidth, lastLineWidth, nLines } =
        maxLineStrWidth(innerStr);

      // Ideas for smarter positioning...
      // (maxLineWidth > config.objWrapAt ||
      //   (firstLineWidth + prefix.length) > config.objWrapAt ||
      //   (lastLineWidth + postfix.length) > config.objWrapAt)

      if (t.parent) {
        prefix += '\n' + subConfig.curIndent;
      }
      return prefix + innerStr + postfix;
    }
  }
}
