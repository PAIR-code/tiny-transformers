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

import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';

@Component({
  selector: 'app-berkovich-header',
  templateUrl: './berkovich-header.component.html',
  styleUrls: ['./berkovich-header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
  ]
})
export class BerkovichHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly isVisTool = input<boolean>(false);
  readonly backRoute = input<string | undefined>(undefined);

  readonly effectiveBackRoute = computed(() => {
    const route = this.backRoute();
    if (route) return route;
    return this.isVisTool() ? '/berkovich/vis-tools' : '/berkovich';
  });
}
