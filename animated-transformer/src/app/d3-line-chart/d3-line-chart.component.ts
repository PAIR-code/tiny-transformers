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

interface InitialDot {
  name: string;
  color: string;
  cx: number;
  cy: number;
  r: number;
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
  hoverG: d3.Selection<SVGGElement, unknown, null, undefined>;
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
      hoverG: svg.append('g'),
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
    this.setupHoverIndicator(chartElements, config, xScale, yScaleLeft, yScaleRight, hiddenLineNames, pointsByName);
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

    const initialDots: InitialDot[] = [];

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

      // Collect initial point as a bigger circle/dot (step 0)
      if (pts && pts.length > 0) {
        const firstPt = pts[0];
        initialDots.push({
          name,
          color: colorFn(name),
          cx: xScale(firstPt.x),
          cy: activeYScale(firstPt.y),
          r: 5.5,
        });
      }
    });

    this.drawInitialDots(pathsG, initialDots);
  }

  private drawInitialDots(
    pathsG: d3.Selection<SVGGElement, unknown, null, undefined>,
    dots: InitialDot[]
  ) {
    // 1. Group dots by overlap
    const components = this.findOverlapComponents(dots);

    // 2. Render each component
    components.forEach((component) => {
      if (component.length === 1) {
        // Normal single dot
        const dot = component[0];
        pathsG
          .append('circle')
          .attr('class', 'chart-initial-dot')
          .attr('cx', dot.cx)
          .attr('cy', dot.cy)
          .attr('r', dot.r)
          .attr('fill', dot.color)
          .attr('stroke', '#ffffff')
          .attr('stroke-width', 1.8)
          .attr('opacity', 0.95);
      } else {
        // Check if they share the same center
        const shareCenter = this.allShareCenter(component);
        if (shareCenter) {
          this.drawSplitCircleSameCenter(pathsG, component);
        } else if (component.length === 2) {
          // Venn diagram overlap
          this.drawVennDiagramOverlap(pathsG, component[0], component[1]);
        } else {
          // Fallback: draw normal circles for each
          component.forEach((dot) => {
            pathsG
              .append('circle')
              .attr('class', 'chart-initial-dot')
              .attr('cx', dot.cx)
              .attr('cy', dot.cy)
              .attr('r', dot.r)
              .attr('fill', dot.color)
              .attr('stroke', '#ffffff')
              .attr('stroke-width', 1.8)
              .attr('opacity', 0.95);
          });
        }
      }
    });
  }

  private findOverlapComponents(dots: InitialDot[]): InitialDot[][] {
    const components: InitialDot[][] = [];
    const visited = new Set<number>();

    for (let i = 0; i < dots.length; i++) {
      if (visited.has(i)) continue;
      const component: InitialDot[] = [dots[i]];
      visited.add(i);

      const queue = [i];
      while (queue.length > 0) {
        const currIdx = queue.shift()!;
        const curr = dots[currIdx];

        for (let j = 0; j < dots.length; j++) {
          if (visited.has(j)) continue;
          const other = dots[j];
          const dist = Math.sqrt(
            Math.pow(curr.cx - other.cx, 2) + Math.pow(curr.cy - other.cy, 2)
          );
          if (dist < curr.r + other.r) {
            component.push(other);
            visited.add(j);
            queue.push(j);
          }
        }
      }
      components.push(component);
    }
    return components;
  }

  private allShareCenter(component: InitialDot[]): boolean {
    if (component.length < 2) return true;
    const first = component[0];
    for (let i = 1; i < component.length; i++) {
      const dist = Math.sqrt(
        Math.pow(first.cx - component[i].cx, 2) + Math.pow(first.cy - component[i].cy, 2)
      );
      if (dist >= 0.5) {
        return false;
      }
    }
    return true;
  }

  private drawSplitCircleSameCenter(
    pathsG: d3.Selection<SVGGElement, unknown, null, undefined>,
    dots: InitialDot[]
  ) {
    const N = dots.length;
    const first = dots[0];
    const cx = first.cx;
    const cy = first.cy;
    const r = first.r;

    // Draw the slices
    for (let i = 0; i < N; i++) {
      const dot = dots[i];
      const thetaStart = (i * 2 * Math.PI) / N;
      const thetaEnd = ((i + 1) * 2 * Math.PI) / N;

      const xStart = cx + r * Math.cos(thetaStart);
      const yStart = cy + r * Math.sin(thetaStart);
      const xEnd = cx + r * Math.cos(thetaEnd);
      const yEnd = cy + r * Math.sin(thetaEnd);

      const pathData = `M ${cx} ${cy} L ${xStart} ${yStart} A ${r} ${r} 0 0 1 ${xEnd} ${yEnd} Z`;

      pathsG
        .append('path')
        .attr('class', 'chart-initial-dot')
        .attr('d', pathData)
        .attr('fill', dot.color)
        .attr('opacity', 0.95);
    }

    // Draw outline circle on top for clean white border
    pathsG
      .append('circle')
      .attr('class', 'chart-initial-dot')
      .attr('cx', cx)
      .attr('cy', cy)
      .attr('r', r)
      .attr('fill', 'none')
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1.8)
      .attr('opacity', 0.95);
  }

  private drawVennDiagramOverlap(
    pathsG: d3.Selection<SVGGElement, unknown, null, undefined>,
    A: InitialDot,
    B: InitialDot
  ) {
    const dx = B.cx - A.cx;
    const dy = B.cy - A.cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    const r = A.r;

    // 1. Draw base circles (Circle A and Circle B) with white borders
    pathsG
      .append('circle')
      .attr('class', 'chart-initial-dot')
      .attr('cx', A.cx)
      .attr('cy', A.cy)
      .attr('r', A.r)
      .attr('fill', A.color)
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1.8)
      .attr('opacity', 0.95);

    pathsG
      .append('circle')
      .attr('class', 'chart-initial-dot')
      .attr('cx', B.cx)
      .attr('cy', B.cy)
      .attr('r', B.r)
      .attr('fill', B.color)
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1.8)
      .attr('opacity', 0.95);

    // 2. Find intersection points
    const a = d / 2;
    const h = Math.sqrt(r * r - a * a);

    const xm = A.cx + dx / 2;
    const ym = A.cy + dy / 2;

    const rx = -dy * (h / d);
    const ry = dx * (h / d);

    const q1 = { x: xm + rx, y: ym + ry };
    const q2 = { x: xm - rx, y: ym - ry };

    // 3. Draw the two halves of the lens
    // Half closer to A (inside B): filled with A.color. Arc of Circle B from Q2 to Q1.
    const pathLeft = `M ${q1.x} ${q1.y} L ${q2.x} ${q2.y} A ${r} ${r} 0 0 0 ${q1.x} ${q1.y} Z`;
    pathsG
      .append('path')
      .attr('class', 'chart-initial-dot')
      .attr('d', pathLeft)
      .attr('fill', A.color)
      .attr('opacity', 0.95);

    // Half closer to B (inside A): filled with B.color. Arc of Circle A from Q1 to Q2.
    const pathRight = `M ${q2.x} ${q2.y} L ${q1.x} ${q1.y} A ${r} ${r} 0 0 0 ${q2.x} ${q2.y} Z`;
    pathsG
      .append('path')
      .attr('class', 'chart-initial-dot')
      .attr('d', pathRight)
      .attr('fill', B.color)
      .attr('opacity', 0.95);

    // 4. Draw the outline/stroke around the shared area (lens) and chord boundary (1px width)
    const pathLensOutline = `M ${q1.x} ${q1.y} A ${r} ${r} 0 0 0 ${q2.x} ${q2.y} A ${r} ${r} 0 0 0 ${q1.x} ${q1.y} Z`;
    pathsG
      .append('path')
      .attr('class', 'chart-initial-dot')
      .attr('d', pathLensOutline)
      .attr('fill', 'none')
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1.0)
      .attr('opacity', 0.95);

    // Draw the division line (chord) inside the lens for extra clarity (1px width)
    pathsG
      .append('line')
      .attr('class', 'chart-initial-dot')
      .attr('x1', q1.x)
      .attr('y1', q1.y)
      .attr('x2', q2.x)
      .attr('y2', q2.y)
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1.0)
      .attr('opacity', 0.95);
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
      const textNode = legend
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

      if (!isHidden) {
        let valueStr = '';
        if (pos.isBaseline) {
          const b = baselines.find((bl) => bl.name === name);
          if (b !== undefined) {
            valueStr = ` (${b.y.toFixed(4)})`;
          }
        } else {
          const pts = pointsByName[name];
          if (pts && pts.length > 0) {
            const lastPt = pts[pts.length - 1];
            valueStr = ` (${lastPt.y.toFixed(4)})`;
          }
        }

        if (valueStr) {
          textNode
            .append('tspan')
            .style('fill', '#64748b')
            .style('font-weight', 'normal')
            .text(valueStr);
        }
      }
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

  private setupHoverIndicator(
    chartElements: ChartElements,
    config: ChartConfig,
    xScale: ScaleFn,
    yScaleLeft: ScaleFn,
    yScaleRight: ScaleFn | undefined,
    hiddenLineNames: Set<string>,
    pointsByName: { [name: string]: NamedChartPoint[] }
  ) {
    const { svg, hoverG } = chartElements;
    const { width, height, marginLeft, marginRight, marginTop, marginBottom } = config;
    const rightNames = new Set(config.rightYLineNames || []);

    // Create or select transparent overlay rect to capture events
    let overlay = svg.select<SVGRectElement>('.chart-overlay');
    if (overlay.empty()) {
      overlay = svg
        .append('rect')
        .attr('class', 'chart-overlay')
        .attr('fill', 'none')
        .attr('pointer-events', 'all');
    }
    overlay
      .attr('x', marginLeft)
      .attr('y', marginTop)
      .attr('width', width - marginLeft - marginRight)
      .attr('height', height - marginTop - marginBottom);

    // Clear hover group initially
    hoverG.selectAll('*').remove();

    // Create hover indicator elements inside hoverG
    const hoverCircle = hoverG
      .append('circle')
      .attr('class', 'chart-hover-indicator-circle')
      .attr('r', 4.5)
      .attr('fill', '#ffffff')
      .attr('stroke-width', 2.0)
      .attr('display', 'none');

    // Tooltip text container
    const hoverTooltip = hoverG
      .append('g')
      .attr('class', 'chart-hover-indicator-tooltip')
      .attr('display', 'none');

    // Add background rect for the tooltip text
    const tooltipBg = hoverTooltip
      .append('rect')
      .attr('rx', 3)
      .attr('ry', 3)
      .attr('fill', 'rgba(15, 23, 42, 0.85)')
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 0.5);

    const tooltipText = hoverTooltip
      .append('text')
      .attr('font-size', '9px')
      .attr('font-weight', '600')
      .attr('fill', '#ffffff')
      .attr('text-anchor', 'middle');

    overlay
      .on('mousemove', (event) => {
        const [mx, my] = d3.pointer(event, overlay.node());

        // Find closest point across all shown lines
        let closestPt: { x: number; y: number; name: string; screenX: number; screenY: number } | null = null;
        let minDist = Infinity;

        const pointNamesToPlot = Object.keys(pointsByName).filter((n) => !hiddenLineNames.has(n));

        pointNamesToPlot.forEach((name) => {
          const activeYScale = (rightNames.has(name) && yScaleRight) ? yScaleRight : yScaleLeft;
          const pts = pointsByName[name];
          if (!pts) return;

          pts.forEach((pt) => {
            if (pt.isNaN) return;
            const px = xScale(pt.x);
            const py = activeYScale(pt.y);
            const dist = Math.sqrt((px - mx) ** 2 + (py - my) ** 2);

            if (dist < minDist) {
              minDist = dist;
              closestPt = {
                x: pt.x,
                y: pt.y,
                name,
                screenX: px,
                screenY: py,
              };
            }
          });
        });

        // Threshold of 30px
        if (closestPt && minDist < 30) {
          const pt = closestPt as any;
          const color = getLineColor(pt.name);
          hoverCircle
            .attr('cx', pt.screenX)
            .attr('cy', pt.screenY)
            .attr('stroke', color)
            .attr('display', 'block');

          // Text content
          const textContent = `${pt.name} - x: ${pt.x}, y: ${pt.y.toFixed(4)}`;
          tooltipText.text(textContent);

          // Get dimensions of text
          const bbox = (tooltipText.node() as SVGTextElement).getBBox();
          const paddingX = 6;
          const paddingY = 4;
          const bgWidth = bbox.width + paddingX * 2;
          const bgHeight = bbox.height + paddingY * 2;

          // Position tooltip above the point, centered horizontally
          let tx = pt.screenX;
          let ty = pt.screenY - 10 - bgHeight / 2;

          // Boundaries checking to prevent tooltip from going off-screen
          if (tx - bgWidth / 2 < marginLeft) {
            tx = marginLeft + bgWidth / 2;
          } else if (tx + bgWidth / 2 > width - marginRight) {
            tx = width - marginRight - bgWidth / 2;
          }
          if (ty < marginTop) {
            ty = pt.screenY + 10 + bgHeight / 2; // place below the point if it goes off-top
          }

          tooltipBg
            .attr('x', -bgWidth / 2)
            .attr('y', -bgHeight / 2)
            .attr('width', bgWidth)
            .attr('height', bgHeight);

          tooltipText
            .attr('y', bbox.height / 4); // center text vertically

          hoverTooltip
            .attr('transform', `translate(${tx}, ${ty})`)
            .attr('display', 'block');
        } else {
          hoverCircle.attr('display', 'none');
          hoverTooltip.attr('display', 'none');
        }
      })
      .on('mouseleave', () => {
        hoverCircle.attr('display', 'none');
        hoverTooltip.attr('display', 'none');
      });
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
