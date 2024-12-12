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
import * as tf from '@tensorflow/tfjs';
import * as gtensor from '../../lib/gtensor/gtensor';
import * as gtensor_util from '../../lib/gtensor/gtensor_util';
import { pointWiseEval } from '../../lib/gtensor/boolfns';
import { CommonModule } from '@angular/common';

// Make a visualization tensor for a set of params given a set of inputs,
// with extra points to show value changes/gradients added according to
// resolution parameter.
export function mkVisTensor(
  // resolution = number of separations to show between points.
  resolution: number,
  params: gtensor.GTensor<'pointId' | 'outputRepSize'>,
  positions: gtensor.GTensor<'pointId' | 'inputRepSize'>
): gtensor.GTensor<'x' | 'y' | 'rgb'> {
  // Create grid
  const examplesGrid = new gtensor.GTensor(
    tf.tensor(gtensor_util.grid([0, 0], [1, 1], [1 / resolution, 1 / resolution])),
    ['example', 'inputRepSize']
  );
  const gridSize = Math.sqrt(examplesGrid.dim.example.size);

  const outValues = pointWiseEval(params, positions, examplesGrid);

  // pointWiseEval(params, positions,
  //   examplesGrid);

  const rgbM = new gtensor.GTensor(tf.ones([params.dim.outputRepSize.size, 3]), [
    'outputRepSize',
    'rgb',
  ]);
  return outValues
    .contract(rgbM, ['outputRepSize'])
    .splitDim('example', { x: gridSize, y: gridSize });
}

@Component({
  selector: 'app-tensor-image',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tensor-image.component.html',
  styleUrls: ['./tensor-image.component.scss'],
})
export class TensorImageComponent implements OnInit, AfterViewInit {
  @Input() seenWidth!: number;
  @Input() seenHeight!: number;
  @ViewChild('canvas', { static: false })
  canvasRef!: ElementRef<HTMLCanvasElement>;
  rawCanvas: HTMLCanvasElement;
  // rawCtxt!: CanvasRenderingContext2D;

  rawTensor!: gtensor.GTensor<'x' | 'y' | 'rgb'>;
  seenCanvas!: HTMLCanvasElement;
  // seenCtxt!: CanvasRenderingContext2D;

  constructor() {
    this.rawCanvas = document.createElement('canvas');
  }

  ngOnInit(): void {}

  @Input() set tensor(rawTensor: gtensor.GTensor<'x' | 'y' | 'rgb'>) {
    this.rawTensor = rawTensor;
    this.rawCanvasFromTensor(rawTensor);
  }

  ngAfterViewInit(): void {
    // const dims = Object.values(this.rawTensor.dim);
    // if (dims.length !== 3) {
    //   throw Error('tensor must have 3 dimensions');
    // }
    // if (dims[2].size !== 3) {
    //   throw Error('third dimension of tensor must be size 3');
    // }
    // this.rawTensor = this.rawTensor.withNewNames(['x', 'y', 'rgb']);

    this.seenCanvas = this.canvasRef.nativeElement;
    this.seenCanvas.width = this.seenWidth;
    this.seenCanvas.height = this.seenHeight;
  }

  public async rawCanvasFromTensor(rawTensor: gtensor.GTensor<'x' | 'y' | 'rgb'>) {
    // Condition this because the setting will re-create and blank the canvas.
    if (
      this.rawCanvas.width !== rawTensor.dim.x.size ||
      this.rawCanvas.height !== rawTensor.dim.y.size
    ) {
      this.rawCanvas.width = rawTensor.dim.x.size;
      this.rawCanvas.height = rawTensor.dim.y.size;
    }
    const rawCtxt = this.rawCanvas.getContext('2d')!;
    rawCtxt.imageSmoothingEnabled = false;

    // console.log(`rawTensor.tensor ${this.rawCanvas.width}x${this.rawCanvas.height}`);
    // this.rawTensor.tensor.print();
    let pixelsA: Uint8ClampedArray;
    try {
      pixelsA = await tf.browser.toPixels(this.rawTensor.tensor as tf.Tensor3D);
    } catch (e) {
      console.warn(e);
      return;
    }
    const imageData = rawCtxt.createImageData(this.rawCanvas.width, this.rawCanvas.height);
    imageData.data.set(pixelsA);
    rawCtxt.putImageData(imageData, 0, 0);
    this.process();
  }

  public async reset() {
    const seenCtxt = this.seenCanvas.getContext('2d')!;
    // seenCtxt.drawImage(this.rawCanvas, 0, 0, this.seenCanvas.width, this.seenCanvas.height);
    this.zoom(this.seenCanvas.width / this.rawCanvas.width);
  }

  public async process() {
    const seenCtxt = this.seenCanvas.getContext('2d')!;
    seenCtxt.imageSmoothingEnabled = false;
    seenCtxt.drawImage(this.rawCanvas, 0, 0, this.seenCanvas.width, this.seenCanvas.height);
    // this.zoom(this.seenCanvas.width / this.rawCanvas.width);
  }

  zoom(factor: number) {
    const rawCtxt = this.rawCanvas.getContext('2d')!;
    const seenCtxt = this.seenCanvas.getContext('2d')!;
    const width = this.rawCanvas.width;
    const height = this.rawCanvas.height;

    const data = rawCtxt.getImageData(0, 0, width, height).data;
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        var i = (y * width + x) * 4; // 4 for the 4 rgba values.
        var r = data[i];
        var g = data[i + 1];
        var b = data[i + 2];
        var a = data[i + 3];
        seenCtxt.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + a / 255 + ')';
        seenCtxt.fillRect(x * factor, y * factor, factor, factor);
      }
    }
  }
}
