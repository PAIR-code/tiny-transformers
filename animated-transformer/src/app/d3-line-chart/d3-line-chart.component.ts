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

import { CommonModule } from '@angular/common';
import { Component, Input, ElementRef, viewChild } from '@angular/core';
import { clone } from '@tensorflow/tfjs';
import * as d3 from 'd3';
import { svg } from 'd3';

export interface NamedChartPoint {
  x: number;
  y: number;
  name: string;
  // Used for display purposes, sometimes we set points to be the same as the
  // previous point (to flatline, but also change the style to let the user know
  // it's NaN).
  isNaN?: boolean;
}

// TODO: make it handle NaNs sensibly: use same value as before, but use dotted line and X marker.
export interface LineChartConfig {
  hiddenLineNames?: string[];
  marginTop?: number; // top margin, in pixels
  marginRight?: number; // right margin, in pixels
  marginBottom?: number; // bottom margin, in pixels
  marginLeft?: number; // left margin, in pixels
  width?: number; // outer width, in pixels
  height?: number; // outer height, in pixels
  yLabel?: string; // a label for the y-axis
  strokeLinecap?: string; // = "round", // stroke line cap of the line
  strokeLinejoin?: string; // = "round", // stroke line join of the line
  strokeWidth?: number; // = 1.5, // stroke width of line, in pixels
  strokeOpacity?: number; // = 1, // stroke opacity of line
  legendX?: number; // legend X position.
  legendY?: number; // legend Y position.
  yDomain?: [number, number]; // [ymin, ymax]
  yRange?: [number, number]; //  = [height - marginBottom, marginTop], // [bottom, top]
  xDomain?: [number, number]; // [xmin, xmax]
  xRange?: [number, number]; //  = [marginLeft, width - marginRight], // [left, right]
}

export interface LineChartParams extends LineChartConfig {
  x?: (d: NamedChartPoint, i: number) => number; // given d in data, returns the (temporal) x-value
  y?: (d: NamedChartPoint, i: number) => number; // given d in data, returns the (quantitative) y-value
  curve?: typeof d3.curveLinear; // method of interpolation between points
  xType?: typeof d3.scaleLinear;
  // typeof d3.scaleUtc; // the x-scale type
  xFormat?: string | ((v: number) => string); // a format specifier string for the y-axis
  yType?: typeof d3.scaleLinear; // the y-scale type
  yFormat?: string | ((v: number) => string); // a format specifier string for the y-axis
}

interface DrawData {
  data: NamedChartPoint[];
  // expected to be a subset of data.name;
  hiddenLineNames: Set<string>;

  xRange: [number, number];
  yRange: [number, number];
  // X: number[]; // all x values
  // Y: number[]; // all y values
  // I: number[]; // indexes into X,Y,D.
  // N: string[];

  width: number;
  height: number;
  // xDomain: [number, number];
  // yDomain: [number, number];
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;

  yLabel: string;

  strokeWidth: number;
  strokeLinecap: string;
  strokeLinejoin: string;
  strokeOpacity: number;

  legendX: number; // legend X position.
  legendY: number; // legend Y position.

  curveFn: d3.CurveFactory;
}

@Component({
  selector: 'app-d3-line-chart',
  templateUrl: './d3-line-chart.component.html',
  styleUrls: ['./d3-line-chart.component.scss'],
  imports: [CommonModule],
})
export class D3LineChartComponent {
  dataPoints: NamedChartPoint[] = [];
  chartConfig: LineChartParams = {};
  drawData?: DrawData;
  // config: LineChartConfig = {};
  chartParts?: ChartParts;

  readonly chartRef = viewChild.required<ElementRef>('chart');

  constructor() {}

  ngAfterViewInit(): void {
    this.chartParts = initChartParts(this.chartRef().nativeElement);
    this.updateChart();
  }

  @Input()
  set config(newConfig: LineChartParams) {
    this.chartConfig = newConfig;
    this.updateChart();
  }
  get config(): LineChartParams {
    return this.chartConfig;
  }

  @Input()
  set data(newDataPoints: NamedChartPoint[]) {
    this.dataPoints = newDataPoints;
    this.updateChart();
  }
  get data(): NamedChartPoint[] {
    return this.dataPoints;
  }

