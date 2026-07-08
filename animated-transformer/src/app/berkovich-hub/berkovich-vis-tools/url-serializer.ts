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

/**
 * Serializes an object to a URL-encoded JSON string, handling BigInt values safely.
 */
export function stringifyState(state: any): string {
  try {
    const json = JSON.stringify(state, (key, value) => {
      if (typeof value === 'bigint') {
        return { _type: 'bigint', value: value.toString() };
      }
      return value;
    });
    return encodeURIComponent(json);
  } catch (e) {
    console.error('Failed to stringify state:', e);
    return '';
  }
}

/**
 * Deserializes an object from a URL-encoded JSON string, reviving BigInt values.
 */
export function parseState(str: string | null | undefined): any {
  if (!str) return null;
  try {
    const decoded = decodeURIComponent(str);
    return JSON.parse(decoded, (key, value) => {
      if (value && typeof value === 'object' && value._type === 'bigint') {
        return BigInt(value.value);
      }
      return value;
    });
  } catch (e) {
    console.error('Failed to parse state:', e);
    return null;
  }
}
