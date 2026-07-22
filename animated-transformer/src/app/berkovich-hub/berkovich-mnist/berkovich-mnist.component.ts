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
import { MnistCanvasComponent } from './mnist-canvas.component';
import {
  BerkovichAffinoidMnistLearner,
  BerkovichMnistConfig
} from './models/berkovich-mnist-learner';
import { EuclideanMnistLearner } from './models/euclidean-mnist-learner';
import { PadicLinearMnistLearner } from './models/padic-linear-mnist-learner';
import {
  CANONICAL_MNIST_SAMPLES,
  generateSyntheticMnistDataset,
  loadRealMnistDataset,
  extractPatches,
  MnistSample
} from './models/mnist-data';
import {
  D3LineChartComponent,
  ChartConfig,
  defaultChartConfig,
  NamedChartPoint
} from '../../d3-line-chart/d3-line-chart.component';
import { BerkovichMnistWalkthroughComponent, MnistWalkthroughDetails } from './walkthrough-components/berkovich-mnist-walkthrough.component';
import { BerkovichMnistInspectorComponent } from './inspector-components/berkovich-mnist-inspector.component';

@Component({
  selector: 'app-berkovich-mnist',
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    RouterModule,
    MarkdownComponent,
    BerkovichHeaderComponent,
    MnistCanvasComponent,
    D3LineChartComponent,
    BerkovichMnistWalkthroughComponent,
    BerkovichMnistInspectorComponent
  ],
  templateUrl: './berkovich-mnist.component.html',
  styleUrls: ['./berkovich-mnist.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BerkovichMnistComponent implements OnInit, OnDestroy {
  readonly approach = signal<'berkovich-affinoid' | 'padic-linear' | 'euclidean-linear'>('berkovich-affinoid');
  readonly datasetSource = signal<'synthetic' | 'real'>('synthetic');
  readonly isLoadingRealMnist = signal<boolean>(false);

  readonly canvasTitleMarkdown = 'Handwritten Digit Input ($28 \\times 28$)';
  readonly probHeaderMarkdown = 'Class Probabilities ($\\pi_k$):';

  // Model parameters
  readonly prime = signal<number>(3);
  readonly embDim = signal<number>(5);
  readonly numConstraints = signal<number>(3);
  readonly gridSize = signal<number>(4);
  readonly learningRate = signal<number>(0.02);
  readonly regularizationTarget = signal<number>(0.04);
  readonly regularizationEmbed = signal<number>(0.02);
  readonly beta = signal<number>(1.0);
  readonly aggMode = signal<'min' | 'average'>('min');

  readonly digitsLeft = signal<number>(2);
  readonly digitsRight = signal<number>(2);

  // Input digit state
  readonly selectedDigit = signal<number>(0);
  readonly currentPixels = signal<number[]>(CANONICAL_MNIST_SAMPLES[0].pixels);

  // Models instances
  readonly berkovichModel = signal<BerkovichAffinoidMnistLearner | null>(null);
  readonly padicLinearModel = signal<PadicLinearMnistLearner | null>(null);
  readonly euclideanModel = signal<EuclideanMnistLearner | null>(null);

  // Training state
  readonly stepCount = signal<number>(0);
  readonly epochCount = signal<number>(0);
  readonly isAutoTraining = signal<boolean>(false);
  private autoTrainInterval: any = null;

  readonly dataset = signal<MnistSample[]>(generateSyntheticMnistDataset(100));

  // Loss and accuracy trajectories for chart
  readonly trainLossHistory = signal<NamedChartPoint[]>([]);
  readonly trainAccHistory = signal<NamedChartPoint[]>([]);

  readonly lossChartConfig: ChartConfig = {
    ...defaultChartConfig(),
    height: 180,
    xLabel: 'Steps',
    yLabel: 'Loss'
  };

  readonly accChartConfig: ChartConfig = {
    ...defaultChartConfig(),
    height: 180,
    xLabel: 'Steps',
    yLabel: 'Accuracy'
  };

  ngOnInit(): void {
    this.resetModel();
  }

  ngOnDestroy(): void {
    this.stopAutoTrain();
  }

  resetModel() {
    this.stopAutoTrain();
    this.stepCount.set(0);
    this.epochCount.set(0);
    this.trainLossHistory.set([]);
    this.trainAccHistory.set([]);

    const app = this.approach();
    if (app === 'berkovich-affinoid') {
      this.berkovichModel.set(new BerkovichAffinoidMnistLearner(this.embDim(), this.prime(), this.numConstraints(), this.gridSize()));
      this.padicLinearModel.set(null);
      this.euclideanModel.set(null);
    } else if (app === 'padic-linear') {
      this.padicLinearModel.set(new PadicLinearMnistLearner(this.embDim(), this.prime(), this.gridSize()));
      this.berkovichModel.set(null);
      this.euclideanModel.set(null);
    } else {
      this.euclideanModel.set(new EuclideanMnistLearner(this.gridSize()));
      this.berkovichModel.set(null);
      this.padicLinearModel.set(null);
    }
  }

  onApproachChange(newApp: 'berkovich-affinoid' | 'padic-linear' | 'euclidean-linear') {
    this.approach.set(newApp);
    this.resetModel();
  }

  async selectDatasetSource(source: 'synthetic' | 'real') {
    if (source === 'real') {
      this.isLoadingRealMnist.set(true);
      const samples = await loadRealMnistDataset(200);
      this.dataset.set(samples);
      this.datasetSource.set('real');
      this.isLoadingRealMnist.set(false);
      if (samples.length > 0) {
        this.selectedDigit.set(samples[0].digit);
        this.currentPixels.set(samples[0].pixels);
      }
    } else {
      this.dataset.set(generateSyntheticMnistDataset(100));
      this.datasetSource.set('synthetic');
    }
    this.resetModel();
  }

  loadRandomSampleFromDataset() {
    const data = this.dataset();
    if (!data || data.length === 0) return;
    const randomSample = data[Math.floor(Math.random() * data.length)];
    this.selectedDigit.set(randomSample.digit);
    this.currentPixels.set([...randomSample.pixels]);
  }

  onPixelsChange(newPixels: number[]) {
    this.currentPixels.set(newPixels);
  }

  onDigitPresetChange(digit: number) {
    this.selectedDigit.set(digit);
  }

  readonly currentPrediction = computed(() => {
    const pixels = this.currentPixels();
    const app = this.approach();
    const bModel = this.berkovichModel();
    const pModel = this.padicLinearModel();
    const eModel = this.euclideanModel();

    const config: BerkovichMnistConfig = {
      prime: this.prime(),
      embDim: this.embDim(),
      numConstraints: this.numConstraints(),
      gridSize: this.gridSize(),
      lr: this.learningRate(),
      reg: this.regularizationTarget(),
      regEmbed: this.regularizationEmbed(),
      beta: this.beta(),
      aggMode: this.aggMode()
    };

    if (app === 'berkovich-affinoid' && bModel) {
      const fwd = bModel.forward(pixels, config);
      const predDigit = fwd.probs.indexOf(Math.max(...fwd.probs));
      return { probs: fwd.probs, logits: fwd.logits, predDigit, fwd };
    } else if (app === 'padic-linear' && pModel) {
      const fwd = pModel.forward(pixels, config as any);
      const predDigit = fwd.probs.indexOf(Math.max(...fwd.probs));
      return { probs: fwd.probs, logits: fwd.logits, predDigit, fwd };
    } else if (eModel) {
      const fwd = eModel.forward(pixels, config as any);
      const predDigit = fwd.probs.indexOf(Math.max(...fwd.probs));
      return { probs: fwd.probs, logits: fwd.logits, predDigit, fwd };
    }

    return null;
  });

  readonly walkthroughDetails = computed<MnistWalkthroughDetails | null>(() => {
    const pred = this.currentPrediction();
    if (!pred) return null;

    const pixels = this.currentPixels();
    const patchMeans = extractPatches(pixels, this.gridSize());
    const vocab = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

    const scores = vocab.map((char, k) => ({
      digit: k,
      finalScore: pred.logits[k]
    }));

    const sortedScores = [...scores].sort((a, b) => b.finalScore - a.finalScore);
    const expScores = pred.logits.map(l => Math.exp(this.beta() * l));
    const sumExp = expScores.reduce((a, b) => a + b, 0);

    const predictions = pred.probs.map((prob, idx) => ({
      char: `${idx}`,
      prob,
      score: pred.logits[idx],
      expScore: expScores[idx]
    })).sort((a, b) => b.prob - a.prob);

    const aggregated = (pred.fwd as any).H ? (pred.fwd as any).H.map((disk: any, dim: number) => ({
      dim,
      center: disk.center,
      rho: disk.rho,
      val: typeof disk === 'number' ? disk : undefined
    })) : [];

    return {
      type: this.approach() === 'euclidean-linear' ? 'euclidean' : 'berkovich',
      digit: this.selectedDigit(),
      patchMeans,
      aggregated,
      scores: sortedScores,
      predictions,
      sumExp
    };
  });

  stepTrain() {
    const data = this.dataset();
    const app = this.approach();
    const bModel = this.berkovichModel();
    const pModel = this.padicLinearModel();
    const eModel = this.euclideanModel();

    const config: BerkovichMnistConfig = {
      prime: this.prime(),
      embDim: this.embDim(),
      numConstraints: this.numConstraints(),
      gridSize: this.gridSize(),
      lr: this.learningRate(),
      reg: this.regularizationTarget(),
      regEmbed: this.regularizationEmbed(),
      beta: this.beta(),
      aggMode: this.aggMode()
    };

    const batch = data.map(s => ({ pixels: s.pixels, digit: s.digit }));
    let res = { loss: 0, accuracy: 0 };

    if (app === 'berkovich-affinoid' && bModel) {
      res = bModel.trainBatch(batch, config);
    } else if (app === 'padic-linear' && pModel) {
      res = pModel.trainBatch(batch, config as any);
    } else if (eModel) {
      res = eModel.trainBatch(batch, config as any);
    }

    const nextStep = this.stepCount() + 1;
    this.stepCount.set(nextStep);
    this.epochCount.set(Math.floor(nextStep / 5));

    this.trainLossHistory.update(h => [...h, { x: nextStep, y: res.loss, name: 'Train Loss' }]);
    this.trainAccHistory.update(h => [...h, { x: nextStep, y: res.accuracy, name: 'Train Accuracy' }]);
  }

  trainEpochs(count: number = 5) {
    for (let i = 0; i < count; i++) {
      this.stepTrain();
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
