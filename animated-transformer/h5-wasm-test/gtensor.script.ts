import {
    GTensor,
    makeRange,
  } from '../src/lib/gtensor/gtensor';

import { oneHot } from '@tensorflow/tfjs';;

const size = 1024;
const indexes =
      makeRange('pos', 0, size, 1, 'int32');
const posAttentionMatrix = new GTensor(oneHot(indexes.tensor, size),
    ['pos', 'batch', 'a']);
console.log(posAttentionMatrix);