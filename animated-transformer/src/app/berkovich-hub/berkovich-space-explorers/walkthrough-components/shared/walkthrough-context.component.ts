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

import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-walkthrough-context',
  imports: [CommonModule, MatIconModule],
  template: `
    <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 20px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 8px;">
      <!-- Worked Example Context Display -->
      <div style="display: flex; align-items: center; font-size: 11px; font-family: sans-serif; font-weight: normal; color: #475569; background: #ffffff; border: 1px solid #cbd5e1; padding: 4px 10px; border-radius: 20px; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);">
        <span style="color: #64748b; margin-right: 6px; font-weight: 600;">Worked Example Context (N={{ contextLength() }}):</span>
        <span class="context-col" style="font-family: monospace; font-weight: 700; color: #0f172a; font-size: 11.5px; display: flex; align-items: center;">
          <span class="pre-context" style="color: #94a3b8; font-weight: normal;">{{ preText() }}</span>{{ contextText() }}
        </span>
      </div>
      
      <!-- Input to edit the active context directly -->
      <div style="display: flex; align-items: center; gap: 6px;">
        <label [attr.for]="inputId()" style="font-size: 11px; font-weight: 600; color: #64748b; font-family: sans-serif;">Edit:</label>
        <input [id]="inputId()" type="text" [value]="walkthroughInput()" (input)="onInputChange($any($event.target).value)" 
          placeholder="e.g. cat" style="width: 140px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; font-family: monospace;" />
      </div>

      <!-- Validation Error Message inline -->
      @if (walkthroughInputError()) {
        <div style="color: #ef4444; font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 4px;">
          <mat-icon style="font-size: 14px; height: 14px; width: 14px; color: #ef4444;">error</mat-icon>
          <span [textContent]="walkthroughInputError()"></span>
        </div>
      }
    </div>
  `,
  styles: [`
    .context-col {
      white-space: pre;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WalkthroughContextComponent {
  inputId = input<string>('walkthrough-input-field');
  contextLength = input.required<number>();
  preText = input<string>('');
  contextText = input<string>('');
  walkthroughInput = input<string>('');
  walkthroughInputError = input<string | null>(null);

  inputChanged = output<string>();

  onInputChange(val: string) {
    this.inputChanged.emit(val);
  }
}
