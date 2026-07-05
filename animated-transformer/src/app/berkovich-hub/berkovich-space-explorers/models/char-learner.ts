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

export enum CharLearnerKind {
  BerkovichBigram = 'berkovich-bigram',
  BerkovichNgram = 'berkovich-ngram',
  BerkovichBigramBias = 'berkovich-bigram-bias',
  AffinoidNgram = 'affinoid-ngram',
  TropicalMlp = 'tropical-mlp',
  BerkovichAttention = 'berkovich-attention',
  EuclideanNgram = 'euclidean-ngram',
  PadicLinear = 'padic-linear'
}

export enum ConfigFieldType {
  Number = 'number',
  Select = 'select',
  Boolean = 'boolean',
  String = 'string',
  PAdic = 'padic'
}

export interface ConfigFieldBase<T> {
  key: string;
  label: string;
  description: string;
  defaultValue: T;
  requiresRebuild?: boolean;
}

export interface ConfigFieldNumberDef extends ConfigFieldBase<number> {
  kind: ConfigFieldType.Number;
  min?: number;
  max?: number;
  step?: number;
}

export interface ConfigFieldSelectDef<T = any> extends ConfigFieldBase<T> {
  kind: ConfigFieldType.Select;
  options: { value: T; label: string }[];
}

export interface ConfigFieldBooleanDef extends ConfigFieldBase<boolean> {
  kind: ConfigFieldType.Boolean;
}

export interface ConfigFieldStringDef extends ConfigFieldBase<string> {
  kind: ConfigFieldType.String;
}

export interface ConfigFieldPAdicDef extends ConfigFieldBase<string> {
  kind: ConfigFieldType.PAdic;
}

export type ConfigFieldDef =
  | ConfigFieldNumberDef
  | ConfigFieldSelectDef
  | ConfigFieldBooleanDef
  | ConfigFieldStringDef
  | ConfigFieldPAdicDef;

export abstract class CharLearner<
  TConfig = any,
  TForwardResult = any,
  TParams = any
> {
  abstract readonly kind: CharLearnerKind;
  abstract readonly configDefs: ConfigFieldDef[];
  abstract get parameters(): TParams;

  readonly vocab: string[];
  readonly V: number;
  readonly embDim: number;

  constructor(vocab: string[], embDim: number) {
    this.vocab = vocab;
    this.V = vocab.length;
    this.embDim = embDim;
  }

  abstract forward(contextIndices: number[], config: TConfig): TForwardResult;
  
  abstract trainStep(
    contextIndices: number[],
    targetIdx: number,
    config: TConfig
  ): { loss: number; predIdx: number; forwardResult: TForwardResult };
  
  abstract trainBatch(
    samples: { contextIndices: number[]; targetIdx: number }[],
    config: TConfig
  ): { loss: number; accuracy: number };
}
