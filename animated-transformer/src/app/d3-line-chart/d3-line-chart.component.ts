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
import {
  Component,
  Input,
  ElementRef,
  viewChild,
  output,
  input,
  effect,
  Signal,
  computed,
  signal,
} from '@angular/core';
import * as d3 from 'd3';

// ============================================================================
// CONSIDER: Add some different ways to handle NaNs sensibly?
// use same value as before, but use dotted line and X marker.
// ============================================================================

export interface NamedChartPoint {
  x: number;
  y: number;
  name: string;
  // Used for display purposes, sometimes we set points to be the same as the
  // previous point (to flatline, but also change the style to let the user know
  // it's NaN).
  isNaN?: boolean;
}

export type ScaleFn = d3.ScaleContinuousNumeric<number, number>;
export type ScaleFactory = (domain: Iterable<number>, range: Iterable<number>) => ScaleFn;
export enum ScalingKind {
  scaleLinear = 'scaleLinear',
  scaleLog = 'scaleLog',
}
const scalingKinds: { [key in ScalingKind]: ScaleFactory } = {
  scaleLinear: d3.scaleLinear,
  scaleLog: d3.scaleLog,
};
function scaleFn(kind: ScalingKind, domain: Iterable<number>, range: Iterable<number>) {
  return scalingKinds[kind](domain, range);
}

export enum CurveKind {
  curveLinear = 'curveLinear',
  curveNatural = 'curveNatural',
}
const cruveKinds: {
  [key in CurveKind]: d3.CurveFactory;
} = {
  curveLinear: d3.curveLinear,
  curveNatural: d3.curveNatural,
};
export function curveFn(kind: CurveKind): d3.CurveFactory {
  return cruveKinds[kind];
}

export type ChartConfig = {
  hiddenLineNames: string[];

  width: number; // outer width, in pixels
  height: number; // outer height, in pixels

  marginTop: number; // top margin, in pixels
  marginRight: number; // right margin, in pixels
  marginBottom: number; // bottom margin, in pixels
  marginLeft: number; // left margin, in pixels

  // The names of the x and y axis.
  yLabel: string; // a label for the y-axis
  xLabel: string; // a label for the x-axis

  // The scaling factor for x and y axis.
  xScaleKind: ScalingKind;
  yScaleKind: ScalingKind;

  // Note the more general think a tick format can be is: ((v: number) => string)
  xTickFormat: string; // a format specifier string for the x-axis
  yTickFormat: string; // a format specifier string for the y-axis

  // How to draw lines in the chart.
  lineStrokeLinecap: string; // = "round", // stroke line cap of the line
  lineStrokeLinejoin: string; // = "round", // stroke line join of the line
  lineStrokeWidth: number; // = 1.5, // stroke width of line, in pixels
  lineStrokeOpacity: number; // = 1, // stroke opacity of line
  lineCurveKind: CurveKind;

  // Where to put the legend.
  legendX: number; // legend X position.
  legendY: number; // legend Y position.
};

export function defaultChartConfig(): ChartConfig {
  return {
    hiddenLineNames: [],
    width: 400, // outer width, in pixels
    height: 200, // outer height, in pixels

    marginTop: 20, // top margin, in pixels
    marginRight: 30, // right margin, in pixels
    marginBottom: 30, // bottom margin, in pixels
    marginLeft: 50, // left margin, in pixels

    // The names of the x and y axis.
    yLabel: 'y: undefined', // a label for the y-axis
    xLabel: 'x: undefined', // a label for the x-axis

    // The scaling factor for x and y axis.
    xScaleKind: ScalingKind.scaleLinear,
    yScaleKind: ScalingKind.scaleLinear,

    // Note the more general think a tick format can be is: ((v: number) => string)
    //
    // A format specifier values at the ticks.
    // 0.6f = fixed precision
    // f
    xTickFormat: 'f',
    yTickFormat: 'f',

    // How to draw lines in the chart.
    // CONSIDER: make enum for linecap and linejoin?
    lineStrokeLinecap: 'round', // stroke line cap of the line
    lineStrokeLinejoin: 'round', // stroke line join of the line
    lineStrokeWidth: 1.5, // stroke width of line, in pixels
    lineStrokeOpacity: 0.8, // stroke opacity of line
    lineCurveKind: CurveKind.curveLinear,

    // Where to put the legend.
    legendX: 200, // legend X position.
    legendY: 10, // legend Y position.
  };
}

