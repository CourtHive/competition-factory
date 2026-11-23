// Bind a destination and its final value while planning. Committing performs only the store.
export function planFieldWrite<T extends object, K extends keyof T>(target: T, key: K, value: T[K]): () => void {
  return () => {
    target[key] = value;
  };
}

// A property setter can install its own array. Append to the installed value so
// document arrays retain their casting, dirty tracking and append operation.
export function planAppend<T>(destination: () => T[], value: T): () => void {
  return () => {
    destination().push(value);
  };
}
