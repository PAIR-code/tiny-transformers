// w5asm-test.script.ts

import * as tf from '@tensorflow/tfjs';
import { GTensor } from '../src/lib/gtensor/gtensor';

async function main() {
  console.log('loading h5wasm/node');
  const h5wasm = await import('h5wasm/node');
  console.log('waiting for it be ready');
  // Wait for h5wasm to be ready.
  await h5wasm.ready;

  const g = new GTensor(
    tf.tensor([
      [
        // 'example' dimension index 0
        [1, 2.1],
        [3, 4.2], // pos index 1
        [5, 6.3], // pos index 2
      ],
      [
        [2, 3.1],
        [3, 4.2],
        [6, 7.3],
      ], // example index 1
    ]),
    ['batch', 'pos', 'repSize']
  );

  console.log(g.dimNames);

  // Open an HDF5 file.
  console.log('trying to load a file...');
  const file = new h5wasm.File('your_hdf5_file.h5', 'r');

  // // Get a dataset.
  // const dataset = file.get('your_dataset_name');

  // // Access data.
  // const data = dataset.value;

  // Process the data...

  // Close the file.
  file.close();
}

main();