type ChartElements = {
  svg: d3.Selection<SVGElement, unknown, null, undefined>;
  legend: d3.Selection<SVGGElement, unknown, null, undefined>;
  xAxisG: d3.Selection<SVGGElement, unknown, null, undefined>;
  yAxisG: d3.Selection<SVGGElement, unknown, null, undefined>;
  yAxisLinesG: d3.Selection<SVGGElement, unknown, null, undefined>;
  pathsG: d3.Selection<SVGGElement, unknown, null, undefined>;
};

// ============================================================================

@Component({
  selector: 'app-d3-line-chart',
  templateUrl: './d3-line-chart.component.html',
  styleUrls: ['./d3-line-chart.component.scss'],
  imports: [CommonModule],
})
export class D3LineChartComponent {
  readonly chartRef = viewChild.required<ElementRef>('chart');

  readonly configUpdate = output<ChartConfig>();
  readonly inChartConfig = input<ChartConfig | undefined>();
  readonly dataPoints = input<NamedChartPoint[]>([]);

  readonly chartElements = signal<ChartElements | null>(null);
  readonly config = signal<ChartConfig>(defaultChartConfig());

  readonly hiddenLineSet: Signal<Set<string>>;

  constructor() {
    effect(() => {
      const chartConfig = this.inChartConfig();
      if (chartConfig) {
        this.config.set(chartConfig);
      }
    });

    this.hiddenLineSet = computed(() => new Set(this.config().hiddenLineNames));

    effect(() => {
      const chartElements = this.chartElements();
      const data = this.dataPoints();
      const config = this.config();
      if (chartElements && data) {
        this.updateChart(chartElements, config, data);
      }
    });

    effect(() => {
      this.configUpdate.emit(this.config());
    });
  }

  ngAfterViewInit(): void {
    const svg = d3.select(this.chartRef().nativeElement);
    const chartElements: ChartElements = {
      svg,
      legend: svg.append('g'),
      xAxisG: svg.append('g'),
      yAxisG: svg.append('g'),
      yAxisLinesG: svg.append('g'),
      pathsG: svg.append('g'),
    };
    this.chartElements.set(chartElements);
  }

  updateChart(chartElements: ChartElements, config: ChartConfig, data: NamedChartPoint[]) {
    const { width, height, marginLeft, marginRight, marginTop, marginBottom } = config;
    const hiddenLineNames = this.hiddenLineSet();

    const shownData = data.filter((d) => !hiddenLineNames.has(d.name));
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

    // The target range of the chart to plot into.
    const xRange = [marginLeft, width - marginRight];
    const yRange = [height - marginBottom, marginTop];

    const xDomain = d3.extent(shownData.map((d) => d.x)) as [number, number];
    const yDomain = d3.extent(shownData.map((d) => d.y)) as [number, number];
    const xScale = scaleFn(config.xScaleKind, xDomain, xRange);
    const yScale = scaleFn(config.yScaleKind, yDomain, yRange);

    // The x and y axis lines, labels, and ticks.
    this.updateAxis(chartElements, config, xScale, yScale);

    const color = d3
      .scaleOrdinal<string, string>()
      .domain(Object.keys(pointsByName))
      .range(d3.schemeSet2);

    // The Key/Lengend.
    this.updateLegend(chartElements, config, color, hiddenLineNames, pointsByName);
    this.updateLines(chartElements, config, color, xScale, yScale, hiddenLineNames, pointsByName);
  }

