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
import { BrowserModule } from '@angular/platform-browser';

// import { AppRoutingModule } from './app-routing.module';
// import { RouterModule } from '@angular/router';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AppRoutingModule } from './app-routing.module';
import { MatSidenavModule } from '@angular/material/sidenav';

// import { ActivationVisModule } from './activation-vis/activation-vis.module';
// import { AnimatedTransformerModule } from './animated-transformer/animated-transformer.module';
// import { LandingPageComponent } from './landing-page/landing-page.component';
// import { ErrorPageComponent } from './error-page/error-page.component';
// import { D3LineChartModule } from './d3-line-chart/d3-line-chart.module';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    AppRoutingModule,
    MatSidenavModule,
    // ---
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatListModule,
    FormsModule,
    // ---
    // ActivationVisModule,
    // AnimatedTransformerModule,
    // D3LineChartModule,
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