  updateChart() {
    if (!this.chartRef() || !this.chartParts) {
      // This will happen with initial setting of data.
      // console.error(
      //   `Missing chartRef (${this.chartRef}) or chartParts ${this.chartParts}`);
      return;
    }
    this.drawData = initDrawData(this.config, this.data);
    updateChart(this.drawData, this.chartParts);
  }
}

interface ChartParts {
  svg: d3.Selection<SVGElement, unknown, null, undefined>;
  legend: d3.Selection<SVGGElement, unknown, null, undefined>;
  xAxisG: d3.Selection<SVGGElement, unknown, null, undefined>;
  yAxisG: d3.Selection<SVGGElement, unknown, null, undefined>;
  yAxisLinesG: d3.Selection<SVGGElement, unknown, null, undefined>;
  pathsG: d3.Selection<SVGGElement, unknown, null, undefined>;
}

function initChartParts(el: SVGElement): ChartParts {
  const svg = d3.select(el);
  return {
    svg,
    legend: svg.append('g'),
    xAxisG: svg.append('g'),
    yAxisG: svg.append('g'),
    yAxisLinesG: svg.append('g'),
    pathsG: svg.append('g'),
  };
}

function updateChart(drawData: DrawData, chartParts: ChartParts) {
  const { svg, legend, xAxisG, yAxisG, pathsG, yAxisLinesG } = chartParts;

  const {
    data,
    width,
    height,
    xRange,
    yRange,
    marginBottom,
    marginTop,
    marginLeft,
    marginRight,
    yLabel,
    strokeWidth,
    strokeLinecap,
    strokeLinejoin,
    strokeOpacity,
    legendX,
    legendY,
    curveFn,
  } = drawData;

  // Scale and Axis
  // If we wanted to allow dynamic config, we'd do something like this...
  // const xType = config.xType || d3.scaleLinear; // d3.scaleUtc;
  // const yType = config.yType || d3.scaleLinear;
  // const xDomain = config.xDomain || (d3.extent(X) as [number, number]);
  // const yDomain = config.yDomain || ([d3.min(Y), d3.max(Y)] as [number, number]);
  // const xScale = xType(xDomain, xRange);
  // const yScale = yType(yDomain, yRange);
  // const yFormat = config.yFormat || d3.format('f');
  // const xFormat = config.xFormat || d3.format('f');

  const pointsByName: { [name: string]: NamedChartPoint[] } = {};
  {
    const lastPointByName: { [name: string]: NamedChartPoint } = {};
    data.forEach((d) => {
      if (!(d.name in pointsByName)) {
        pointsByName[d.name] = [];
      }
      if (isNaN(d.y)) {
        d.y = lastPointByName[d.name].y;
        d.isNaN = true;
      }
      lastPointByName[d.name] = d;
      pointsByName[d.name].push(d);
    });
  }

  const shownData = data.filter((d) => !drawData.hiddenLineNames.has(d.name));

  const X = d3.map(shownData, (d) => d.x);
  const Y = d3.map(shownData, (d) => d.y);
  const xType = d3.scaleLinear; // d3.scaleUtc;
  const yType = d3.scaleLinear;
  const xDomain = d3.extent(X) as [number, number];
  const yDomain = [d3.min(Y), d3.max(Y)] as [number, number];
  const xScale = xType(xDomain, xRange) as d3.ScaleLinear<number, number, never>;
  const yScale = yType(yDomain, yRange) as d3.ScaleLinear<number, number, never>;
  const yFormat = d3.format('f');
  const xFormat = d3.format('f');

  const xAxis = d3
    .axisBottom(xScale)
    .ticks(width / 80, xFormat)
    .tickSizeOuter(0);
  const yAxis = d3.axisLeft(yScale).ticks(height / 40, yFormat);
  const yAxisLines = d3.axisLeft(yScale).ticks(height / 40, null);

  // Construct a line generator.
  const line = d3
    .line<NamedChartPoint>(
      (p) => p.x,
      (p) => p.y,
    )
    .curve(curveFn)
    .x((p) => xScale(p.x))
    .y((p) => yScale(p.y));

  svg
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', [0, 0, width, height])
    .attr('style', 'max-width: 100%; height: auto; height: intrinsic;');

  // TODO: select x-axis
  xAxisG.attr('transform', `translate(0,${height - marginBottom})`).call(xAxis);
  // .call(g => (g.selection ? g.selection() : g).select(".domain").remove());

  // TODO: select y-axis
  yAxisG.attr('transform', `translate(${marginLeft},0)`).call(yAxis);

  // TODO: better way to do this? This seems a bit silly, creating ticks and
  // text elements, and then changing the attributes and removing the text.
  const yAxisLinesSelection = yAxisLinesG
    .attr('transform', `translate(${marginLeft},0)`)
    .call(yAxisLines.tickFormat(() => ''));
  yAxisLinesSelection
    .selectAll('line')
    .attr('x2', width - marginLeft - marginRight)
    .attr('stroke-opacity', 0.1);
  yAxisLinesSelection.selectAll('text').remove();

  const allLineNames = Object.keys(pointsByName);
  const pointNamesToPlot = allLineNames.filter((n) => !drawData.hiddenLineNames.has(n));
  const color = d3.scaleOrdinal<string, string>().domain(allLineNames).range(d3.schemeSet2);

  // Add one dot in the legend for each name.
  legend
    .selectAll('circle')
    .data(allLineNames)
    .join('circle')
    .on('click', (_event, d) => {
      console.log('clicked on circle', d);
      if (drawData.hiddenLineNames.has(d)) {
        drawData.hiddenLineNames.delete(d);
      } else {
        drawData.hiddenLineNames.add(d);
      }
      updateChart(drawData, chartParts);
    })
    .attr('cx', legendX)
    .attr('cy', function (d, i) {
      return legendY + i * 15;
    })
    .attr('r', 4)
    .style('stroke', (d) => color(d))
    .style('fill', (d) => {
      if (drawData.hiddenLineNames.has(d)) {
        return '#FFF';
      }
      return color(d);
    });

  // Add one dot in the legend for each name.
  legend
    .selectAll('text')
    .data(allLineNames)
    .join('text')
    .attr('font-size', 'smaller')
    .attr('x', legendX + 10)
    .attr('y', function (d, i) {
      return legendY + i * 15;
    })
    .style('fill', function (d) {
      return color(d);
    })
    .text(function (d) {
      return d;
    })
    .attr('text-anchor', 'left')
    .style('alignment-baseline', 'middle');

  pathsG
    .selectAll('path')
    .data(pointNamesToPlot)
    .join('path')
    // append("path")
    .attr('fill', 'none')
    .attr('stroke', (d) => color(d))
    .attr('stroke-width', strokeWidth)
    .attr('stroke-linecap', strokeLinecap)
    .attr('stroke-linejoin', strokeLinejoin)
    .attr('stroke-opacity', strokeOpacity)
    .attr('d', (d) => line(pointsByName[d]));
}

