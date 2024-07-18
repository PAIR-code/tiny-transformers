import { SerializedGTensor } from 'src/lib/gtensor/gtensor';

export type Name = string;
export type TensorValue = {
  t: SerializedGTensor<'a'>;
  v: number;
} | null;

export type Globals = {
  name: Name;
  t: TensorValue;
};

export const globals: Partial<Globals> = {
  name: 'init foo name',
};

type OpKind = {
  workerpath: string;
  inputs: (keyof Globals)[];
  outputs: (keyof Globals)[];
};

export const ops: OpKind[] = [
  {
    workerpath: './app.worker',
    inputs: ['name'],
    outputs: ['t'],
  },
];
