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
  readonly cards: SubpageCard[] = [
    {
      title: 'Web Colab Notebook',
      description: 'An interactive playground for training and evaluating transformer models in real-time.',
      route: '/wcolab',
      icon: 'code',
      colorClass: 'card-colab',
    },
    {
      title: 'Activation Explorer',
      description: 'Visualize internal weights, activation sequences, and attention distributions.',
      route: '/activations',
      icon: 'visibility',
      colorClass: 'card-activations',
    },
    {
      title: 'Sparse Autoencoders',
      description: 'Extract and analyze interpretable features from internal representations.',
      route: '/sae',
      icon: 'blur_on',
      colorClass: 'card-sae',
    },
    {
      title: 'Logic Explorer',
      description: 'Simulate and investigate relational linear logic rules and structural state transformations.',
      route: '/logic',
      icon: 'account_tree',
      colorClass: 'card-logic',
    },
    {
      title: 'Logic Reference Docs',
      description: 'Syntax guidelines, examples, and detailed specifications for relational linear logic.',
      route: '/logic-docs',
      icon: 'description',
      colorClass: 'card-logic-docs',
    },
    {
      title: 'Advanced Logic Specs',
      description: 'Developer specifications, complex constructs, and logic interpreter deep-dives.',
      route: '/logic-advanced-docs',
      icon: 'auto_stories',
      colorClass: 'card-advanced-docs',
    },
  ];
}
