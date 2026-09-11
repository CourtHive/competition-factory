import { READ_MODEL_COLUMNS, READ_MODEL_TABLES } from '@Query/readModel/readModelColumns';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';
import { cast } from '@Query/readModel/cast';

// The manifest is checked against the row TYPES by the compiler (see readModelColumns.ts). Types
// cannot see what a builder does at runtime: a conditional spread emits a key sometimes and the
// declared return type says nothing about it. So this compares the manifest against rows actually
// built by `cast()`.
//
// It matters because the consumer (courthive-query's deltaApplier) writes ONLY the columns the
// manifest names. A key a builder emits that the manifest lacks is discarded on arrival, silently —
// which is exactly how six `origin_*` columns were being lost when this file was written.

describe('READ_MODEL_COLUMNS', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    tournamentAttributes: { tournamentId: 'rmc-1' },
    startDate: '2025-03-03',
    endDate: '2025-03-09',
    drawProfiles: [{ drawSize: 8, eventName: 'Singles', seedsCount: 4 }],
    venueProfiles: [{ courtsCount: 4, venueName: 'Centre' }],
    completeAllMatchUps: true,
    nonRandom: 1,
  });

  it('lists every table the read model declares', () => {
    // `satisfies Record<keyof ReadModelRows, …>` already enforces this at compile time; asserted
    // here too so the count is visible in a test report rather than only in a green build.
    expect(READ_MODEL_TABLES.length).toEqual(15);
    expect(new Set(READ_MODEL_TABLES).size).toEqual(READ_MODEL_TABLES.length);
  });

  it('matches the keys `cast()` actually emits, table by table', () => {
    const { rows } = cast({ tournamentRecord });
    expect(rows).toBeDefined();

    // Prove the input before reporting agreement: a cast that produced nothing would make every
    // comparison below vacuously true.
    const populated = READ_MODEL_TABLES.filter((table) => (rows as any)?.[table]?.length);
    expect(populated.length).toBeGreaterThan(5);

    for (const table of populated) {
      const declared = new Set<string>(READ_MODEL_COLUMNS[table]);
      for (const row of (rows as any)[table]) {
        const emitted = Object.keys(row);
        const undeclared = emitted.filter((key) => !declared.has(key));
        // Named individually so a failure says which column and which table, not just "not equal".
        expect({ table, undeclared }).toEqual({ table, undeclared: [] });
      }
    }
  });

  it('declares no column that `cast()` never emits for a fully populated tournament', () => {
    // The reverse direction. A manifest entry nothing fills is a column every reader sees as NULL
    // forever — worth knowing about even though it is not, on its own, a defect.
    const { rows } = cast({ tournamentRecord });
    const populated = READ_MODEL_TABLES.filter((table) => (rows as any)?.[table]?.length);

    for (const table of populated) {
      const emitted = new Set<string>();
      for (const row of (rows as any)[table]) for (const key of Object.keys(row)) emitted.add(key);
      const neverEmitted = READ_MODEL_COLUMNS[table].filter((column) => !emitted.has(column));
      expect({ table, neverEmitted }).toEqual({ table, neverEmitted: [] });
    }
  });
});
