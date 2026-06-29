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
  readonly activeCards: SubpageCard[] = [
    {
      title: 'Berkovich Point Explorer',
      description: 'Explore the continuous optimization landscapes of non-Archimedean p-adic models in Berkovich spaces.',
      route: '/berkovich/point',
      icon: 'blur_linear',
      colorClass: 'card-berkovich',
    },
    {
      title: 'Berkovich Target Disk Explorer',
      description: 'Explore optimization landscapes learning both center and log-radius targets.',
      route: '/berkovich/disk',
      icon: 'adjust',
      colorClass: 'card-berkovich',
    },
    {
      title: 'Shakespeare next-character predictor',
      description: 'Train a character-level model on Shakespeare in the browser, using learned Berkovich embeddings and affinoid constraints.',
      route: '/berkovich/space-explorers',
      icon: 'explore',
      colorClass: 'card-berkovich',
    },
    {
      title: 'Berkovich Operator Gradients',
      description: 'Visualize backward pass and gradient flow through binary operations (addition, multiplication, and softmax).',
      route: '/berkovich/operator-gradients',
      icon: 'call_split',
      colorClass: 'card-berkovich-operator',
    },
    {
      title: 'Berkovich Unary Gradients',
      description: 'Visualize backward pass and gradient flow through unary operations (shift, scale, and squaring).',
      route: '/berkovich/unary-gradients',
      icon: 'looks_one',
      colorClass: 'card-berkovich-unary',
    },
    {
      title: 'Notation Glossary',
      description: 'Reference guide for mathematical definitions, symbols, and non-Archimedean terminology.',
      route: '/berkovich/glossary',
      icon: 'menu_book',
      colorClass: 'card-berkovich-glossary',
    },
  ];
}
