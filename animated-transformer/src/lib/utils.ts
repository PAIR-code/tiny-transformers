export function nullableEqFn<T>(
  eq: (a: T, b: T) => boolean
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
