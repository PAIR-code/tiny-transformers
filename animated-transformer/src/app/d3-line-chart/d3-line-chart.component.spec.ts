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

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { D3LineChartComponent } from './d3-line-chart.component';
import { provideZonelessChangeDetection } from '@angular/core';

describe('D3LineChartComponent', () => {
  let component: D3LineChartComponent;
  let fixture: ComponentFixture<D3LineChartComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
      imports: [D3LineChartComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(D3LineChartComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should draw a single circle when there is no overlap', () => {
    const data = [
      { x: 0, y: 1.0, name: 'Train Loss' },
    ];
    fixture.componentRef.setInput('dataPoints', data);
    fixture.detectChanges();

    const dots = fixture.nativeElement.querySelectorAll('.chart-initial-dot');
    expect(dots.length).toBe(1);
    expect(dots[0].tagName.toLowerCase()).toBe('circle');
  });

  it('should draw a split circle (two slices + outline) when two dots share the same center', () => {
    const data = [
      { x: 0, y: 1.0, name: 'Train Loss' },
      { x: 0, y: 1.0, name: 'Val Loss' },
    ];
    fixture.componentRef.setInput('dataPoints', data);
    fixture.detectChanges();

    const dots = fixture.nativeElement.querySelectorAll('.chart-initial-dot');
    expect(dots.length).toBe(3);
    const paths = Array.from(dots).filter((el: any) => el.tagName.toLowerCase() === 'path');
    const circles = Array.from(dots).filter((el: any) => el.tagName.toLowerCase() === 'circle');
    expect(paths.length).toBe(2);
    expect(circles.length).toBe(1);
  });

  it('should draw a Venn diagram (2 circles + 3 paths + 1 line) when two dots partially overlap', () => {
    const data = [
      { x: 0, y: 1.0, name: 'Train Loss' },
      { x: 0, y: 0.95, name: 'Val Loss' },
    ];
    fixture.componentRef.setInput('dataPoints', data);
    fixture.detectChanges();

    const dots = fixture.nativeElement.querySelectorAll('.chart-initial-dot');
    expect(dots.length).toBe(6);
    const circles = Array.from(dots).filter((el: any) => el.tagName.toLowerCase() === 'circle') as Element[];
    const paths = Array.from(dots).filter((el: any) => el.tagName.toLowerCase() === 'path') as Element[];
    const lines = Array.from(dots).filter((el: any) => el.tagName.toLowerCase() === 'line') as Element[];
    
    expect(circles.length).toBe(2);
    expect(paths.length).toBe(3);
    expect(lines.length).toBe(1);

    // Verify white stroke colors on base circles
    const strokeA = circles[0].getAttribute('stroke');
    const strokeB = circles[1].getAttribute('stroke');
    expect(strokeA).toBe('#ffffff');
    expect(strokeB).toBe('#ffffff');

    // Verify the lens outline path has 1.0px stroke width
    // The lens outline is the 3rd path (first two are the lens half-shapes)
    const outlinePath = paths[2];
    expect(outlinePath.getAttribute('stroke')).toBe('#ffffff');
    expect(outlinePath.getAttribute('stroke-width')).toBe('1');
  });

  it('should include the latest y-axis value in the legend labels', () => {
    const data = [
      { x: 0, y: 1.0, name: 'Train Loss' },
      { x: 1, y: 0.85, name: 'Train Loss' },
    ];
    fixture.componentRef.setInput('dataPoints', data);
    fixture.detectChanges();

    const legendItems = fixture.nativeElement.querySelectorAll('.baseline-legend-item');
    const trainLossItem = Array.from(legendItems).find(
      (el: any) => el.tagName.toLowerCase() === 'text' && el.textContent.includes('Train Loss')
    ) as SVGTextElement;

    expect(trainLossItem).toBeTruthy();
    expect(trainLossItem.textContent).toContain('Train Loss (0.8500)');
  });

  it('should draw a hover circle and tooltip when mouse moves close to a point', () => {
    const data = [
      { x: 0, y: 1.0, name: 'Train Loss' },
      { x: 1, y: 0.85, name: 'Train Loss' },
    ];
    fixture.componentRef.setInput('dataPoints', data);
    fixture.detectChanges();

    const overlay = fixture.nativeElement.querySelector('.chart-overlay');
    expect(overlay).toBeTruthy();

    overlay.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 400,
      height: 200,
      x: 0,
      y: 0,
      bottom: 200,
      right: 400,
      toJSON: () => {},
    });

    // clientX = xScale(1) = 370 (width 400 - margin right 30)
    // clientY = yScaleLeft(0.85). Since yDomain is [0, 1.0], range is [170, 20].
    // yScaleLeft(0.85) = 170 - 0.85 * (170 - 20) = 170 - 0.85 * 150 = 42.5.
    const event = new MouseEvent('mousemove', {
      clientX: 370,
      clientY: 42.5,
      bubbles: true,
    });

    overlay.dispatchEvent(event);
    fixture.detectChanges();

    const hoverCircle = fixture.nativeElement.querySelector('.chart-hover-indicator-circle');
    const hoverTooltip = fixture.nativeElement.querySelector('.chart-hover-indicator-tooltip');

    expect(hoverCircle).toBeTruthy();
    expect(hoverCircle.getAttribute('display')).toBe('block');
    expect(hoverTooltip).toBeTruthy();
    expect(hoverTooltip.getAttribute('display')).toBe('block');

    const tooltipText = hoverTooltip.querySelector('text');
    expect(tooltipText.textContent).toContain('Train Loss - x: 1, y: 0.8500');
  });
});
