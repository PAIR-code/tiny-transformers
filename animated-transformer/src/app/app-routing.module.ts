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

import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ActivationVisComponent } from './activation-vis/activation-vis.component';
// import { AnimatedTransformerComponent } from './animated-transformer/animated-transformer.component';
import { SAEComponent } from 'src/app/sae/sae.component';
// import { LandingPageComponent } from 'src/app/landing-page/landing-page.component';
import { ErrorPageComponent } from './error-page/error-page.component';
import { WebColabComponent } from 'src/app/web-colab/web-colab.component';

const routes: Routes = [
  { path: '', component: WebColabComponent, pathMatch: 'full' },
  { path: 'wcolab', component: WebColabComponent, pathMatch: 'full' },
  { path: 'activations', component: ActivationVisComponent },
  // { path: 'transformers', component: AnimatedTransformerComponent },
  // { path: 'wcolab', component: WebColabComponent },
  { path: 'settings', component: WebColabComponent, pathMatch: 'full' },
  { path: 'sae', component: SAEComponent },
  { path: '**', component: ErrorPageComponent, pathMatch: 'full' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: true })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
