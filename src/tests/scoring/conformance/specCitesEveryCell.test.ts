import { FORMAT_MATRIX } from './formatMatrix';
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

/*
 * The scoring-engine spec gate (SE1 of Mentat/planning/SCORING_ENGINE_SPEC_AND_V2_PLAN.md). The spec is
 * what a reimplementer builds from, so every cell of the conformance matrix must be placed under a rule
 * of it. A cell is cited by its id, verbatim, in inline code, on a line that names the spec section
 * (`§ n`) whose rules govern it. A new matrix cell fails here until the spec says which rule scores it.
 */

const SPEC = 'documentation/docs/scoring-engine/scoring-engine-spec.md';
const spec = fs.readFileSync(SPEC, 'utf8');
const lines = spec.split('\n');

/** Anything in inline code shaped like a matrix cell id. */
const CELL_SHAPE = /`((?:bestOf|exactly|standalone)[^`]* \| (?:clock|noClock) \| (?:known|unknown)Modifiers)`/g;

describe('the scoring-engine spec cites every cell of the conformance matrix', () => {
  it('names every cell, verbatim, in inline code', () => {
    const missing = Object.keys(FORMAT_MATRIX).filter((cell) => !spec.includes(`\`${cell}\``));
    // a cell listed here has no rule in the spec: add it to the spec's matrix appendix under its rules
    expect({ spec: SPEC, missing }).toEqual({ spec: SPEC, missing: [] });
  });

  it('cites no cell the matrix does not hold', () => {
    const cited = [...spec.matchAll(CELL_SHAPE)].map((match) => match[1]);
    expect(cited.length).toBeGreaterThan(0);
    expect(cited.filter((cell) => !FORMAT_MATRIX[cell])).toEqual([]);
  });

  it('places every cell under a section of the spec', () => {
    const unplaced = Object.keys(FORMAT_MATRIX).filter((cell) => {
      const line = lines.find((text) => text.includes(`\`${cell}\``));
      return !line || !/§ \d+/.test(line);
    });
    expect(unplaced).toEqual([]);
  });
});
