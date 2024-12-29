/* Copyright 2023 Google LLC. All Rights Reserved.

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
import { ApplicationConfig, provideExperimentalZonelessChangeDetection } from '@angular/core';

import { provideMarkdown } from 'ngx-markdown';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

import { provideRouter, Routes, withComponentInputBinding } from '@angular/router';

// import { RouterLink, RouterModule, RouterOutlet } from '@angular/router';
import { ActivationVisComponent } from './activation-vis/activation-vis.component';
// import { AnimatedTransformerComponent } from './animated-transformer/animated-transformer.component';
import { SAEComponent } from 'src/app/sae/sae.component';
// import { LandingPageComponent } from 'src/app/landing-page/landing-page.component';
import { ErrorPageComponent } from './error-page/error-page.component';
import { WebColabComponent } from 'src/app/web-colab/web-colab.component';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

export const routes: Routes = [
  { path: '', component: WebColabComponent, pathMatch: 'full' },
  { path: 'wcolab', component: WebColabComponent, pathMatch: 'full' },
  { path: 'activations', component: ActivationVisComponent },
  { path: 'sae', component: SAEComponent },
  { path: '**', component: ErrorPageComponent, pathMatch: 'full' },
];

// @NgModule({
//   imports: [RouterModule.forRoot(routes, { useHash: true }), RouterLink, RouterOutlet],
//   exports: [RouterModule],
// })
// export class AppRoutingModule {}

export const appConfig: ApplicationConfig = {
  providers: [
    provideExperimentalZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    provideAnimationsAsync(),
    provideMarkdown(),
  ],
};

// export const testConfig: ApplicationConfig = {
//   providers: [
//     provideRouter(routes, withComponentInputBinding()),
//     provideNoopAnimations(),
//     provideMarkdown(),
//   ],
// };
