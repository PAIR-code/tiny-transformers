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


import { AfterViewInit, Component, OnInit } from '@angular/core';

import * as tf from '@tensorflow/tfjs';
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

@Component({
    selector: 'app-sae',
    templateUrl: './sae.component.html',
    styleUrls: ['./sae.component.scss']
})
export class SAEComponent {
    status: string = '';
    public trainingData: any;
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

    async train() {
        tf.util.shuffle(this.trainingData);

        const nTrainingData = this.trainingData.length;
        const trueActivations = tf.concat(this.trainingData
            .map((item: any) => tf.tensor(item.mlpOutputs.data, item.mlpOutputs.shape).squeeze()));
        
        const mlpActSize = 8;
        const dictionaryMultiplier = 4;
        const dHidden = mlpActSize * dictionaryMultiplier; // learned feature size
        const l1Coeff = 0.0003;

        const inputs = tf.input({
            shape: [mlpActSize],
            name: 'sae_input'
        });
        // const inputBias = tf.input({
        //     shape: [mlpActSize],
        //     name: 'sae_input_bias'
        // });
        // const biasedInput = tf.layers.add().apply([inputs, inputBias]);
        const activations = tf.layers.dense({
            units: dHidden,
            useBias: true,
            activation: 'relu',
        }).apply(inputs) as any;
        const reconstruction = tf.layers.dense({
            units: mlpActSize,
            useBias: true,
        }).apply(activations) as any;

        // Adding a layer to concatenate activations to the reconstruction as final output so both are available in the loss function as yPred, because intermediate activations are needed to compute L1 loss term.
        // Alternatives tried:
        // - Retrieving intermediate output in the loss function - couldn't figure out how to retrieve as a non-symbolic tensor
        // - Outputting multiple tensors in the model - but yPred in the loss function is still only the first output tensor
        const combinedOutput = tf.layers.concatenate({axis: 1}).apply([activations, reconstruction]) as any;
        const saeModel = tf.model({inputs: [inputs], outputs: [combinedOutput]});

        saeModel.compile({
            optimizer: tf.train.adam(),
            loss: (yTrue: tf.Tensor, yPred: tf.Tensor) => {
                const outputActivations = yPred.slice([0, 0], [-1, dHidden]);
                const outputReconstruction = yPred.slice([0, dHidden], [-1, -1]);
                const trueReconstruction = yTrue.slice([0, dHidden], [-1, -1]);

                const l2Loss = tf.losses.meanSquaredError(trueReconstruction, outputReconstruction);
                const l1Loss = tf.mul(l1Coeff, tf.sum(tf.abs(outputActivations)));
                return tf.add(l2Loss, l1Loss);
            },
        });

        const epochSize = 8;
        // This tensor is unused - it's just to make yTrue shape match the concatenated output.
        const placeholderActivationsTensor = tf.randomNormal([epochSize, dHidden]);
        for (let i=0; i<Math.floor(nTrainingData / epochSize); i++) {
            const epoch = trueActivations.slice(i * epochSize, Math.min(epochSize, nTrainingData - i * epochSize));
            let epochPlaceholderActivations = placeholderActivationsTensor;
            if (epochPlaceholderActivations.shape[0] !== epoch.shape[0]) {
                epochPlaceholderActivations = tf.randomNormal([epoch.shape[0], dHidden]);
            }
            const h = await saeModel.fit(epoch, tf.concat([epochPlaceholderActivations, epoch], 1), {
                batchSize: 8,
                epochs: 3
            });
            const status = "Loss after Epoch " + i + " : " + h.history['loss'][0];
            console.log(status);
            this.status = status;
        }
    }
}

