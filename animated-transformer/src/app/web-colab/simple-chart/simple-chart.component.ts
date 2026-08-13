/**
 * @license
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ChangeDetectionStrategy, Component, input, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import {
  D3LineChartComponent,
  ChartConfig,
  NamedChartPoint,
} from 'src/app/d3-line-chart/d3-line-chart.component';
import { addIcons } from 'src/app/icon-registry';
import { Metrics } from 'src/lib/distr-signals/cell-kind';
import { SetableUpdateKind } from 'src/lib/signalspace/setable-node';
import { AbstractSignal, defined, SetableSignal } from 'src/lib/signalspace/signalspace';
import { Section } from 'src/lib/weblab/section';

function lenEqual<T>(a: T[], b: T[]) {
  return a === b && a.length === b.length;
}

const graphDataId = 'graphData';
type GraphData = {
  points: NamedChartPoint[];
  config?: ChartConfig;
};

function initGraphData(): GraphData {
  return { points: [] };
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
  secOutGraphData!: SetableSignal<GraphData>;
  secInMetrics!: AbstractSignal<Metrics<string> | null>;

  // set from secOutGraphData
  graphData = signal<GraphData>(initGraphData());

  constructor() {
    addIcons(['more_vert']);
  }

  ngOnInit() {
    this.secInMetrics = this.section().inStream['metrics'].signal;
    this.secOutGraphData = this.section().outputs[graphDataId];

    this.section().space.derived(() => {
      const m = this.secInMetrics();
      if (!m) {
        return;
      }
      const newPoints: NamedChartPoint[] = [];
      for (const n of Object.keys(m.values)) {
        const p = {
          x: m.batchId,
          y: m.values[n],
          name: n,
        };
        newPoints.push(p);
      }
      const latestGraphData = this.secOutGraphData.lastValue() || initGraphData();
      this.secOutGraphData.set(latestGraphData);
      this.secOutGraphData.change((d) => (d.points = d.points.concat(...newPoints)));
    });

    this.section().space.derived(() => {
      this.graphData.set({ ...(this.secOutGraphData() || initGraphData()) });
    });
  }

  updateChartConfig(newChartConfig: ChartConfig) {
    this.secOutGraphData.change((d) => (d.config = newChartConfig));
  }

  clear() {
    this.section().outputs[graphDataId].set(initGraphData());
  }
}