  updateLines(
    chartElements: ChartElements,
    config: ChartConfig,
    color: d3.ScaleOrdinal<string, string, never>,
    xScale: ScaleFn,
    yScale: ScaleFn,
    hiddenLineNames: Set<string>,
    pointsByName: { [name: string]: NamedChartPoint[] },
  ) {
    const { pathsG } = chartElements;
    const pointNamesToPlot = Object.keys(pointsByName).filter((n) => !hiddenLineNames.has(n));

    // Make the lines in the chart.
    const line = d3
      .line<NamedChartPoint>(
        (p) => p.x,
        (p) => p.y,
      )
      .curve(curveFn(config.lineCurveKind))
      .x((p) => xScale(p.x))
      .y((p) => yScale(p.y));

    pathsG
      .selectAll('path')
      .data(pointNamesToPlot)
      .join('path')
      // append("path")
      .attr('fill', 'none')
      .attr('stroke', (d) => color(d))
      // CONSIDER: allow this to be over-written by a line specific style?
      .attr('stroke-width', config.lineStrokeWidth)
      .attr('stroke-linecap', config.lineStrokeLinecap)
      .attr('stroke-linejoin', config.lineStrokeLinejoin)
      .attr('stroke-opacity', config.lineStrokeOpacity)
      .attr('d', (d) => line(pointsByName[d]));
  }

  updateLegend(
    chartElements: ChartElements,
    config: ChartConfig,
    color: d3.ScaleOrdinal<string, string, never>,
    hiddenLineNames: Set<string>,
    pointsByName: { [name: string]: NamedChartPoint[] },
  ) {
    const { legend } = chartElements;

    const allLineNames = Object.keys(pointsByName);

    // Add one dot in the legend for each name.
    legend
      .selectAll('circle')
      .data(allLineNames)
      .join('circle')
      .on('click', (_event, d) => {
        this.toggleShowHideLine(d);
      })
      .attr('cx', config.legendX)
      .attr('cy', function (d, i) {
        return config.legendY + i * 15;
      })
      .attr('r', 4)
      .style('stroke', (d) => color(d))
      .style('fill', (d) => {
        if (hiddenLineNames.has(d)) {
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
      .attr('x', config.legendX + 10)
      .attr('y', function (d, i) {
        return config.legendY + i * 15;
      })
      .style('fill', function (d) {
        return color(d);
      })
      .text(function (d) {
        return d;
      })
      .attr('text-anchor', 'left')
      .style('alignment-baseline', 'middle');
  }

  updateAxis(
    chartElements: ChartElements,
    config: ChartConfig,
    xScale: ScaleFn,
    yScale: ScaleFn,
  ): void {
    const { svg, xAxisG, yAxisG, yAxisLinesG } = chartElements;
    const { width, height, marginLeft, marginRight, marginTop, marginBottom } = config;

    // Make the x and y axis, and
    const xAxis = d3
      .axisBottom(xScale)
      .ticks(width / 80, d3.format(config.xTickFormat))
      .tickSizeOuter(0);
    const yAxis = d3.axisLeft(yScale).ticks(height / 40, d3.format(config.yTickFormat));
    const yAxisLines = d3.axisLeft(yScale).ticks(height / 40, null);

    svg.attr('width', width).attr('height', height).attr('viewBox', [0, 0, width, height]);
    // .attr('style', 'max-width: 100%; height: auto; height: intrinsic;');

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
  }

  toggleShowHideLine(d: string) {
    const hiddenLineSet = this.hiddenLineSet();
    if (hiddenLineSet.has(d)) {
      hiddenLineSet.delete(d);
    } else {
      hiddenLineSet.add(d);
    }
    this.config.update((c) => {
      c.hiddenLineNames = [...hiddenLineSet];
      return { ...c };
    });
  }
}
