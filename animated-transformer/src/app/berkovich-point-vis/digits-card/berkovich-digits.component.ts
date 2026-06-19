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
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MarkdownComponent } from 'ngx-markdown';

export interface DigitRowColumn {
  power: number;
  powerLabel: string;
  targetDigit: number;
  centerDigit: number;
  isResolved: boolean;
  isMatching: boolean;
}

@Component({
  selector: 'app-berkovich-digits',
  templateUrl: './berkovich-digits.component.html',
  styleUrls: ['./berkovich-digits.component.scss'],
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MarkdownComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BerkovichDigitsComponent {
  readonly digitRows = input.required<DigitRowColumn[]>();

  // Local collapse state
  readonly isCollapsed = signal<boolean>(true);

  toggleCollapse(): void {
    this.isCollapsed.update(c => !c);
  }
}
