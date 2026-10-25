import { describe, expect, it } from 'vitest';
import { defined } from './defined';

describe('defined', () => {
  it('returns a present value unchanged, falsy values included', () => {
    const value = { id: 1 };
    expect(defined(value)).toBe(value);
    expect([defined(0), defined(''), defined(false)]).toEqual([0, '', false]);
  });

  it('throws, naming the value, when it is undefined or null', () => {
    expect(() => defined(undefined, 'matchUps')).toThrow('expected matchUps to be defined');
    expect(() => defined(null)).toThrow('expected value to be defined');
  });
});
