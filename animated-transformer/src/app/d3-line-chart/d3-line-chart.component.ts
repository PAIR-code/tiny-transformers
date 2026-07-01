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
  isNaN?: boolean;
}

export interface ChartBaseline {
  y: number;
  name: string;
  color?: string;
  isRightAxis?: boolean;
}

export const CHART_COLOR_MAP: { [name: string]: string } = {
  'Train Loss': '#3b82f6',        // Blue
  'Val Loss': '#ef4444',          // Red
  'Train Accuracy': '#10b981',    // Emerald Green
  'Val Accuracy': '#f59e0b',      // Amber
  'Opt Train Loss': '#93c5fd',    // Light Blue
  'Opt Val Loss': '#fca5a5',      // Light Red
  'Opt Val Acc': '#fcd34d',       // Light Amber
};

export function getLineColor(name: string): string {
  return CHART_COLOR_MAP[name] || '#64748b';
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

  // Optional dual-Y axis settings
  rightYLabel?: string;
  rightYLineNames?: string[];
  rightYDomain?: [number, number];

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

    rightYLabel: '',
    rightYLineNames: [],
    rightYDomain: undefined,

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
  yAxisRightG: d3.Selection<SVGGElement, unknown, null, undefined>;
  yAxisLinesG: d3.Selection<SVGGElement, unknown, null, undefined>;
  pathsG: d3.Selection<SVGGElement, unknown, null, undefined>;
};

// ============================================================================

@Component({
  selector: 'app-d3-line-chart',
  templateUrl: './d3-line-chart.component.html',
  styleUrls: ['./d3-line-chart.component.scss'],
  imports: [],
})
export class D3LineChartComponent {
  readonly chartRef = viewChild.required<ElementRef>('chart');

  readonly configUpdate = output<ChartConfig>();
  readonly inChartConfig = input<ChartConfig | undefined>();
  readonly dataPoints = input<NamedChartPoint[]>([]);
  readonly baselines = input<ChartBaseline[]>([]);

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
      const baselines = this.baselines();
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
      yAxisRightG: svg.append('g'),
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
    const xScale = scaleFn(config.xScaleKind, xDomain, xRange);

    const rightNames = new Set(config.rightYLineNames || []);
    const leftData = shownData.filter(d => !rightNames.has(d.name));
    const rightData = shownData.filter(d => rightNames.has(d.name));

    const yDomainLeft = d3.extent(leftData.map((d) => d.y)) as [number, number];
    if (yDomainLeft[0] !== undefined) {
      yDomainLeft[0] = 0;
    }
    const yScaleLeft = scaleFn(config.yScaleKind, yDomainLeft, yRange);

    let yScaleRight: ScaleFn | undefined;
    if (rightNames.size > 0) {
      const yDomainRight = config.rightYDomain || (d3.extent(rightData.map((d) => d.y)) as [number, number]);
      yScaleRight = scaleFn(config.yScaleKind, yDomainRight, yRange);
    }

    // The x and y axis lines, labels, and ticks.
    this.updateAxis(chartElements, config, xScale, yScaleLeft, yScaleRight);

