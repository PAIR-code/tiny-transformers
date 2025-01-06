export function nullableEqFn<T>(
  eq: (a: T, b: T) => boolean,
): (a: T | null, b: T | null) => boolean {
  return (a, b) => (a === null && b === null) || (a !== null && b !== null && eq(a, b));
}

// if T is void, it's void, otherwiswe it is the return value.
export type MaybeReturn<T> = void extends T ? void : T;
export async function waitTick<T>(f?: () => T): Promise<MaybeReturn<T>> {
  return new Promise<T | void>((resolve) => {
    setTimeout(() => {
      if (f) {
        resolve(f());
      } else {
        resolve();
      }
    }, 0);
  }) as Promise<MaybeReturn<T>>;
}

export async function* asyncifyIter<T>(iter: Iterable<T>): AsyncIterable<T> {
  for (const x of iter) {
    yield x;
  }
}

export function asyncIterify<T>(iter: Iterator<T>): AsyncIterator<T> {
  return {
    next: async () => {
      return await iter.next();
    },
  };
}

export async function tryer<T>(p: Promise<T>): Promise<[Error, undefined] | [undefined, T]> {
  let result: T | undefined;
  let err: Error | undefined;
  try {
    result = await p;
  } catch (e) {
    err = e as Error;
  }
  return [err, result] as never as Promise<[Error, undefined] | [undefined, T]>;
}
