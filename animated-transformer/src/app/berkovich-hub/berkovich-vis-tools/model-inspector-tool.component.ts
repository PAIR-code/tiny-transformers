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

import { Component, signal, computed, ChangeDetectionStrategy, inject, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';

import { BerkovichModelInspectorComponent } from '../berkovich-space-explorers/inspector-components/berkovich-model-inspector.component';
import { Rational, parseToRational, formatRational, formatDigitSequence, parseDigitSequence } from '../../../lib/berkovich/berkovich';
import { BerkovichCharLearnerBase, BerkovichDisk } from '../berkovich-space-explorers/models/berkovich-char-learner';
import { stringifyState, parseState } from './url-serializer';
import { BerkovichHeaderComponent } from '../berkovich-header/berkovich-header.component';

@Component({
  selector: 'app-model-inspector-tool',
  templateUrl: './model-inspector-tool.component.html',
  styleUrls: ['./model-inspector-tool.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    BerkovichModelInspectorComponent,
    BerkovichHeaderComponent
  ]
})
export class ModelInspectorToolComponent {
  readonly prime = signal<number>(5);
  readonly dim = signal<number>(2);
  readonly vocabStr = signal<string>('a,b,c');
  readonly digitsLeft = signal<number>(2);
  readonly digitsRight = signal<number>(2);

  readonly vocab = computed(() => this.vocabStr().split(',').map(s => s.trim()).filter(Boolean));
  readonly dimensions = computed(() => Array.from({ length: this.dim() }, (_, i) => i));

  constructor() {
    const router = inject(Router);
    const route = inject(ActivatedRoute);

    const initialStateStr = route.snapshot.queryParams['state'];
    if (initialStateStr) {
      const state = parseState(initialStateStr);
      if (state) {
        if (state.prime !== undefined) this.prime.set(state.prime);
        if (state.dim !== undefined) this.dim.set(state.dim);
        if (state.vocabStr !== undefined) this.vocabStr.set(state.vocabStr);
      }
    }

    effect(() => {
      const state = {
        prime: this.prime(),
        dim: this.dim(),
        vocabStr: this.vocabStr()
      };
      const stateStr = stringifyState(state);
      const currentUrlState = route.snapshot.queryParams['state'];
      if (currentUrlState !== stateStr) {
        untracked(() => {
          router.navigate([], {
            queryParams: { state: stateStr },
            queryParamsHandling: 'merge',
            replaceUrl: true
          });
        });
      }
    });
  }

  readonly mockModel = computed<BerkovichCharLearnerBase>(() => {
    const p = this.prime();
    const d = this.dim();
    const v = this.vocab();

    const E: BerkovichDisk[][] = v.map((_, i) =>
      Array.from({ length: d }, (_, j) => ({
        center: { num: BigInt(i + 1), den: 1n },
        rho: 0.5 + j * 0.2
      }))
    );

    const W: BerkovichDisk[][] = v.map((_, i) =>
      Array.from({ length: d }, (_, j) => ({
        center: { num: BigInt((i + 2) * 2), den: 1n },
        rho: 0.3 + j * 0.1
      }))
    );

    return {
      E,
      W,
      prime: p,
      vocab: v,
      embeddingDim: d
    } as any;
  });
}