function initDrawData(config: LineChartParams, data: NamedChartPoint[]): DrawData {
  // const I = d3.range(X.length);
  const curveFn = config.curve || d3.curveLinear;

  const width = config.width || 400; // outer width, in pixels
  const height = config.height || 200; // outer height, in pixels
  const marginTop = config.marginTop === undefined ? 20 : config.marginTop;
  const marginRight = config.marginRight === undefined ? 30 : config.marginRight;
  const marginBottom = config.marginBottom === undefined ? 30 : config.marginBottom;
  const marginLeft = config.marginLeft === undefined ? 50 : config.marginLeft;
  const xRange = config.xRange || [marginLeft, width - marginRight];
  const yRange = config.yRange || [height - marginBottom, marginTop];

  const yLabel = config.yLabel || '';
  const strokeLinecap = config.strokeLinecap || 'round';
  const strokeLinejoin = config.strokeLinejoin || 'round';
  const strokeWidth = config.strokeWidth !== undefined ? config.strokeWidth : 1.5;
  const strokeOpacity = config.strokeOpacity !== undefined ? config.strokeOpacity : 0.7;
  const legendX = config.legendX || 200;
  const legendY = config.legendY || 10;
  // y format precision decided implicitly by data.
  // const color = config.color || '#000';

  const drawData: DrawData = {
    // X, Y, I, N,
    data,
    hiddenLineNames: new Set(config.hiddenLineNames || []),
    width,
    height,
    xRange,
    yRange,
    marginBottom,
    marginTop,
    marginLeft,
    marginRight,
    yLabel,
    strokeWidth,
    strokeLinecap,
    strokeLinejoin,
    strokeOpacity,
    legendX,
    legendY,
    curveFn,
  };
  return drawData;
}
