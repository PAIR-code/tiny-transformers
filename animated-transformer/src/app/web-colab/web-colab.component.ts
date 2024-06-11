import { Component } from '@angular/core';
import { GTensor } from 'src/lib/gtensor/gtensor';

@Component({
  selector: 'app-web-colab',
  standalone: true,
  imports: [],
  templateUrl: './web-colab.component.html',
  styleUrl: './web-colab.component.scss',
})
export class WebColabComponent {
  constructor() {
    this.runWorker();
  }

  async runWorker() {
    if (typeof Worker === 'undefined') {
      console.error('We require webworkers. Sorry.');
      return;
    }

    // Create a new
    const worker = new Worker(new URL('./app.worker', import.meta.url));
    const onceOutputs = new Promise<{ t: GTensor<'a'>; v: number }>(
      (resolve) => {
        worker.onmessage = ({ data }) => {
          resolve(data);
        };
      }
    );
    worker.postMessage('hello, are you there webworker?');
    console.log('posted message');
    const outputs = await onceOutputs;
    console.log('webworker completed');
    console.log(outputs);
    console.log(outputs.t);
    console.log(outputs.v);

    // const myWorker = new Worker('worker.js');
  }
}
