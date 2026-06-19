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
  colorClass: string;
}

@Component({
  selector: 'app-landing-page',
  templateUrl: './landing-page.component.html',
  styleUrls: ['./landing-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterLink,
    MatIconModule,
    MatButtonModule,
  ],
})
export class LandingPageComponent {
  readonly activeCards: SubpageCard[] = [
    {
      title: 'Logic Explorer',
      description: 'Simulate and investigate relational linear logic rules and structural state transformations.',
      route: '/logic',
      icon: 'account_tree',
      colorClass: 'card-logic',
    },
    {
      title: 'Story Semantics Docs',
      description: 'Syntax guidelines, worked examples, and specifications for linear logic story semantics.',
      route: '/logic-docs',
      icon: 'menu_book',
      colorClass: 'card-logic-docs',
    },
    {
      title: 'Simulation & Generation Docs',
      description: 'Stochastic story generation, proportional/softmax probability modes, and plotting dynamics.',
      route: '/logic-sim-docs',
      icon: 'insights',
      colorClass: 'card-sim-docs',
    },
    {
      title: 'Advanced TypeScript Logic',
      description: 'Developer specifications, escaped values, and TS-registered logic functions.',
      route: '/logic-advanced-docs',
      icon: 'psychology',
      colorClass: 'card-advanced-docs',
    },
    {
      title: 'Berkovich Point Explorer',
      description: 'Explore the continuous optimization landscapes of non-Archimedean p-adic models in Berkovich spaces.',
      route: '/berkovich-point',
      icon: 'blur_linear',
      colorClass: 'card-berkovich',
    },
    {
      title: 'Berkovich Target Disk Explorer',
      description: 'Explore optimization landscapes learning both center and log-radius targets.',
      route: '/berkovich-disk',
      icon: 'adjust',
      colorClass: 'card-berkovich',
    },
  ];

  readonly inProgressCards: SubpageCard[] = [
    {
      title: 'Activation Explorer',
      description: 'Visualize internal weights, activation sequences, and attention distributions. (Incomplete / Work-in-Progress)',
      route: '/activations',
      icon: 'visibility',
      colorClass: 'card-activations',
    },
    {
      title: 'Sparse Autoencoders',
      description: 'Extract and analyze interpretable features from internal representations. (Incomplete / Work-in-Progress)',
      route: '/sae',
      icon: 'blur_on',
      colorClass: 'card-sae',
    },
    {
      title: 'Web Colab Notebook',
      description: 'An interactive playground for training and evaluating transformer models in real-time. (Incomplete / Work-in-Progress)',
      route: '/wcolab',
      icon: 'code',
      colorClass: 'card-colab',
    },
  ];

  // Keep for compatibility / testing
  get cards(): SubpageCard[] {
    return [...this.inProgressCards, ...this.activeCards];
  }
}
