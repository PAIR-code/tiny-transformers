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


import { AfterViewInit, Component, OnInit } from '@angular/core';

import * as tf from '@tensorflow/tfjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { computeTransformer, initDecoderParams } from '../../lib/transformer/transformer_gtensor';
import * as gtensor from '../../lib/gtensor/gtensor';
import { gtensorTrees } from '../../lib/gtensor/gtensor_tree';
import { stringifyJsonValue } from '../../lib/pretty_json/pretty_json';
import { transformer } from 'src/lib';
import { Router, ActivatedRoute, ParamMap } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { BasicLmTask, BasicLmTaskUpdate } from 'src/lib/seqtasks/util';

import { MatButtonModule } from '@angular/material/button';

const MLP_ACT_SIZE = 8;
const DICTIONARY_MULTIPLIER = 4;
const D_HIDDEN = MLP_ACT_SIZE * DICTIONARY_MULTIPLIER; // learned feature size
const L1_COEFF = 0.003;

@Component({
    selector: 'app-sae',
    standalone: true,
    templateUrl: './sae.component.html',
    styleUrls: ['./sae.component.scss'],
    imports: [CommonModule, MatButtonModule, FormsModule],
})
export class SAEComponent {
    status: string = '';
    public saeModel: any;
    public trainingData: any;
    public trainingInputs: any;
    public trained = false;
    learnedFeatureActivationFrequencies: number[] = [];
    averageLearnedFeatureActivationFrequency: number = 0;
    predictedDictionaryFeatures: any;
    topActivationsForUserInputFeature: any;
    userInput: any;
    constructor(
        private route: ActivatedRoute,
        private router: Router,
      ) { }

    uploadTrainingData(event: Event) {
        const file = (event.target as any).files[0];

        const reader = new FileReader();
        reader.onload = (progressEvent) => {
            const fileContents = progressEvent.target!.result;
            try {
                const jsonData = JSON.parse(fileContents as string);
                this.trainingData = jsonData;
            } catch (error) {
                console.error(error)
            }
        }

        reader.readAsText(file);
    }

    async interpret() {
        const activationsForFeatureToInspect = Array.from(
            this.predictedDictionaryFeatures.slice([0, this.userInput], [-1, 1]).dataSync());
        const indexedActivations = activationsForFeatureToInspect.map((value, index) => ({ value, index }));
        indexedActivations.sort((a: any, b: any) => {
            if (a.value < b.value) {
                return 1;
            }
            return -1;
        });

        const nTop = 50;
        this.topActivationsForUserInputFeature = indexedActivations
            .slice(0, nTop).map((item: any) => {
                const trainingInput = this.trainingInputs[item.index];
                return {
                    'value': item.value,
                    ...trainingInput
                };
            });
    }

    async train() {
        tf.util.shuffle(this.trainingData);

        // For each sequence, create a dict out of each token in that sequence with metadata (the token itself, its index in the sequence, and the sequence).
        this.trainingInputs = this.trainingData.map((item: any) => 
            item.input.map((d: any, i: number) => ({
                'token': d,
                'sequence': item.input,
                'tokenPos': i
            })))
            .reduce((acc: any, curr: any) => acc.concat(curr), []); // flatten.

        this.trainingData = tf.concat(this.trainingData
            .map((item: any) => tf.tensor(item.mlpOutputs.data, item.mlpOutputs.shape).squeeze()));
        const nTrainingData = this.trainingData.shape[0];

        const inputs = tf.input({
            shape: [MLP_ACT_SIZE],
            name: 'sae_input'
        });
        // const inputBias = tf.input({
        //     shape: [MLP_ACT_SIZE],
        //     name: 'sae_input_bias'
        // });
        // const biasedInput = tf.layers.add().apply([inputs, inputBias]);
        const dictionaryFeatures = tf.layers.dense({
            units: D_HIDDEN,
            useBias: true,
            activation: 'relu',
        }).apply(inputs) as any;
        const reconstruction = tf.layers.dense({
            units: MLP_ACT_SIZE,
            useBias: true,
        }).apply(dictionaryFeatures) as any;

        // Adding a layer to concatenate dictionaryFeatures to the reconstruction as final output so both are available in the loss function as yPred, because intermediate dictionaryFeatures are needed to compute L1 loss term.
        // Alternatives tried:
        // - Retrieving intermediate output in the loss function - couldn't figure out how to retrieve as a non-symbolic tensor
        // - Outputting multiple tensors in the model - but yPred in the loss function is still only the first output tensor
        const combinedOutput = tf.layers.concatenate({axis: 1}).apply([dictionaryFeatures, reconstruction]) as any;
        this.saeModel = tf.model({inputs: [inputs], outputs: [combinedOutput]});

        this.saeModel.compile({
            optimizer: tf.train.adam(),
            loss: (yTrue: tf.Tensor, yPred: tf.Tensor) => {
                const outputDictionaryFeatures = yPred.slice([0, 0], [-1, D_HIDDEN]);
                const outputReconstruction = yPred.slice([0, D_HIDDEN], [-1, -1]);
                const trueReconstruction = yTrue.slice([0, D_HIDDEN], [-1, -1]);

                const l2Loss = tf.losses.meanSquaredError(trueReconstruction, outputReconstruction);
                const l1Loss = tf.mul(L1_COEFF, tf.sum(tf.abs(outputDictionaryFeatures)));
                return tf.add(l2Loss, l1Loss);
            },
        });

        const epochSize = 8;
        // This tensor is unused - it's just to make yTrue shape match the concatenated output.
        const placeholderDictionaryFeatures = tf.randomNormal([epochSize, D_HIDDEN]);
        for (let i=0; i<Math.floor(nTrainingData / epochSize); i++) {
            const epoch = this.trainingData.slice(i * epochSize, Math.min(epochSize, nTrainingData - i * epochSize));
            let epochPlaceholderDictionaryFeatures = placeholderDictionaryFeatures;
            if (epochPlaceholderDictionaryFeatures.shape[0] !== epoch.shape[0]) {
                epochPlaceholderDictionaryFeatures = tf.randomNormal([epoch.shape[0], D_HIDDEN]);
            }
            const h = await this.saeModel.fit(epoch, tf.concat([epochPlaceholderDictionaryFeatures, epoch], 1), {
                batchSize: 8,
                epochs: 3
            });
            const status = "Loss after Epoch " + i + ": " + h.history['loss'][0];
            this.status = status;
        }
        this.status += ' - Done.';
        this.trained = true;
        
        // Print average feature activations.
        const evaluations = this.saeModel.predict(this.trainingData);
        this.predictedDictionaryFeatures = evaluations.slice([0, 0], [-1, D_HIDDEN]);

        let frequencyScores = tf.zeros([D_HIDDEN]);
        for (let i=0; i<nTrainingData; i++) {
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

