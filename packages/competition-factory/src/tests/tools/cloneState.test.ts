import { cloneData, cloneState, isPlainContainer, restoreState } from '@Tools/cloneState';
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

  it('captures and restores Date values without invoking caller method overrides', () => {
    let calls = 0;
    const when = new Date(12);
    when.getTime = () => {
      calls++;
      return 99;
    };
    when.setTime = () => {
      calls++;
      return 99;
    };
    const snapshot = cloneState({ when });
    Date.prototype.setTime.call(when, 34);
    expect(restoreState(snapshot).when).toBe(when);
    expect(Date.prototype.getTime.call(when)).toBe(12);
    expect(calls).toBe(0);
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

describe('cloneData', () => {
  it('copies data as structuredClone does: nothing shared, shared references kept shared, undefined kept', () => {
    const shared = { n: 1 };
    const source = { a: shared, b: shared, list: [shared], when: new Date(5), none: undefined };
    const copy = cloneData(source);
    expect(copy).toEqual(source);
    expect(copy).not.toBe(source);
    expect(copy.a).not.toBe(shared);
    expect(copy.b).toBe(copy.a);
    expect(copy.list[0]).toBe(copy.a);
    expect(copy.when).not.toBe(source.when);
    expect('none' in copy).toEqual(true);
  });

  it('copies what holds a function as far as it can be copied, and holds the function by reference', () => {
    const square = (x: number) => x * x;
    const keep = { num: 1 };
    const source = { notes: { fx: { square }, keep, again: keep }, plain: [1, 2] };
    // CONTROL: this is a value structuredClone refuses
    expect(() => structuredClone(source)).toThrow();
    const copy = cloneData(source);
    expect(copy).not.toBe(source);
    expect(copy.notes).not.toBe(source.notes);
    expect(copy.notes.fx).not.toBe(source.notes.fx);
    expect(copy.notes.fx.square).toBe(square);
    expect(copy.notes.keep).toEqual(keep);
    expect(copy.notes.keep).not.toBe(keep);
    expect(copy.notes.again).toBe(copy.notes.keep);
    expect(copy.plain).toEqual([1, 2]);
    expect(copy.plain).not.toBe(source.plain);
    // writing the copy leaves the source
    copy.notes.keep.num = 2;
    expect(keep.num).toEqual(1);
  });
});
