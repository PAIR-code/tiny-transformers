import { ChangeDetectionStrategy, Component, input, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import {
  D3LineChartComponent,
  LineChartConfig,
  NamedChartPoint,
} from 'src/app/d3-line-chart/d3-line-chart.component';
import { addIcons } from 'src/app/icon-registry';
import { Metrics } from 'src/lib/distr-signals/cell-kind';
import { SetableUpdateKind } from 'src/lib/signalspace/setable-node';
import { AbstractSignal, defined } from 'src/lib/signalspace/signalspace';
import { Section } from 'src/lib/weblab/section';

function lenEqual<T>(a: T[], b: T[]) {
  return a === b && a.length === b.length;
}

@Component({
  selector: 'app-simple-chart',
  imports: [D3LineChartComponent, MatButtonModule, MatIconModule, MatMenuModule],
  templateUrl: './simple-chart.component.html',
  styleUrl: './simple-chart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SimpleChartComponent implements OnInit {
  section = input.required<Section>();
  data = signal<NamedChartPoint[]>([]);
  config = signal<LineChartConfig>({});
  metrics!: AbstractSignal<Metrics<'entropyLoss' | 'accuracy'> | null>;

  constructor() {
    addIcons(['more_vert']);
  }

  ngOnInit() {
    console.log(`SimpleChartComponent`, this.section().defData());
    this.metrics = this.section().inStream['metrics'].lastValue;
    this.section().space.derived(() => {
      const m = this.metrics();
      if (!m) {
        return;
      }
      const newPoints: NamedChartPoint[] = [];
      for (const n of Object.keys(m.values) as ('entropyLoss' | 'accuracy')[]) {
        const p = {
          x: m.batchId,
          y: m.values[n],
          name: n,
        };
        newPoints.push(p);
      }
      this.section().outputs['metricsSummary'].update((old) => old.concat(...newPoints), {
        updateStrategy: SetableUpdateKind.ForceUpdate,
      });
    });

    this.section().space.derived(() => this.data.set(this.section().outputs['metricsSummary']()));
  }

  clear() {
    this.data.set([]);
  }
}
