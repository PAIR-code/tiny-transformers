// Something to force type evaluation. See: https://github.com/microsoft/TypeScript/issues/47980
export type Expand<T> = T extends unknown ? { [K in keyof T]: Expand<T[K]> } : never;

// Something to force type evaluation. See: https://github.com/microsoft/TypeScript/issues/47980
export type ExpandOnce<T> = T extends unknown ? { [K in keyof T]: T[K] } : never;
