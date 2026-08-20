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
  OnInit,
  OnDestroy,
  signal,
  computed,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { MarkdownComponent } from 'ngx-markdown';

import { BerkovichHeaderComponent } from '../berkovich-header/berkovich-header.component';
import {
  BerkovichBooleanLearner,
  BerkovichBooleanConfig,
  PRESET_BOOLEAN_FUNCTIONS,
  buildBooleanDataset,
  BooleanSample
} from './models/berkovich-boolean-learner';
import { DnfVisCardComponent } from './dnf-vis-card.component';
import { BerkovichBooleanWalkthroughComponent } from './walkthrough-components/berkovich-boolean-walkthrough.component';
import {
  D3LineChartComponent,
  ChartConfig,
  defaultChartConfig,
  NamedChartPoint
} from '../../d3-line-chart/d3-line-chart.component';

@Component({
  selector: 'app-berkovich-boolean',
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    RouterModule,
    MarkdownComponent,
    BerkovichHeaderComponent,
    DnfVisCardComponent,
    BerkovichBooleanWalkthroughComponent,
    D3LineChartComponent
  ],
  templateUrl: './berkovich-boolean.component.html',
  styleUrls: ['./berkovich-boolean.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'closePopup()' }
})
export class BerkovichBooleanComponent implements OnInit, OnDestroy {
  readonly presets = PRESET_BOOLEAN_FUNCTIONS;
  readonly selectedPresetIndex = signal<number>(0);

  // Active popup for hyper-parameter info popups
  readonly activePopup = signal<string | null>(null);

  // Hyper-parameters
  readonly numVars = signal<number>(2);
  readonly prime = signal<number>(2);
  readonly numPools = signal<number>(4); // M = 4 pools default for universal circuit coverage
  readonly learningRate = signal<number>(0.05);
  readonly regularization = signal<number>(0.01);
  readonly beta = signal<number>(2.0);
  readonly targetInitMode = signal<'pre-fixed-leaves' | 'random'>('pre-fixed-leaves');
  readonly poolInitMode = signal<'separated-branches' | 'random'>('separated-branches');
  readonly repulsionReg = signal<number>(0.02);
  readonly targetCenterMode = signal<'fixed' | 'gradient' | 'repulsion' | 'combined'>('fixed');

  // Learner & Dataset
  readonly learner = signal<BerkovichBooleanLearner | null>(null);
  readonly truthTable = signal<number[]>([...PRESET_BOOLEAN_FUNCTIONS[0].truthTable]);
  readonly dataset = computed<BooleanSample[]>(() => buildBooleanDataset(this.truthTable(), this.numVars()));

  // Training state
  readonly stepCount = signal<number>(0);
  readonly epochCount = signal<number>(0);
  readonly isAutoTraining = signal<boolean>(false);
  private autoTrainInterval: any = null;

  readonly trainLossHistory = signal<NamedChartPoint[]>([]);
  readonly trainAccHistory = signal<NamedChartPoint[]>([]);

  readonly chartPoints = computed<NamedChartPoint[]>(() => {
    return [...this.trainLossHistory(), ...this.trainAccHistory()];
  });

  readonly chartConfig = computed<ChartConfig>(() => {
    const defaultConfig = defaultChartConfig();
    return {
      ...defaultConfig,
      height: 220,
      xLabel: 'Steps',
      yLabel: 'Loss',
      yTickFormat: '.2f',
      xTickFormat: 'd',
      legendX: 280,
      legendY: 10,
      rightYLabel: 'Accuracy',
      rightYLineNames: ['Train Accuracy'],
      rightYDomain: [0.0, 1.0]
    };
  });

  readonly descriptionMarkdown =
    'This visualizer demonstrates learning arbitrary **Boolean Functions** ($f(x_1, x_2) \\to \\{0, 1\\}$) in Berkovich space using **DNF Affinoid Domain Pools** and **2-adic Binary Search Encodings**.';

  ngOnInit(): void {
    this.resetModel();
  }

  ngOnDestroy(): void {
    this.stopAutoTrain();
  }

