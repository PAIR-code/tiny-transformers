/* Copyright 2024 Google LLC. All Rights Reserved.

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

import { Component, ChangeDetectionStrategy, signal, WritableSignal } from '@angular/core';

import * as tf from '@tensorflow/tfjs';

import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormControl } from '@angular/forms';
import { Router, ActivatedRoute, ParamMap } from '@angular/router';
import {
  D3LineChartComponent,
  NamedChartPoint,
} from 'src/app/d3-line-chart/d3-line-chart.component';

import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import * as sampleData from './sae_sample_data_boundary.json';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-sae',
  templateUrl: './sae.component.html',
  styleUrls: ['./sae.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatFormFieldModule,
    D3LineChartComponent,
    MatButtonModule,
    FormsModule,
    MatInputModule,
    ReactiveFormsModule,
  ],
})
export class SAEComponent {
  public saeModel: any;
  readonly trainingData = signal<any>(null);
  readonly trainingInputs = signal<any>(null);
  readonly trained = signal<boolean>(false);
  readonly learnedFeatureActivationFrequencies = signal<number[]>([]);
  readonly averageLearnedFeatureActivationFrequency = signal<number>(0);
  readonly predictedDictionaryFeatures = signal<any>(null);
  readonly topActivationsForUserInputFeature = signal<any>(null);
  readonly sampleData = (sampleData as any).default;
  readonly useUploadedTrainingData = signal<boolean>(false);
  readonly useSampleTrainingData = signal<boolean>(false);
  readonly lossPoints = signal<NamedChartPoint[]>([]);

  readonly mlpActivationSize = signal<number>(1);

  dictionaryMultiplier: FormControl<string>;
  l1Coeff: FormControl<string>;
  batchSize: FormControl<string>;
  epochs: FormControl<string>;

  neuronIndexToInspect: FormControl<string>;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
  ) {
    this.dictionaryMultiplier = new FormControl('4') as FormControl<string>;
    this.l1Coeff = new FormControl('0.003') as FormControl<string>;
    this.batchSize = new FormControl('8') as FormControl<string>;
    this.epochs = new FormControl('3') as FormControl<string>;
    this.neuronIndexToInspect = new FormControl('0') as FormControl<string>;
  }

  getDHidden() {
    return this.mlpActivationSize() * parseInt(this.dictionaryMultiplier.value);
  }

  selectSample() {
    if (this.trained()) return;
    this.trainingData.set(this.sampleData);
    this.useSampleTrainingData.set(true);
    this.useUploadedTrainingData.set(false);
  }

  selectUpload() {
    if (this.trained()) return;
    this.useUploadedTrainingData.set(true);
    this.useSampleTrainingData.set(false);
    this.trainingData.set(null);
  }

  uploadTrainingData(event: Event) {
    const file = (event.target as any).files[0];

    const reader = new FileReader();
    reader.onload = (progressEvent) => {
      const fileContents = progressEvent.target!.result;
      try {
        const jsonData = JSON.parse(fileContents as string);
        this.trainingData.set(jsonData);
      } catch (error) {
        console.error(error);
      }
    };

    reader.readAsText(file);
  }

  async interpret() {
    const predicted = this.predictedDictionaryFeatures();
    if (!predicted) return;

    const activationsForFeatureToInspect = Array.from(
      predicted
        .slice([0, parseInt(this.neuronIndexToInspect.value)], [-1, 1])
        .dataSync(),
    );
    const indexedActivations = activationsForFeatureToInspect.map((value, index) => ({
      value,
      index,
    }));
    indexedActivations.sort((a: any, b: any) => {
      if (a.value < b.value) {
        return 1;
      }
      return -1;
    });

    const nTop = 50;
    const inputs = this.trainingInputs();
    this.topActivationsForUserInputFeature.set(
      indexedActivations.slice(0, nTop).map((item: any) => {
        const trainingInput = inputs[item.index];
        return {
          value: item.value,
          ...trainingInput,
        };
      })
    );
  }

  async train() {
    const rawTrainingData = [...this.trainingData()];
    tf.util.shuffle(rawTrainingData);

    // For each sequence, create a dict out of each token in that sequence with metadata (the token itself, its index in the sequence, and the sequence).
    const mappedInputs = rawTrainingData
      .map((item: any) =>
        item.input.map((d: any, i: number) => ({
          token: d,
          sequence: item.input,
          tokenPos: i,
        })),
      )
      .reduce((acc: any, curr: any) => acc.concat(curr), []); // flatten.
    this.trainingInputs.set(mappedInputs);

    const mlpOutputsShape = rawTrainingData[0]['mlpOutputs']['shape'];
    this.mlpActivationSize.set(mlpOutputsShape[mlpOutputsShape.length - 1]);
    const dHidden = this.getDHidden();

    const concatenatedTrainingData = tf.concat(
      rawTrainingData.map((item: any) =>
        tf.tensor(item.mlpOutputs.data, item.mlpOutputs.shape).squeeze(),
      ),
    );
    const nTrainingData = concatenatedTrainingData.shape[0];

    const inputs = tf.input({
      shape: [this.mlpActivationSize()],
      name: 'sae_input',
    });

    const dictionaryFeatures = tf.layers
      .dense({
        units: dHidden,
        useBias: true,
        activation: 'relu',
      })
      .apply(inputs) as any;
    const reconstruction = tf.layers
      .dense({
        units: this.mlpActivationSize(),
        useBias: true,
      })
      .apply(dictionaryFeatures) as any;

    const combinedOutput = tf.layers
      .concatenate({ axis: 1 })
      .apply([dictionaryFeatures, reconstruction]) as any;
    this.saeModel = tf.model({ inputs: [inputs], outputs: [combinedOutput] });

    this.saeModel.compile({
      optimizer: tf.train.adam(),
      loss: (yTrue: tf.Tensor, yPred: tf.Tensor) => {
        const outputDictionaryFeatures = yPred.slice([0, 0], [-1, dHidden]);
        const outputReconstruction = yPred.slice([0, dHidden], [-1, -1]);
        const trueReconstruction = yTrue.slice([0, dHidden], [-1, -1]);

        const l2Loss = tf.losses.meanSquaredError(trueReconstruction, outputReconstruction);
        const l1Loss = tf.mul(
          parseFloat(this.l1Coeff.value),
          tf.sum(tf.abs(outputDictionaryFeatures)),
        );
        return tf.add(l2Loss, l1Loss);
      },
    });

    const batchSize = parseInt(this.batchSize.value);
    const placeholderDictionaryFeatures = tf.randomNormal([batchSize, dHidden]);
    let currentLossPoints: NamedChartPoint[] = [];
    
    for (let i = 0; i < Math.floor(nTrainingData / batchSize); i++) {
      const batch = concatenatedTrainingData.slice(
        i * batchSize,
        Math.min(batchSize, nTrainingData - i * batchSize),
      );
      let batchPlaceholderDictionaryFeatures = placeholderDictionaryFeatures;
      if (batchPlaceholderDictionaryFeatures.shape[0] !== batch.shape[0]) {
        batchPlaceholderDictionaryFeatures = tf.randomNormal([batch.shape[0], dHidden]);
      }
      const h = await this.saeModel.fit(
        batch,
        tf.concat([batchPlaceholderDictionaryFeatures, batch], 1),
        {
          batchSize: batchSize,
          epochs: parseInt(this.epochs.value),
        },
      );
      currentLossPoints = currentLossPoints.concat([{ x: i, y: h.history['loss'][0], name: 'Loss' }]);
      this.lossPoints.set(currentLossPoints);
    }
    this.trained.set(true);

    // Print average feature activations.
    const evaluations = this.saeModel.predict(concatenatedTrainingData);
    const predicted = evaluations.slice([0, 0], [-1, dHidden]);
    this.predictedDictionaryFeatures.set(predicted);

    let frequencyScores = tf.zeros([dHidden]);
    for (let i = 0; i < nTrainingData; i++) {
      const activations = predicted.slice([i, 0], [1, -1]).squeeze();
      const isNonzero = tf.cast(activations.abs().greater(tf.zeros(activations.shape)), 'int32');
      frequencyScores = frequencyScores.add(isNonzero);
    }

    frequencyScores = frequencyScores.div(nTrainingData);
    this.averageLearnedFeatureActivationFrequency.set(tf.mean(frequencyScores).dataSync()[0]);
    this.learnedFeatureActivationFrequencies.set(Array.from(frequencyScores.dataSync()));
  }
}
