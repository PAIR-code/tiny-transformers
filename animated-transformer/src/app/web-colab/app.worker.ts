/// <reference lib="webworker" />

import * as tf from '@tensorflow/tfjs';
import { GTensor, SerializedGTensor } from 'src/lib/gtensor/gtensor';

import * as lab from '../../lib/weblab/workerlab';

console.log('app.worker', self.location);

type InputKind = string;
type OutputKind = {
  t: SerializedGTensor<'a'>;
  v: number;
} | null;

const input = await lab.onceGetInput<InputKind>('name');

console.log(`webworker got input! ${input}`);

const t = new GTensor(tf.tensor([1, 2, 3]), ['a']);
const v = t.contract(t, ['a']).tensor.arraySync() as number;

lab.output('tensor', {
  t: t.toSerialised(),
  v,
});
