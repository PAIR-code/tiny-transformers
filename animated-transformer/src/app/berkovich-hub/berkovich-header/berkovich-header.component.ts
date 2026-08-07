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

import { Component, ChangeDetectionStrategy, input, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MarkdownComponent } from 'ngx-markdown';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs/operators';
import { BerkovichVisSettingsService, VisStyle } from '../services/berkovich-vis-settings.service';

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
    MarkdownComponent,
  ]
})
export class BerkovichHeaderComponent {
  private readonly visSettingsService = inject(BerkovichVisSettingsService);
  private readonly router = inject(Router);

  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly isVisTool = input<boolean>(false);
  readonly backRoute = input<string | undefined>(undefined);

  readonly visStyle = this.visSettingsService.visStyle;

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => e.urlAfterRedirects || e.url)
    ),
    { initialValue: this.router.url }
  );

  readonly isAppsActive = computed(() => {
    const url = this.currentUrl();
    return (
      url.includes('/berkovich/mnist') ||
      url.includes('/berkovich/shakespeare') ||
      url.includes('/berkovich/boolean') ||
      url.includes('/berkovich/bool2')
    );
  });

  readonly isGradientsActive = computed(() => {
    const url = this.currentUrl();
    return (
      url.includes('/berkovich/point') ||
      url.includes('/berkovich/disk') ||
      url.includes('/berkovich/unary-gradients') ||
      url.includes('/berkovich/operator-gradients')
    );
  });

  setVisStyle(style: VisStyle) {
    this.visSettingsService.setVisStyle(style);
  }

  readonly effectiveBackRoute = computed(() => {
    const route = this.backRoute();
    if (route) return route;
    return this.isVisTool() ? '/vis-tools' : '/berkovich';
  });
}
