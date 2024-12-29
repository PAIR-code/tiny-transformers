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

import { Component } from '@angular/core';

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
  public trainingData: any;
  public trainingInputs: any;
  public trained = false;
  learnedFeatureActivationFrequencies: number[] = [];
  averageLearnedFeatureActivationFrequency: number = 0;
  predictedDictionaryFeatures: any;
  topActivationsForUserInputFeature: any;
  sampleData = (sampleData as any).default;
  useUploadedTrainingData = false;
  useSampleTrainingData = false;
  lossPoints: NamedChartPoint[] = [];

  mlpActivationSize = 1;

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
    return this.mlpActivationSize * parseInt(this.dictionaryMultiplier.value);
  }
  selectSample() {
    if (this.trained) return;
    this.trainingData = this.sampleData;
    this.useSampleTrainingData = true;
    this.useUploadedTrainingData = false;
  }
  selectUpload() {
    if (this.trained) return;
    this.useUploadedTrainingData = true;
    this.useSampleTrainingData = false;
    this.trainingData = null;
  }
  uploadTrainingData(event: Event) {
    const file = (event.target as any).files[0];

    const reader = new FileReader();
    reader.onload = (progressEvent) => {
      const fileContents = progressEvent.target!.result;
      try {
        const jsonData = JSON.parse(fileContents as string);
        this.trainingData = jsonData;
      } catch (error) {
        console.error(error);
      }
    };

    reader.readAsText(file);
  }

  async interpret() {
    const activationsForFeatureToInspect = Array.from(
      this.predictedDictionaryFeatures
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
    this.topActivationsForUserInputFeature = indexedActivations.slice(0, nTop).map((item: any) => {
      const trainingInput = this.trainingInputs[item.index];
      return {
        value: item.value,
        ...trainingInput,
      };
    });
  }

  async train() {
    tf.util.shuffle(this.trainingData);

    // For each sequence, create a dict out of each token in that sequence with metadata (the token itself, its index in the sequence, and the sequence).
    this.trainingInputs = this.trainingData
      .map((item: any) =>
        item.input.map((d: any, i: number) => ({
          token: d,
          sequence: item.input,
          tokenPos: i,
        })),
      )
      .reduce((acc: any, curr: any) => acc.concat(curr), []); // flatten.

    const mlpOutputsShape = this.trainingData[0]['mlpOutputs']['shape'];
    this.mlpActivationSize = mlpOutputsShape[mlpOutputsShape.length - 1];
    const dHidden = this.getDHidden();

    this.trainingData = tf.concat(
      this.trainingData.map((item: any) =>
        tf.tensor(item.mlpOutputs.data, item.mlpOutputs.shape).squeeze(),
      ),
    );
    const nTrainingData = this.trainingData.shape[0];

    const inputs = tf.input({
      shape: [this.mlpActivationSize],
      name: 'sae_input',
    });
    // const inputBias = tf.input({
    //     shape: [this.mlpActivationSize],
    //     name: 'sae_input_bias'
    // });
    // const biasedInput = tf.layers.add().apply([inputs, inputBias]);
    const dictionaryFeatures = tf.layers
      .dense({
        units: dHidden,
        useBias: true,
        activation: 'relu',
      })
      .apply(inputs) as any;
    const reconstruction = tf.layers
      .dense({
        units: this.mlpActivationSize,
        useBias: true,
      })
      .apply(dictionaryFeatures) as any;

    // Adding a layer to concatenate dictionaryFeatures to the reconstruction as final output so both are available in the loss function as yPred, because intermediate dictionaryFeatures are needed to compute L1 loss term.
    // Alternatives tried:
    // - Retrieving intermediate output in the loss function - couldn't figure out how to retrieve as a non-symbolic tensor
    // - Outputting multiple tensors in the model - but yPred in the loss function is still only the first output tensor
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

    // This tensor is unused - it's just to make yTrue shape match the concatenated output.
    const batchSize = parseInt(this.batchSize.value);
    const placeholderDictionaryFeatures = tf.randomNormal([batchSize, dHidden]);
    for (let i = 0; i < Math.floor(nTrainingData / batchSize); i++) {
      const batch = this.trainingData.slice(
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
      this.lossPoints = this.lossPoints.concat([{ x: i, y: h.history['loss'][0], name: 'Loss' }]);
    }
    this.trained = true;

    // Print average feature activations.
    const evaluations = this.saeModel.predict(this.trainingData);
    this.predictedDictionaryFeatures = evaluations.slice([0, 0], [-1, dHidden]);

    let frequencyScores = tf.zeros([dHidden]);
    for (let i = 0; i < nTrainingData; i++) {
      const activations = this.predictedDictionaryFeatures.slice([i, 0], [1, -1]).squeeze();
      const isNonzero = tf.cast(activations.abs().greater(tf.zeros(activations.shape)), 'int32');
      frequencyScores = frequencyScores.add(isNonzero);
    }

    frequencyScores = frequencyScores.div(nTrainingData);
    // How often does this feature activate?
    this.averageLearnedFeatureActivationFrequency = tf.mean(frequencyScores).dataSync()[0];
    this.learnedFeatureActivationFrequencies = Array.from(frequencyScores.dataSync());
  }
}