    // The Key/Lengend.
    this.updateLegend(chartElements, config, getLineColor, hiddenLineNames, pointsByName, this.baselines());
    this.updateLines(chartElements, config, getLineColor, xScale, yScaleLeft, yScaleRight, hiddenLineNames, pointsByName);
    this.updateBaselines(chartElements, config, xScale, yScaleLeft, yScaleRight, this.baselines());
  }

  updateLines(
    chartElements: ChartElements,
    config: ChartConfig,
    colorFn: (name: string) => string,
    xScale: ScaleFn,
    yScaleLeft: ScaleFn,
    yScaleRight: ScaleFn | undefined,
    hiddenLineNames: Set<string>,
    pointsByName: { [name: string]: NamedChartPoint[] },
  ) {
    const { pathsG } = chartElements;
    const pointNamesToPlot = Object.keys(pointsByName).filter((n) => !hiddenLineNames.has(n));
    const rightNames = new Set(config.rightYLineNames || []);

    pathsG.selectAll('path').remove();
    pathsG.selectAll('.chart-initial-dot').remove();

    pointNamesToPlot.forEach((name) => {
      const activeYScale = (rightNames.has(name) && yScaleRight) ? yScaleRight : yScaleLeft;
      const pts = pointsByName[name];
      
      const line = d3
        .line<NamedChartPoint>()
        .curve(curveFn(config.lineCurveKind))
        .x((p) => xScale(p.x))
        .y((p) => activeYScale(p.y));

      pathsG
        .append('path')
        .datum(pts)
        .attr('fill', 'none')
        .attr('stroke', colorFn(name))
        .attr('stroke-width', config.lineStrokeWidth)
        .attr('stroke-linecap', config.lineStrokeLinecap)
        .attr('stroke-linejoin', config.lineStrokeLinejoin)
        .attr('stroke-opacity', config.lineStrokeOpacity)
        .attr('d', line);

      // Draw initial point as a bigger circle/dot (step 0)
      if (pts && pts.length > 0) {
        const firstPt = pts[0];
        pathsG
          .append('circle')
          .attr('class', 'chart-initial-dot')
          .attr('cx', xScale(firstPt.x))
          .attr('cy', activeYScale(firstPt.y))
          .attr('r', 5.5) // Bigger dot
          .attr('fill', colorFn(name))
          .attr('stroke', '#ffffff')
          .attr('stroke-width', 1.8)
          .attr('opacity', 0.95);
      }
    });
  }

  updateLegend(
    chartElements: ChartElements,
    config: ChartConfig,
    colorFn: (name: string) => string,
    hiddenLineNames: Set<string>,
    pointsByName: { [name: string]: NamedChartPoint[] },
    baselines: ChartBaseline[]
  ) {
    const { legend } = chartElements;
    const { width, height, marginLeft, marginRight, marginBottom } = config;

    const rightNames = new Set(config.rightYLineNames || []);
    const leftLineNames = Object.keys(pointsByName).filter(n => !rightNames.has(n));
    const leftBaselines = baselines.filter(b => !b.isRightAxis).map(b => b.name);
    const leftKeys = [...leftLineNames, ...leftBaselines];

    const rightLineNames = Object.keys(pointsByName).filter(n => rightNames.has(n));
    const rightBaselines = baselines.filter(b => b.isRightAxis).map(b => b.name);
    const rightKeys = [...rightLineNames, ...rightBaselines];

    const legendPositions: { [name: string]: { x: number; y: number; isBaseline: boolean } } = {};
    const startY = height - marginBottom + 28;

    leftKeys.forEach((name, idx) => {
      legendPositions[name] = {
        x: marginLeft,
        y: startY + idx * 14,
        isBaseline: leftBaselines.includes(name)
      };
    });

    rightKeys.forEach((name, idx) => {
      legendPositions[name] = {
        x: width - marginRight - 110,
        y: startY + idx * 14,
        isBaseline: rightBaselines.includes(name)
      };
    });

    const allKeys = [...leftKeys, ...rightKeys];

    // Clear old legend elements
    legend.selectAll('*').remove();

    allKeys.forEach((name) => {
      const pos = legendPositions[name];
      if (!pos) return;

      const isHidden = hiddenLineNames.has(name);
      const color = colorFn(name);

      if (pos.isBaseline) {
        // Draw dashed line snippet for baseline key
        legend
          .append('line')
          .attr('class', 'baseline-legend-item')
          .attr('x1', pos.x - 4)
          .attr('x2', pos.x + 10)
          .attr('y1', pos.y)
          .attr('y2', pos.y)
          .attr('stroke', color)
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '2,2');
      } else {
        // Draw circle for line key (with toggle action)
        legend
          .append('circle')
          .attr('cx', pos.x + 3)
          .attr('cy', pos.y)
          .attr('r', 4)
          .style('stroke', color)
          .style('fill', isHidden ? '#FFF' : color)
          .style('cursor', 'pointer')
          .on('click', () => {
            this.toggleShowHideLine(name);
          });
      }

      // Draw text label next to the symbol
      legend
        .append('text')
        .attr('class', 'baseline-legend-item')
        .attr('font-size', '10px')
        .attr('font-weight', '500')
        .attr('x', pos.x + 16)
        .attr('y', pos.y)
        .style('fill', isHidden ? '#94a3b8' : color)
        .style('cursor', pos.isBaseline ? 'default' : 'pointer')
        .text(name)
        .attr('alignment-baseline', 'middle')
        .on('click', () => {
          if (!pos.isBaseline) {
            this.toggleShowHideLine(name);
          }
        });
    });
  }

  updateBaselines(
    chartElements: ChartElements,
    config: ChartConfig,
    xScale: ScaleFn,
    yScaleLeft: ScaleFn,
    yScaleRight: ScaleFn | undefined,
    baselines: ChartBaseline[]
  ) {
    const { pathsG } = chartElements;
    const { width, marginLeft, marginRight } = config;

    // Remove any previously drawn baseline elements
    pathsG.selectAll('.chart-baseline-line').remove();

    baselines.forEach((b) => {
      const activeYScale = (b.isRightAxis && yScaleRight) ? yScaleRight : yScaleLeft;
      const yVal = activeYScale(b.y);

      const isRight = !!b.isRightAxis;
      const xStart = isRight ? marginLeft : marginLeft - 10;
      const xEnd = isRight ? width - marginRight + 10 : width - marginRight;

      // Draw horizontal line extending slightly past axis
      pathsG
        .append('line')
        .attr('class', 'chart-baseline-line')
        .attr('x1', xStart)
        .attr('x2', xEnd)
        .attr('y1', yVal)
        .attr('y2', yVal)
        .attr('stroke', b.color || '#94a3b8')
        .attr('stroke-width', 1.2)
        .attr('stroke-dasharray', '3,3')
        .attr('stroke-opacity', 0.7);
    });
  }

  updateAxis(
    chartElements: ChartElements,
    config: ChartConfig,
    xScale: ScaleFn,
    yScaleLeft: ScaleFn,
    yScaleRight: ScaleFn | undefined,
  ): void {
    const { svg, xAxisG, yAxisG, yAxisRightG, yAxisLinesG } = chartElements;
    const { width, height, marginLeft, marginRight, marginTop, marginBottom } = config;

    const xAxis = d3
      .axisBottom(xScale)
      .ticks(width / 80, d3.format(config.xTickFormat))
      .tickSizeOuter(0);
    const yAxisLeft = d3.axisLeft(yScaleLeft).ticks(height / 40, d3.format(config.yTickFormat));
    const yAxisLines = d3.axisLeft(yScaleLeft).ticks(height / 40, null);

    svg.attr('width', width).attr('height', height).attr('viewBox', [0, 0, width, height]);

    xAxisG.attr('transform', `translate(0,${height - marginBottom})`).call(xAxis);

    yAxisG.attr('transform', `translate(${marginLeft},0)`).call(yAxisLeft);

    if (config.yLabel) {
      yAxisG
        .append('text')
        .attr('fill', '#475569')
        .attr('transform', 'rotate(-90)')
        .attr('y', -35)
        .attr('x', -(height - marginBottom + marginTop) / 2)
        .attr('text-anchor', 'middle')
        .attr('font-size', '10px')
        .attr('font-weight', '600')
        .text(config.yLabel);
    }

    if (yAxisRightG) {
      yAxisRightG.selectAll('*').remove();
      if (yScaleRight) {
        const yAxisRight = d3.axisRight(yScaleRight).ticks(height / 40, d3.format(config.yTickFormat));
        yAxisRightG
          .attr('transform', `translate(${width - marginRight},0)`)
          .call(yAxisRight);

        if (config.rightYLabel) {
          yAxisRightG
            .append('text')
            .attr('fill', '#475569')
            .attr('transform', 'rotate(90)')
            .attr('y', -35)
            .attr('x', (height - marginBottom + marginTop) / 2)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('font-weight', '600')
            .text(config.rightYLabel);
        }
      }
    }

    const yAxisLinesSelection = yAxisLinesG
      .attr('transform', `translate(${marginLeft},0)`)
      .call(yAxisLines.tickFormat(() => ''));
    
    yAxisLinesSelection.selectAll('line').remove();
    yAxisLinesSelection
      .selectAll('line')
      .data(yScaleLeft.ticks(height / 40))
      .join('line')
      .attr('y1', d => yScaleLeft(d))
      .attr('y2', d => yScaleLeft(d))
      .attr('x2', width - marginLeft - marginRight)
      .attr('stroke', '#cbd5e1')
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
