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

import {
  Component,
  input,
  output,
  ChangeDetectionStrategy,
  ViewChild,
  ElementRef,
  AfterViewInit,
  effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CANONICAL_MNIST_SAMPLES } from './models/mnist-data';

@Component({
  selector: 'app-mnist-canvas',
  imports: [CommonModule, MatButtonModule, MatIconModule],
  template: `
    <div class="mnist-canvas-container">
      <div class="canvas-wrapper">
        <canvas
          #canvasRef
          width="280"
          height="280"
          class="mnist-canvas"
          (mousedown)="startDrawing($event)"
          (mousemove)="draw($event)"
          (mouseup)="stopDrawing()"
          (mouseleave)="stopDrawing()"
          (touchstart)="startDrawingTouch($event)"
          (touchmove)="drawTouch($event)"
          (touchend)="stopDrawing()"
          aria-label="Handwritten 28x28 digit canvas. Click and drag to draw."
        ></canvas>
      </div>

      <div class="preset-toolbar">
        <div class="toolbar-label">Quick Digit Presets:</div>
        <div class="digit-buttons">
          @for (d of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; track d) {
            <button
              mat-stroked-button
              type="button"
              class="digit-btn"
              [class.selected]="selectedDigit() === d"
              (click)="loadPreset(d)"
            >
              {{ d }}
            </button>
          }
        </div>

        <div class="action-buttons">
          <button mat-button type="button" (click)="clearCanvas()">
            <mat-icon>delete_outline</mat-icon>
            <span>Clear</span>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .mnist-canvas-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 16px;
      background: #f8fafc;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
    }

    .canvas-wrapper {
      position: relative;
      border: 2px solid #cbd5e1;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
      cursor: crosshair;
      background: #000000;
    }

    .mnist-canvas {
      display: block;
      image-rendering: pixelated;
    }

    .preset-toolbar {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      width: 100%;
    }

    .toolbar-label {
      font-size: 0.85rem;
      color: #475569;
      font-weight: 600;
    }

    .digit-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: center;
    }

    .digit-btn {
      min-width: 36px;
      height: 36px;
      padding: 0;
      font-weight: bold;
      border-color: #cbd5e1;
      color: #1e293b;
    }

    .digit-btn.selected {
      background-color: #eff6ff;
      border-color: #2563eb;
      color: #1d4ed8;
    }

    .action-buttons {
      display: flex;
      gap: 8px;
      margin-top: 4px;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MnistCanvasComponent implements AfterViewInit {
  pixels = input.required<number[]>();
  selectedDigit = input<number | null>(null);

  pixelsChange = output<number[]>();
  selectedDigitChange = output<number>();

  @ViewChild('canvasRef') canvasRef!: ElementRef<HTMLCanvasElement>;
  private isDrawing = false;
  private currentPixels: number[] = new Array(784).fill(0);

  constructor() {
    effect(() => {
      const p = this.pixels();
      if (p && p.length === 784) {
        this.currentPixels = [...p];
        this.renderCanvas();
      }
    });
  }

  ngAfterViewInit(): void {
    this.renderCanvas();
  }

  renderCanvas() {
    if (!this.canvasRef) return;
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 280, 280);

    const cellSize = 10;
    for (let r = 0; r < 28; r++) {
      for (let c = 0; c < 28; c++) {
        const val = this.currentPixels[r * 28 + c];
        if (val > 0) {
          const vInt = Math.floor(val * 255);
          ctx.fillStyle = `rgb(${vInt}, ${vInt}, ${vInt})`;
          ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
        }
      }
    }

    // Grid lines guide
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 28; i += 7) {
      ctx.beginPath();
      ctx.moveTo(i * 10, 0);
      ctx.lineTo(i * 10, 280);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i * 10);
      ctx.lineTo(280, i * 10);
      ctx.stroke();
    }
  }

  loadPreset(digit: number) {
    const preset = CANONICAL_MNIST_SAMPLES[digit].pixels;
    this.currentPixels = [...preset];
    this.renderCanvas();
    this.selectedDigitChange.emit(digit);
    this.pixelsChange.emit(this.currentPixels);
  }

  clearCanvas() {
    this.currentPixels = new Array(784).fill(0);
    this.renderCanvas();
    this.pixelsChange.emit(this.currentPixels);
  }

  startDrawing(event: MouseEvent) {
    this.isDrawing = true;
    this.drawPixelFromEvent(event);
  }

  draw(event: MouseEvent) {
    if (!this.isDrawing) return;
    this.drawPixelFromEvent(event);
  }

  stopDrawing() {
    if (this.isDrawing) {
      this.isDrawing = false;
      this.pixelsChange.emit(this.currentPixels);
    }
  }

  startDrawingTouch(event: TouchEvent) {
    event.preventDefault();
    this.isDrawing = true;
    if (event.touches.length > 0) {
      this.drawPixelFromTouch(event.touches[0]);
    }
  }

  drawTouch(event: TouchEvent) {
    event.preventDefault();
    if (!this.isDrawing) return;
    if (event.touches.length > 0) {
      this.drawPixelFromTouch(event.touches[0]);
    }
  }

  private drawPixelFromTouch(touch: Touch) {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    this.paintBrush(x, y);
  }

  private drawPixelFromEvent(event: MouseEvent) {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    this.paintBrush(x, y);
  }

  private paintBrush(x: number, y: number) {
    const c = Math.floor(x / 10);
    const r = Math.floor(y / 10);

    // Apply soft brush around (r, c)
    const brush = [
      { dr: 0, dc: 0, val: 1.0 },
      { dr: -1, dc: 0, val: 0.6 },
      { dr: 1, dc: 0, val: 0.6 },
      { dr: 0, dc: -1, val: 0.6 },
      { dr: 0, dc: 1, val: 0.6 },
    ];

    for (const b of brush) {
      const rr = r + b.dr;
      const cc = c + b.dc;
      if (rr >= 0 && rr < 28 && cc >= 0 && cc < 28) {
        const idx = rr * 28 + cc;
        this.currentPixels[idx] = Math.max(this.currentPixels[idx], b.val);
      }
    }

    this.renderCanvas();
  }
}
