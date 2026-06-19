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
=============================================================================*/

import { Component, input, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MarkdownComponent } from 'ngx-markdown';

@Component({
  selector: 'app-berkovich-explainer',
  template: `
    <div class="explainer-container">
      <button mat-icon-button class="info-btn" (click)="togglePopup($event)" aria-label="Show explanation">
        <mat-icon>help_outline</mat-icon>
      </button>
      
      @if (isOpen()) {
        <div class="explainer-popup" [class.popup-up]="popupDirection() === 'up'" [class.popup-down]="popupDirection() === 'down'" (click)="$event.stopPropagation()">
          <div class="popup-header">
            <h3>{{ title() }}</h3>
            <button mat-icon-button class="close-btn" (click)="closePopup()">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="popup-content">
            <markdown [katex]="true" [data]="content()"></markdown>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .explainer-container {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .info-btn {
      width: 20px;
      height: 20px;
      line-height: 20px;
      padding: 0;
      min-width: 20px;
      color: #64748b;
      
      &:hover {
        color: #0f766e;
      }
      ::ng-deep .mat-mdc-button-touch-target {
        display: none;
      }
      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
    }
    .explainer-popup {
      position: absolute;
      right: 0;
      width: 300px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      z-index: 10000;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;

      &.popup-up {
        bottom: 24px;
      }
      &.popup-down {
        top: 24px;
      }
    }
    .popup-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #f1f5f9;
      padding-bottom: 4px;
      h3 {
        margin: 0;
        font-size: 12px;
        font-weight: 700;
        color: #0f172a;
      }
      .close-btn {
        width: 18px;
        height: 18px;
        line-height: 18px;
        padding: 0;
        min-width: 18px;
        color: #94a3b8;
        mat-icon {
          font-size: 12px;
          width: 12px;
          height: 12px;
        }
      }
    }
    .popup-content {
      font-size: 11px;
      line-height: 1.4;
      color: #334155;
      max-height: 180px;
      overflow-y: auto;
    }
  `],
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MarkdownComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BerkovichExplainerComponent {
  readonly title = input<string>('Explanation');
  readonly content = input.required<string>();
  readonly popupDirection = input<'up' | 'down'>('up');

  readonly isOpen = signal<boolean>(false);

  togglePopup(event: MouseEvent): void {
    event.stopPropagation();
    this.isOpen.update(o => !o);
    if (this.isOpen()) {
      // Close on clicking anywhere else on page
      const handler = () => {
        this.closePopup();
        document.removeEventListener('click', handler);
      };
      setTimeout(() => {
        document.addEventListener('click', handler);
      }, 0);
    }
  }

  closePopup(): void {
    this.isOpen.set(false);
  }
}
