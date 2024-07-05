export type PromiseMaker = { promise: Promise<void>; resolver: () => void };

export function makePromise(): PromiseMaker {
  let resolver: () => void;
  const madePromise = {
    promise: null,
    resolver: () => {
      return;
    },
  } as unknown as PromiseMaker;
  const promise = new Promise<void>((resolve, reject) => {
    madePromise.resolver = resolve;
  });
  return madePromise;
}
