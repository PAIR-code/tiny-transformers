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

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

interface VisToolCard {
  title: string;
  description: string;
  route: string;
  icon: string;
  colorClass: string;
}

@Component({
  selector: 'app-berkovich-vis-tools-hub',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    MatIconModule,
    MatButtonModule,
  ],
  template: `
    <div class="landing-container">
      <!-- Header Banner -->
      <header class="landing-header">
        <div class="header-content">
          <button mat-icon-button routerLink="/berkovich" class="back-btn" aria-label="Go back to hub">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <div>
            <h1>Berkovich Visualization Sandbox</h1>
            <p class="subtitle">
              Play with individual p-adic and Berkovich space visualizers with customized inputs and configurations.
            </p>
          </div>
        </div>
        <nav class="header-nav">
          <a routerLink="/berkovich/point" routerLinkActive="active-nav">Point SGD</a>
          <a routerLink="/berkovich/disk" routerLinkActive="active-nav">Disk SGD</a>
          <a routerLink="/berkovich/unary-gradients" routerLinkActive="active-nav">Unary Op Gradients</a>
          <a routerLink="/berkovich/operator-gradients" routerLinkActive="active-nav">Binary Op Gradients</a>
          <a routerLink="/berkovich/space-explorers" routerLinkActive="active-nav">Shakespeare Predictor</a>
          <a routerLink="/berkovich/glossary" routerLinkActive="active-nav">Glossary</a>
          <a routerLink="/berkovich/vis-tools" routerLinkActive="active-nav" [routerLinkActiveOptions]="{ exact: true }">Vis Tools</a>
        </nav>
      </header>

      <main class="landing-main">
        <section class="section-group">
          <div class="cards-grid">
            @for (card of tools; track card.route) {
              <div class="card" [class]="card.colorClass" [routerLink]="card.route">
                <div class="card-glow"></div>
                <div class="card-content">
                  <div class="card-icon-container">
                    <mat-icon class="card-icon">{{ card.icon }}</mat-icon>
                  </div>
                  <h3>{{ card.title }}</h3>
                  <p>{{ card.description }}</p>
                  <div class="card-actions">
                    <span class="explore-btn">
                      Open Sandbox
                      <mat-icon>arrow_forward</mat-icon>
                    </span>
                  </div>
                </div>
              </div>
            }
          </div>
        </section>
      </main>
    </div>
  `,
  styleUrls: ['../berkovich-hub.component.scss']
})
export class BerkovichVisToolsHubComponent {
  readonly tools: VisToolCard[] = [
    {
      title: 'Single Digit Display',
      description: 'Render the p-adic expansion of a rational number inside a bounded valuation range, complete with uncertainty shading.',
      route: '/berkovich/vis-tools/digit-display',
      icon: 'looks_one',
      colorClass: 'card-berkovich-unary',
    },
    {
      title: 'Dual Digit Display',
      description: 'Compare and align two p-adic expansions, showing the lowest common ancestor branching and matching digit ranges.',
      route: '/berkovich/vis-tools/dual-digit-display',
      icon: 'looks_two',
      colorClass: 'card-berkovich-operator',
    },
    {
      title: 'Berkovich Tree Vis',
      description: 'Visualize p-adic paths, distance valuations, branching structures, and SGD trajectories on a dynamic SVG tree.',
      route: '/berkovich/vis-tools/tree-vis',
      icon: 'account_tree',
      colorClass: 'card-berkovich',
    },
    {
      title: 'Operator Tree Vis',
      description: 'View multiple parallel p-adic trees representing addition, multiplication, or softmax operations on Berkovich disks.',
      route: '/berkovich/vis-tools/operator-tree-vis',
      icon: 'call_split',
      colorClass: 'card-berkovich-operator',
    },
    {
      title: 'Character Parameters Grid',
      description: 'View a complete vocabulary map of character embeddings (E) and target class representations (W) as p-adic digit boxes.',
      route: '/berkovich/vis-tools/model-inspector',
      icon: 'grid_on',
      colorClass: 'card-berkovich-glossary',
    },
    {
      title: 'Matrix & Addition Parameters Grid',
      description: 'Inspect weights (M) and biases (B) of p-adic linear transformations and matrix multiplications.',
      route: '/berkovich/vis-tools/padic-linear-model-inspector',
      icon: 'widgets',
      colorClass: 'card-berkovich',
    }
  ];
}
