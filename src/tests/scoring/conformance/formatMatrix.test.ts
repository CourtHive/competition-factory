import { formatCell, unknownKeys } from '../../testHarness/scoringConformance/formatCells';
import { harvestFormats } from '../../testHarness/scoringConformance/harvestFormats';
import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { FORMAT_MATRIX } from './formatMatrix';
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

/*
 * The scoring conformance matrix gate (step 7, phase A, of the 2026-10-17 scoring-engine assessment).
 * Every format the factory names falls in a cell; every cell must be classified, and every
 * classification must hold. It does not require coverage: `missing` is an honest classification, and
 * the count it reports is the work phase B has left.
 */

const formats = harvestFormats();
const cells = new Map<string, string[]>();
for (const code of formats.keys()) {
  const cell = formatCell(parse(code)!);
  cells.set(cell, [...(cells.get(cell) ?? []), code]);
}

describe('scoring conformance matrix', () => {
  it('harvests the formats the factory names', () => {
    // a floor, not a count: a harvest that finds nothing must not pass as a matrix with nothing to classify
    expect(formats.size).toBeGreaterThan(200);
  });

  it('places every key the parser emits: a new grammar feature needs a coordinate first', () => {
    const unknown = [...formats.keys()].flatMap((code) => unknownKeys(parse(code)!).map((key) => `${key} in ${code}`));
    expect(unknown).toEqual([]);
  });

  it('classifies every cell a format falls in', () => {
    const unclassified = [...cells.entries()]
      .filter(([cell]) => !FORMAT_MATRIX[cell])
      .map(([cell, codes]) => `${cell}  (e.g. ${codes[0]}, from ${formats.get(codes[0])})`);
    expect(unclassified).toEqual([]);
  });

  it('holds no entry that no format reaches', () => {
    expect(Object.keys(FORMAT_MATRIX).filter((cell) => !cells.has(cell))).toEqual([]);
  });

  it('a refused cell refuses point and game input for every format in it', () => {
    for (const [cell, entry] of Object.entries(FORMAT_MATRIX)) {
      if (entry.status !== 'refused') continue;
      for (const code of cells.get(cell) ?? []) {
        const levels = new ScoringEngine({ matchUpFormat: code }).getInputLevels();
        expect({ code, levels }).toEqual({ code, levels: { point: false, game: false, set: true } });
      }
    }
  });

  it('a conformance cell names case files that exist', () => {
    for (const [cell, entry] of Object.entries(FORMAT_MATRIX)) {
      if (entry.status !== 'conformance') continue;
      expect({ cell, cases: entry.cases.length > 0 }).toEqual({ cell, cases: true });
      for (const file of entry.cases)
        expect({ cell, file, exists: fs.existsSync(file) }).toEqual({ cell, file, exists: true });
    }
  });

  it('reports what is left', () => {
    const count = (status: string) => Object.values(FORMAT_MATRIX).filter((entry) => entry.status === status).length;
    const summary = {
      cells: cells.size,
      conformance: count('conformance'),
      refused: count('refused'),
      missing: count('missing'),
    };
    process.stdout.write(`scoring-conformance-matrix ${JSON.stringify(summary)}\n`);
    expect(summary.conformance + summary.refused + summary.missing).toEqual(summary.cells);
  });
});
