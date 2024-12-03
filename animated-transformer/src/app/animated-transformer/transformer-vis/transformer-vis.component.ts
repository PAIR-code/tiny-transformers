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

import {
  AfterViewInit,
  ElementRef,
  Component,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import * as d3 from 'd3';

@Component({
  selector: 'app-transformer-vis',
  templateUrl: './transformer-vis.component.html',
  styleUrls: ['./transformer-vis.component.scss'],
})
export class TransformerVisComponent implements OnChanges, OnInit, AfterViewInit {
  @Input() tensorData!: string;

  tensorJson!: { [key: string]: number[][] | number[][][] };

  // ----------------------------------------------------------------------------------------------
  constructor() {}

  draw(): void {
    // console.log('parsed tensor data: ');
    // console.log(this.tensorJson);
    this.drawLabArrows(this.tensorJson['AttentionHead1_v'] as number[][]);
  }

  drawLabArrows(mat: number[][]) {
    // either use CIELAB directly here, or make last two values two different divering colors
    // multiplication intuition is similar colors

    // first two values are x/y, next are color
    // find max
    // console.log({ mat })
    const extentXY = d3.extent(mat, (arr) => {
      const first = arr[0] * arr[0];
      const second = arr[1] * arr[1];
      return Math.sqrt(first + second);
    }) as [number, number];
    const extentAB = d3.extent(mat, (arr) => {
      const first = arr[2] * arr[2];
      const second = arr[3] * arr[3];
      return Math.sqrt(first + second);
    }) as [number, number];
    const maxA = d3.max(mat, (arr) => Math.abs(arr[2])) as number;
    const maxB = d3.max(mat, (arr) => Math.abs(arr[3])) as number;
    // console.log({ maxA, maxB })

    const scaleXY = d3.scaleLinear([30, 50]).domain(extentXY);
    const scaleAB = d3.scaleLinear([30, 50]).domain(extentAB);
    const scaleA = d3.scaleLinear([-100, 100]).domain([maxA * -1, maxA]);
    const scaleB = d3.scaleLinear([-100, 100]).domain([maxB * -1, maxB]);
  }

  ngOnChanges(changes: SimpleChanges) {
    for (const propName in changes) {
      const chng = changes[propName];
      if (propName === 'tensorData' && !!chng.currentValue) {
        this.tensorJson = JSON.parse(chng.currentValue);
        this.draw();
      }
    }
  }

  ngOnInit() {}

  ngAfterViewInit() {}
}
