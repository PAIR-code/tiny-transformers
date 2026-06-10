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

import { Component, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-berkovich-config',
  templateUrl: './berkovich-config.component.html',
  styleUrls: ['./berkovich-config.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BerkovichConfigComponent {
  // Inputs
  readonly prime = input.required<number>();
  readonly targetInput = input.required<string>();
  readonly targetDigitsInput = input.required<string>();
  readonly displayCenter = input.required<string>();
  readonly displayCenterDigits = input.required<string>();
  readonly displayLogRadius = input.required<string>();
  readonly learningRateInput = input.required<string>();
  readonly isPlaying = input.required<boolean>();
  readonly stepCount = input.required<number>();

  // Outputs
  readonly primeChange = output<number>();
  readonly targetInputChange = output<string>();
  readonly targetDigitsInputChange = output<string>();
  readonly centerInputChange = output<string>();
  readonly centerDigitsInputChange = output<string>();
  readonly logRadiusInputChange = output<string>();
  readonly learningRateInputChange = output<string>();

  readonly targetBlur = output<void>();
  readonly targetDigitsBlur = output<void>();
  readonly centerBlur = output<void>();
  readonly centerDigitsBlur = output<void>();
  readonly logRadiusBlur = output<void>();
  readonly learningRateBlur = output<void>();

  readonly togglePlay = output<void>();
  readonly step = output<void>();
  readonly undo = output<void>();
  readonly reset = output<void>();
  readonly randomizeCenterAndTarget = output<void>();

  // Local state
  readonly isConfigCollapsed = signal<boolean>(true);

  toggleConfigCollapse(): void {
    this.isConfigCollapsed.update(c => !c);
  }
}
