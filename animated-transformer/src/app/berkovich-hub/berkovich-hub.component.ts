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

interface SubpageCard {
  title: string;
  description: string;
  route: string;
  icon: string;
}

export interface CardGroup {
  title: string;
  subtitle: string;
  badge: string;
  icon: string;
  themeClass: string;
  cards: SubpageCard[];
}

@Component({
  selector: 'app-berkovich-hub',
  templateUrl: './berkovich-hub.component.html',
  styleUrls: ['./berkovich-hub.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterLink,
    MatIconModule,
    MatButtonModule,
  ],
})
export class BerkovichHubComponent {
  readonly cardGroups: CardGroup[] = [
    {
      title: 'Basic Gradient Visualizations',
      subtitle: 'Core non-Archimedean SGD optimization landscapes and tree gradient descent steps',
      badge: 'Basic Gradients',
      icon: 'insights',
      themeClass: 'group-gradients',
      cards: [
        {
          title: 'Point SGD Explorer',
          description: 'Explore continuous optimization landscapes of p-adic models in Berkovich spaces.',
          route: '/berkovich/point',
          icon: 'blur_linear',
        },
        {
          title: 'Target Disk Explorer',
          description: 'Explore optimization landscapes learning both center and log-radius targets.',
          route: '/berkovich/disk',
          icon: 'adjust',
        },
        {
          title: 'Unary Op Gradients',
          description: 'Visualize backward pass and gradient flow through unary operations (shift, scale, and squaring).',
          route: '/berkovich/unary-gradients',
          icon: 'looks_one',
        },
        {
          title: 'Binary Op Gradients',
          description: 'Visualize backward pass and gradient flow through binary operations (addition, multiplication, and softmax).',
          route: '/berkovich/operator-gradients',
          icon: 'call_split',
        },
      ]
    },
    {
      title: 'Applications',
      subtitle: 'Machine learning applications using learned Berkovich embeddings and affinoid domain constraints',
      badge: 'ML Applications',
      icon: 'auto_awesome',
      themeClass: 'group-apps',
      cards: [
        {
          title: 'Shakespeare Predictor',
          description: 'Train a character-level model on Shakespeare in the browser with learned Berkovich embeddings.',
          route: '/berkovich/shakespeare',
          icon: 'explore',
        },
        {
          title: 'MNIST Digit Classifier',
          description: 'Classify 28x28 handwritten digits in Berkovich spaces using affinoid domain constraints.',
          route: '/berkovich/mnist',
          icon: 'grid_on',
        },
        {
          title: 'Boolean & DNF Explorer',
          description: 'Learn arbitrary boolean functions (XOR, AND, OR, Parity) using DNF Affinoid Domain pools.',
          route: '/berkovich/boolean',
          icon: 'alt_route',
        },
        {
          title: '16-Circuit Multilinear Explorer',
          description: 'Explore all 16 two-variable Boolean circuits using multilinear formulation f(x₁, x₂) = b + w₁x₁ + w₂x₂ + w₃x₁x₂ in Berkovich space.',
          route: '/berkovich/bool2',
          icon: 'account_tree',
        },
      ]
    },
    {
      title: 'Encoding, Reference & Vis Tools',
      subtitle: 'Binary search tree encodings, interactive component playgrounds, and notation reference',
      badge: 'Tools & Reference',
      icon: 'build_circle',
      themeClass: 'group-tools',
      cards: [
        {
          title: '2-adic Binary Search Encoding',
          description: 'Encode bounded real values in [0, 1] into Berkovich tree points using interval halving binary search.',
          route: '/berkovich/encoding',
          icon: 'sync_alt',
        },
        {
          title: 'Notation Glossary',
          description: 'Reference guide for mathematical definitions, symbols, and non-Archimedean terminology.',
          route: '/berkovich/glossary',
          icon: 'menu_book',
        },
        {
          title: 'Berkovich Vis Tools',
          description: 'Play with standalone visualization components and custom parameters interactively.',
          route: '/vis-tools',
          icon: 'construction',
        },
      ]
    }
  ];
}
