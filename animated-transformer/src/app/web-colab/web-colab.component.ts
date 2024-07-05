import { Component } from '@angular/core';
import {
  GTensor,
  SerializedGTensor,
  makeScalar,
} from 'src/lib/gtensor/gtensor';
import * as tf from '@tensorflow/tfjs';

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
  }

  async doRun() {
    if (typeof Worker === 'undefined') {
      console.error('We require webworkers. Sorry.');
      return;
    }

    // Create a new
    const onceOutputs = new Promise<{ t: GTensor<'a'>; v: number }>(
      (resolve) => {
        this.worker.onmessage = ({ data }) => {
          const { t, v } = data as { t: SerializedGTensor<'a'>; v: number };
          resolve({ t: GTensor.fromSerialised(t), v });
        };
      }
    );
    this.worker.postMessage('hello, are you there webworker?');
    console.log('posted message');
    const outputs = await onceOutputs;
    console.log('webworker completed');
    console.log(outputs);
    console.log(outputs.t.scalarDiv(makeScalar(3)).tensor.arraySync());
    console.log(outputs.v);

    // const myWorker = new Worker('worker.js');
  }

  async doOpen() {
    const dirHandle = await self.showDirectoryPicker();
    for await (const entry of dirHandle.values()) {
      console.log(entry.kind, entry.name);
    }
  }
}
