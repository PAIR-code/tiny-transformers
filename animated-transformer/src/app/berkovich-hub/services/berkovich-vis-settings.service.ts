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

import { Injectable, signal, effect } from '@angular/core';

export type VisStyle = 'tree' | 'digits';

const STORAGE_KEY = 'berkovich_vis_style';

@Injectable({
  providedIn: 'root'
})
export class BerkovichVisSettingsService {
  private readonly _visStyle = signal<VisStyle>(this.loadInitialVisStyle());

  readonly visStyle = this._visStyle.asReadonly();

  constructor() {
    effect(() => {
      const style = this._visStyle();
      try {
        localStorage.setItem(STORAGE_KEY, style);
      } catch (e) {
        // ignore localStorage errors
      }
    });
  }

  setVisStyle(style: VisStyle) {
    if (style === 'tree' || style === 'digits') {
      this._visStyle.set(style);
    }
  }

  private loadInitialVisStyle(): VisStyle {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'tree' || stored === 'digits') {
        return stored;
      }
    } catch (e) {
      // fallback
    }
    return 'tree';
  }
}
