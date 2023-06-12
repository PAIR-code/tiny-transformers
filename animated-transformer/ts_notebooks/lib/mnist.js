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


"use strict";
/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 *
 * This file was branched from
 * https://github.com/tensorflow/tfjs-examples/blob/master/mnist-node/
 * to demostrate Tensorflow in tslab.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dataset = void 0;
const tf = __importStar(require("@tensorflow/tfjs"));
const assert_1 = __importDefault(require("assert"));
const fs_1 = __importDefault(require("fs"));
const https_1 = __importDefault(require("https"));
const util_1 = __importDefault(require("util"));
const zlib_1 = __importDefault(require("zlib"));
const readFile = util_1.default.promisify(fs_1.default.readFile);
// MNIST data constants:
const BASE_URL = "https://storage.googleapis.com/cvdf-datasets/mnist/";
const TRAIN_IMAGES_FILE = "train-images-idx3-ubyte";
const TRAIN_LABELS_FILE = "train-labels-idx1-ubyte";
const TEST_IMAGES_FILE = "t10k-images-idx3-ubyte";
const TEST_LABELS_FILE = "t10k-labels-idx1-ubyte";
const IMAGE_HEADER_MAGIC_NUM = 2051;
const IMAGE_HEADER_BYTES = 16;
const IMAGE_HEIGHT = 28;
const IMAGE_WIDTH = 28;
const IMAGE_FLAT_SIZE = IMAGE_HEIGHT * IMAGE_WIDTH;
const LABEL_HEADER_MAGIC_NUM = 2049;
const LABEL_HEADER_BYTES = 8;
const LABEL_RECORD_BYTE = 1;
const LABEL_FLAT_SIZE = 10;
// Downloads a test file only once and returns the buffer for the file.
async function fetchOnceAndSaveToDiskWithBuffer(filename) {
    return new Promise(resolve => {
        const url = `${BASE_URL}${filename}.gz`;
        if (fs_1.default.existsSync(filename)) {
            resolve(readFile(filename));
            return;
        }
        const file = fs_1.default.createWriteStream(filename);
        console.log(`  * Downloading from: ${url}`);
        https_1.default.get(url, response => {
            const unzip = zlib_1.default.createGunzip();
            response.pipe(unzip).pipe(file);
            unzip.on("end", () => {
                resolve(readFile(filename));
            });
        });
    });
}
function loadHeaderValues(buffer, headerLength) {
    const headerValues = [];
    for (let i = 0; i < headerLength / 4; i++) {
        // Header data is stored in-order (aka big-endian)
        headerValues[i] = buffer.readUInt32BE(i * 4);
    }
    return headerValues;
}
async function loadImages(filename) {
    const buffer = await fetchOnceAndSaveToDiskWithBuffer(filename);
    const headerBytes = IMAGE_HEADER_BYTES;
    const recordBytes = IMAGE_HEIGHT * IMAGE_WIDTH;
    const headerValues = loadHeaderValues(buffer, headerBytes);
    assert_1.default.equal(headerValues[0], IMAGE_HEADER_MAGIC_NUM);
    assert_1.default.equal(headerValues[2], IMAGE_HEIGHT);
    assert_1.default.equal(headerValues[3], IMAGE_WIDTH);
    const images = [];
    let index = headerBytes;
    while (index < buffer.byteLength) {
        const array = new Float32Array(recordBytes);
        for (let i = 0; i < recordBytes; i++) {
            // Normalize the pixel values into the 0-1 interval, from
            // the original 0-255 interval.
            array[i] = buffer.readUInt8(index++) / 255;
        }
        images.push(array);
    }
    assert_1.default.equal(images.length, headerValues[1]);
    return images;
}
async function loadLabels(filename) {
    const buffer = await fetchOnceAndSaveToDiskWithBuffer(filename);
    const headerBytes = LABEL_HEADER_BYTES;
    const recordBytes = LABEL_RECORD_BYTE;
    const headerValues = loadHeaderValues(buffer, headerBytes);
    assert_1.default.equal(headerValues[0], LABEL_HEADER_MAGIC_NUM);
    const labels = [];
    let index = headerBytes;
    while (index < buffer.byteLength) {
        const array = new Int32Array(recordBytes);
        for (let i = 0; i < recordBytes; i++) {
            array[i] = buffer.readUInt8(index++);
        }
        labels.push(array);
    }
    assert_1.default.equal(labels.length, headerValues[1]);
    return labels;
}
/** Helper class to handle loading training and test data. */
class MnistDataset {
    constructor() {
        this.dataset = null;
        this.trainSize = 0;
        this.testSize = 0;
        this.trainBatchIndex = 0;
        this.testBatchIndex = 0;
    }
    /** Loads training and test data. */
    async loadData() {
        this.dataset = await Promise.all([
            loadImages(TRAIN_IMAGES_FILE),
            loadLabels(TRAIN_LABELS_FILE),
            loadImages(TEST_IMAGES_FILE),
            loadLabels(TEST_LABELS_FILE)
        ]);
        this.trainSize = this.dataset[0].length;
        this.testSize = this.dataset[2].length;
    }
    getTrainData() {
        return this.getData_(true);
    }
    getTestData() {
        return this.getData_(false);
    }
    getData_(isTrainingData) {
        let imagesIndex;
        let labelsIndex;
        if (isTrainingData) {
            imagesIndex = 0;
            labelsIndex = 1;
        }
        else {
            imagesIndex = 2;
            labelsIndex = 3;
        }
        const size = this.dataset[imagesIndex].length;
        tf.util.assert(this.dataset[labelsIndex].length === size, () => `Mismatch in the number of images (${size}) and ` +
            `the number of labels (${this.dataset[labelsIndex].length})`);
        // Only create one big array to hold batch of images.
        const imagesShape = [
            size,
            IMAGE_HEIGHT,
            IMAGE_WIDTH,
            1
        ];
        const images = new Float32Array(tf.util.sizeFromShape(imagesShape));
        const labels = new Int32Array(tf.util.sizeFromShape([size, 1]));
        let imageOffset = 0;
        let labelOffset = 0;
        for (let i = 0; i < size; ++i) {
            images.set(this.dataset[imagesIndex][i], imageOffset);
            labels.set(this.dataset[labelsIndex][i], labelOffset);
            imageOffset += IMAGE_FLAT_SIZE;
            labelOffset += 1;
        }
        return {
            images: tf.tensor4d(images, imagesShape),
            labels: tf.oneHot(tf.tensor1d(labels, "int32"), LABEL_FLAT_SIZE).toFloat()
        };
    }
}
exports.dataset = new MnistDataset();
