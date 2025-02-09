import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import {
  D3LineChartComponent,
  LineChartConfig,
  NamedChartPoint,
} from 'src/app/d3-line-chart/d3-line-chart.component';
import { Section } from 'src/lib/weblab/section';

@Component({
  selector: 'app-simple-chart',
  imports: [D3LineChartComponent],
  templateUrl: './simple-chart.component.html',
  styleUrl: './simple-chart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SimpleChartComponent {
  section = input.required<Section>();

  data: NamedChartPoint[] = [];
  config: LineChartConfig = {};
}
