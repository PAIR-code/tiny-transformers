export function nullableEqFn<T>(
  eq: (a: T, b: T) => boolean
): (a: T | null, b: T | null) => boolean {
  return (a, b) => (a === null && b === null) || (a !== null && b !== null && eq(a, b));
}
