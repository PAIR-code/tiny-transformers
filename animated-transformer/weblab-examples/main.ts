import { workerCell } from '../src/lib/distr-signal-exec/lab-worker-cell.ts';
import { fooKind } from './cell.kind.ts';

const cell = workerCell(fooKind);
cell.onStart(() => {
  console.log('hello!');
});