  selectPreset(index: number) {
    this.selectedPresetIndex.set(index);
    const preset = this.presets[index];
    this.numVars.set(preset.numVars);
    this.truthTable.set([...preset.truthTable]);
    if (this.numPools() < 4) {
      this.numPools.set(4);
    }
    this.resetModel();
  }

  toggleTruthTableBit(index: number) {
    this.truthTable.update((table) => {
      const copy = [...table];
      copy[index] = copy[index] === 1 ? 0 : 1;
      return copy;
    });
    this.resetModel();
  }

  readonly trainTick = signal<number>(0);

  resetModel() {
    this.stopAutoTrain();
    this.stepCount.set(0);
    this.epochCount.set(0);
    this.trainLossHistory.set([]);
    this.trainAccHistory.set([]);

    const model = new BerkovichBooleanLearner(
      this.numVars(),
      this.numPools(),
      this.prime(),
      this.targetInitMode(),
      this.poolInitMode()
    );
    this.learner.set(model);
    this.trainTick.update((n) => n + 1);
  }

  closePopup() {
    this.activePopup.set(null);
  }

  togglePopup(id: string, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    if (this.activePopup() === id) {
      this.activePopup.set(null);
    } else {
      this.activePopup.set(id);
    }
  }

  parseNumberInput(val: string): number {
    const normalized = (val || '').replace(',', '.');
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? 0 : parsed;
  }

  getConfig(): BerkovichBooleanConfig {
    return {
      prime: this.prime(),
      numPools: this.numPools(),
      lr: this.learningRate(),
      reg: this.regularization(),
      beta: this.beta(),
      targetInitMode: this.targetInitMode(),
      poolInitMode: this.poolInitMode(),
      repulsionReg: this.repulsionReg(),
      targetCenterMode: this.targetCenterMode(),
      updateTargetCenters: this.targetCenterMode() !== 'fixed'
    };
  }

  readonly modelConfig = computed<BerkovichBooleanConfig>(() => this.getConfig());

  readonly currentPredictions = computed(() => {
    this.trainTick();
    const l = this.learner();
    const data = this.dataset();
    if (!l) return [];
    const config = this.getConfig();

    return data.map((sample) => {
      const fwd = l.forward(sample.inputs, config);
      const pred = fwd.probs[1] >= fwd.probs[0] ? 1 : 0;
      return {
        inputs: sample.inputs,
        target: sample.target,
        label: sample.label,
        pred,
        prob1: fwd.probs[1],
        fwd
      };
    });
  });

  readonly currentAccuracy = computed(() => {
    const history = this.trainAccHistory();
    if (history.length === 0) return 0;
    return history[history.length - 1].y;
  });

  stepTrain() {
    const l = this.learner();
    const data = this.dataset();
    if (!l) return;
    const config = this.getConfig();

    const res = l.trainBatch(data, config);

    const nextStep = this.stepCount() + 1;
    this.stepCount.set(nextStep);
    this.epochCount.set(Math.floor(nextStep / 5));

    this.trainLossHistory.update((h) => [...h, { x: nextStep, y: res.loss, name: 'Train Loss' }]);
    this.trainAccHistory.update((h) => [...h, { x: nextStep, y: res.accuracy, name: 'Train Accuracy' }]);
    this.trainTick.update((n) => n + 1);

    // Stop auto-training automatically once 100% accuracy is reached
    if (res.accuracy >= 0.9999 && this.isAutoTraining()) {
      this.stopAutoTrain();
    }
  }

  trainSteps(count: number = 5) {
    for (let i = 0; i < count; i++) {
      this.stepTrain();
      const lastAcc = this.trainAccHistory();
      if (lastAcc.length > 0 && lastAcc[lastAcc.length - 1].y >= 0.9999) {
        break;
      }
    }
  }

  toggleAutoTrain() {
    if (this.isAutoTraining()) {
      this.stopAutoTrain();
    } else {
      this.startAutoTrain();
    }
  }

  startAutoTrain() {
    this.isAutoTraining.set(true);
    this.autoTrainInterval = setInterval(() => {
      this.stepTrain();
    }, 150);
  }

  stopAutoTrain() {
    this.isAutoTraining.set(false);
    if (this.autoTrainInterval) {
      clearInterval(this.autoTrainInterval);
      this.autoTrainInterval = null;
    }
  }
}
