import { WorkerCellKind } from '../src/lib/distr-signal-exec/cell-kind.ts';

export const fooKind = new WorkerCellKind('foo', {}, () => new Worker('./main.ts'));
