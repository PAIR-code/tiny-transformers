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
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { BerkovichHeaderComponent } from '../berkovich-header/berkovich-header.component';

interface VisToolCard {
  title: string;
  description: string;
  route: string;
  icon: string;
  colorClass: string;
}

@Component({
  selector: 'app-berkovich-vis-tools-hub',
  templateUrl: './berkovich-vis-tools-hub.component.html',
  styleUrls: ['./berkovich-vis-tools-hub.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterLink,
    MatIconModule,
    MatButtonModule,
    BerkovichHeaderComponent,
  ]
})
export class BerkovichVisToolsHubComponent {
  readonly tools: VisToolCard[] = [
    {
      title: 'Single Digit Display',
      description: 'Render the p-adic expansion of a rational number inside a bounded valuation range, complete with uncertainty shading.',
      route: '/vis-tools/digit-display',
      icon: 'looks_one',
      colorClass: 'card-berkovich-unary',
    },
    {
      title: 'Dual Digit Display',
      description: 'Compare and align two p-adic expansions, showing the lowest common ancestor branching and matching digit ranges.',
      route: '/vis-tools/dual-digit-display',
      icon: 'looks_two',
      colorClass: 'card-berkovich-operator',
    },
    {
      title: 'Berkovich Tree Vis',
      description: 'Visualize p-adic paths, distance valuations, branching structures, and SGD trajectories on a dynamic SVG tree.',
      route: '/vis-tools/tree-vis',
      icon: 'account_tree',
      colorClass: 'card-berkovich',
    },
    {
      title: 'Operator Tree Vis',
      description: 'View multiple parallel p-adic trees representing addition, multiplication, or softmax operations on Berkovich disks.',
      route: '/vis-tools/operator-tree-vis',
      icon: 'call_split',
      colorClass: 'card-berkovich-operator',
    },
    {
      title: 'Character Parameters Grid',
      description: 'View a complete vocabulary map of character embeddings (E) and target class representations (W) as p-adic digit boxes.',
      route: '/vis-tools/model-inspector',
      icon: 'grid_on',
      colorClass: 'card-berkovich-glossary',
    },
    {
      title: 'Matrix & Addition Parameters Grid',
      description: 'Inspect weights (M) and biases (B) of p-adic linear transformations and matrix multiplications.',
      route: '/vis-tools/padic-linear-model-inspector',
      icon: 'widgets',
      colorClass: 'card-berkovich',
    }
  ];
}
