// Bind a destination and its final value while planning. Committing performs only the store.
export function planFieldWrite<T extends object, K extends keyof T>(target: T, key: K, value: T[K]): () => void {
  return () => {
    target[key] = value;
  };
}

// Append to the array the destination holds when the plan commits.
export function planAppend<T>(destination: () => T[], value: T): () => void {
  return () => {
    destination().push(value);
  };
}
