function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** Canonical test identity seed; relocation adapters must share this calculation. */
export function testRandomSeed(name: string, ordinal: number): number {
  return hash(`${name}#${ordinal}`);
}
