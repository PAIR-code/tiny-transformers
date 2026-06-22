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
import { Rational, formatDigitSequence } from '../../../../lib/berkovich/berkovich';

@Component({
  selector: 'app-berkovich-calculus',
  templateUrl: './berkovich-calculus.component.html',
  styleUrls: ['./berkovich-calculus.component.scss'],
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MarkdownComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BerkovichCalculusComponent {
  readonly gradientBreakdown = input.required<any>();
  readonly learningRate = input.required<number>();

  // Local collapse state
  readonly isCollapsed = signal<boolean>(true);

  toggleCollapse(): void {
    this.isCollapsed.update(c => !c);
  }

  readonly prime = input.required<number>();

  formatDigitSequence(r: Rational): string {
    return formatDigitSequence(r, BigInt(this.prime()));
  }
}
