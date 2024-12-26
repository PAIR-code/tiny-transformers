// This class connects an event function (someone cal call the nextEvent(X))
// with an AsyncIter of the values that are called within nextEvent. It also
// exposes a done() funtcion that ends the AsyncIterator.
export class AsyncIterOnEvents<T> implements AsyncIterable<T>, AsyncIterator<T> {
  // If there is no queue, then async iter has completed.
  queue?: T[] = [];
  // resolveFn is set when next() is waiting for a promise to complete, which
  // will happen when the next event call is made providing the next value. This
  // happens when events come in more slower than next() is called. When next()
  // is called slower than events come in, then values are put on the queue, and
  // there is no resolveFn set.
  resolveFn?: (v: IteratorResult<T, null>) => void;

  constructor() {}

  public nextEvent(value: T) {
    // If done, return;
    if (!this.queue) {
      return;
    }
    if (this.resolveFn) {
      this.resolveFn({ value });
    } else {
      this.queue.push(value);
    }
  }

  public done() {
    if (this.resolveFn) {
      this.resolveFn({ done: true, value: null });
    }
    delete this.queue;
  }

  nextPromise(): Promise<IteratorResult<T, null>> {
    const p = new Promise<IteratorResult<T, null>>((resolve) => {
      this.resolveFn = resolve;
    });
    p.then(() => {
      delete this.resolveFn;
    });
    return p;
  }

  async next(): Promise<IteratorResult<T, null>> {
    if (!this.queue) {
      return { done: true, value: null };
    }
    const value = this.queue.shift();
    if (value) {
      return { value };
    } else {
      return this.nextPromise();
    }
  }

  public [Symbol.asyncIterator]() {
    return this;
  }
}
