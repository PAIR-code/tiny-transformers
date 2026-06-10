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

import { Component, signal, inject, DestroyRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-logic-layout',
  templateUrl: './logic-layout.component.html',
  styleUrls: ['./logic-layout.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
  ],
})
export class LogicLayoutComponent {
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly headerTitle = signal<string>('Logic V2 Linear Lolli Explorer');
  readonly headerIcon = signal<string>('account_tree');
  readonly logoColorClass = signal<string>('logo-explorer');

  constructor() {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      this.updateHeaderInfo();
    });

    this.updateHeaderInfo();
  }

  private updateHeaderInfo() {
    let route = this.activatedRoute;
    while (route.firstChild) {
      route = route.firstChild;
    }
    const data = route.snapshot?.data ?? {};
    this.headerTitle.set(data['title'] ?? 'Logic V2 Linear Lolli Explorer');
    this.headerIcon.set(data['icon'] ?? 'account_tree');

    const theme = data['theme'] ?? 'explorer';
    this.logoColorClass.set(theme === 'explorer' ? 'logo-explorer' : 'logo-docs');
  }
}
