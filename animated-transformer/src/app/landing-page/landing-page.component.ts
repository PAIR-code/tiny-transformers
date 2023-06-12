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


import { FooterRowOutlet } from '@angular/cdk/table';
import { Component, OnInit } from '@angular/core';
import { NamedChartPoint } from '../d3-line-chart/d3-line-chart.component';

@Component({
  selector: 'app-landing-page',
  templateUrl: './landing-page.component.html',
  styleUrls: ['./landing-page.component.scss']
})
export class LandingPageComponent implements OnInit {

  // <app-d3-line-chart [data]="accPoints"></app-d3-line-chart>

  // lossPoints: NamedChartPoint[] = [
  //   // { x: 1, y: 2, name: 'a', },
  //   // { x: 2, y: 3, name: 'a', },
  //   // { x: 3, y: 1, name: 'a', },
  //   // { x: 1, y: 3, name: 'b', },
  //   // { x: 2, y: 2, name: 'b', },
  //   // { x: 3, y: 3, name: 'b', },
  // ];
  // accPoints: NamedChartPoint[] = [
  //   // { x: 1, y: 3, name: 'b', },
  //   // { x: 2, y: 2, name: 'b', },
  //   // { x: 3, y: 3, name: 'b', },
  //   // { x: 4, y: 5, name: 'b', },
  // ];

  constructor() { }

  ngOnInit(): void {
    // this.asyncAddPoints(20);
  }

  // asyncAddPoints(n: number): void {
  //   if (n === 9) { return; }

  //   setTimeout(() => {
  //     this.accPoints.push({ x: this.accPoints.length, y: Math.random() * 10, name: 'b' });
  //     this.asyncAddPoints(n - 1);
  //   }, 500);
  //   // console.log(this.accPoints);
  //   this.accPoints = [...this.accPoints];
  // }

}
