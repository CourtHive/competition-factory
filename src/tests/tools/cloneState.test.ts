import { cloneState, isPlainContainer, restoreState } from '@Tools/cloneState';
import { describe, expect, it } from 'vitest';

describe('cloneState', () => {
  it('keeps a shared reference shared, and a cycle terminates', () => {
    const shared = { value: 1 };
    const source: any = { a: shared, b: shared };
    source.self = source;
    const { copy } = cloneState(source);
    expect(copy.a).toBe(copy.b);
    expect(copy.a).not.toBe(shared);
    expect(copy.self).toBe(copy);
  });

  it('restores a shared original once, and keeps it shared', () => {
    const shared = { value: 1 };
    const source: any = { a: shared, b: shared };
    const clone = cloneState(source);
    shared.value = 2;
    source.b = { value: 3 };
    const restored = restoreState(clone);
    expect(restored).toBe(source);
    expect(source.a).toBe(shared);
    expect(source.b).toBe(shared);
    expect(shared.value).toEqual(1);
  });

  it('installs a snapshot value that did not come from the capture as it is', () => {
    const clone = cloneState({ list: [1] });
    const foreign = { from: 'elsewhere' };
    const date = new Date(0);
    (clone.copy as any).foreign = foreign;
    (clone.copy as any).when = date;
    const restored: any = restoreState(clone);
    expect(restored.foreign).toBe(foreign);
    expect(restored.when).toBe(date);
  });

  it('a container is an array or an object whose prototype is Object or null', () => {
    expect(isPlainContainer([])).toEqual(true);
    expect(isPlainContainer({})).toEqual(true);
    expect(isPlainContainer(Object.create(null))).toEqual(true);
    expect(isPlainContainer(new (class Document {})())).toEqual(false);
    expect(isPlainContainer(new Date())).toEqual(false);
    expect(isPlainContainer(null)).toEqual(false);
  });
});
