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
import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';

import { provideMarkdown, KATEX_OPTIONS, MarkedKatexOptions } from 'ngx-markdown';

import { provideRouter, Routes, withComponentInputBinding, withHashLocation } from '@angular/router';

// import { RouterLink, RouterModule, RouterOutlet } from '@angular/router';
import { ActivationVisComponent } from './activation-vis/activation-vis.component';
// import { AnimatedTransformerComponent } from './animated-transformer/animated-transformer.component';
import { SAEComponent } from 'src/app/sae/sae.component';
import { LandingPageComponent } from 'src/app/landing-page/landing-page.component';
import { ErrorPageComponent } from './error-page/error-page.component';
import { WebColabComponent } from 'src/app/web-colab/web-colab.component';
import { LogicExplorerComponent } from './logic-explorer/logic-explorer.component';
import { LogicDocsComponent } from './logic-explorer/logic-docs.component';
import { LogicAdvancedDocsComponent } from './logic-explorer/logic-advanced-docs.component';
import { LogicSimDocsComponent } from './logic-explorer/logic-sim-docs.component';
import { provideHttpClient } from '@angular/common/http';
import { BerkovichVisComponent } from './berkovich-vis/berkovich-vis.component';

import { LogicLayoutComponent } from './logic-explorer/logic-layout.component';

export const routes: Routes = [
  { path: '', component: LandingPageComponent, pathMatch: 'full' },
  { path: 'wcolab', component: WebColabComponent, pathMatch: 'full' },
  { path: 'activations', component: ActivationVisComponent },
  { path: 'sae', component: SAEComponent },
  {
    path: '',
    component: LogicLayoutComponent,
    children: [
      {
        path: 'logic',
        component: LogicExplorerComponent,
        data: { title: 'Logic V2 Linear Lolli Explorer', icon: 'account_tree', theme: 'explorer' }
      },
      {
        path: 'logic-docs',
        component: LogicDocsComponent,
        data: { title: 'Introduction to Linear Logic Story Semantics', icon: 'menu_book', theme: 'docs' }
      },
      {
        path: 'logic-sim-docs',
        component: LogicSimDocsComponent,
        data: { title: 'Simulation & Generation Semantics', icon: 'insights', theme: 'docs' }
      },
      {
        path: 'logic-advanced-docs',
        component: LogicAdvancedDocsComponent,
        data: { title: 'Advanced: Semantic Extensions in TypeScript', icon: 'psychology', theme: 'docs' }
      },
    ]
  },
  { path: 'berkovich', component: BerkovichVisComponent },
  { path: '**', component: ErrorPageComponent, pathMatch: 'full' },
];


// @NgModule({
//   imports: [RouterModule.forRoot(routes, { useHash: true }), RouterLink, RouterOutlet],
//   exports: [RouterModule],
// })
// export class AppRoutingModule {}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding(), withHashLocation()),
    provideMarkdown(),
    {
      provide: KATEX_OPTIONS,
      useValue: {
        // Cast is needed because 'nonStandard' is missing from ngx-markdown's MarkedKatexOptions typings.
        // We need 'nonStandard: true' to support inline math without surrounding spaces (e.g. '($\rho$)').
        nonStandard: true
      } as MarkedKatexOptions & { nonStandard?: boolean }
    },
    provideHttpClient(),
  ],
};

// export const testConfig: ApplicationConfig = {
//   providers: [
//     provideRouter(routes, withComponentInputBinding()),
//     provideAnimationsAsync('noop'),
//     provideMarkdown(),
//   ],
// };
