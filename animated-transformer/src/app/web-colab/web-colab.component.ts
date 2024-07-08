import { Component } from '@angular/core';
import {
  GTensor,
  SerializedGTensor,
  makeScalar,
} from 'src/lib/gtensor/gtensor';
import * as tf from '@tensorflow/tfjs';

// Create a new
async function onceOutput<T>(worker: Worker): Promise<T> {
  return new Promise<T>((resolve) => {
    worker.onmessage = ({ data }) => {
      resolve(data as T);
    };
  });
}

@Component({
  selector: 'app-web-colab',
  standalone: true,
  imports: [],
  templateUrl: './web-colab.component.html',
  styleUrl: './web-colab.component.scss',
})
export class WebColabComponent {
  public worker: Worker;

  constructor() {
    this.worker = new Worker(new URL('./app.worker', import.meta.url));
    this.foo();
  }

  async foo() {
    const urlPath = './foo.worker';
    console.log(urlPath);
    const worker2 = new Worker(new URL(urlPath, import.meta.url));

    worker2.postMessage('hello, are you there webworker2?');
    console.log('worker2 says:', await onceOutput<string>(worker2));
  }

  async doRun() {
    if (typeof Worker === 'undefined') {
      console.error('We require webworkers. Sorry.');
      return;
    }
    this.worker.postMessage('hello, are you there webworker?');
    console.log('posted message');
    // Create a new
    const output = await onceOutput<{
      data: { t: SerializedGTensor<'a'>; v: number };
    }>(this.worker);
    console.log('webworker completed');
    console.log(output);
    console.log(
      GTensor.fromSerialised(output.data.t)
        .scalarDiv(makeScalar(3))
        .tensor.arraySync()
    );
    console.log(output.data.v);

    // const myWorker = new Worker('worker.js');
  }

  async doOpen() {
    const dirHandle = await self.showDirectoryPicker({ mode: 'readwrite' });
    const testFile = await dirHandle.getFileHandle('test.txt', {
      create: true,
    });
    const writable = await testFile.createWritable();
    await writable.write('hello there');
    await writable.close();
    console.log(dirHandle.name);
    // console.log(dirHandle.getFileHandle(''));
    for await (const entry of dirHandle.values()) {
      const perm = await entry.requestPermission({ mode: 'read' });
      console.log(entry.kind, entry.name, perm);
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        const dec = new TextDecoder('utf-8');
        console.log('file contains:', dec.decode(await file.arrayBuffer()));
      }
    }
  }
}

// // fileHandle is an instance of FileSystemFileHandle..
// async function writeFile(fileHandle, contents) {
//   // Create a FileSystemWritableFileStream to write to.
//   const writable = await fileHandle.createWritable();
//   // Write the contents of the file to the stream.
//   await writable.write(contents);
//   // Close the file and write the contents to disk.
//   await writable.close();
// }
