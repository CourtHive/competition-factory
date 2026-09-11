/**
 * Coverage tests for the report-wrapper layer
 * (src/query/reports/wrappers/*.ts).
 *
 * Each wrapper is structurally similar: call an underlying query, return
 * the error envelope if present, otherwise build a `{ reportId, columns,
 * rows, generatedAt }` shape. The branch-coverage gap lives in the row-
 * building loops where every cell has `value ?? fallback` fallbacks that
 * the happy-path tests never trigger.
 *
 * Strategy: one populated tournament covers the happy path for every
 * wrapper at once; one empty tournament covers the empty-rows path.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import mocksEngine from '@Assemblies/engines/mock';

import { wrapCompetitivenessReport } from '@Query/reports/wrappers/wrapCompetitivenessReport';
import { wrapEntryStatusReport } from '@Query/reports/wrappers/wrapEntryStatusReport';
import { wrapMatchResultsReport } from '@Query/reports/wrappers/wrapMatchResultsReport';
import { wrapMatchUpStatusReport } from '@Query/reports/wrappers/wrapMatchUpStatusReport';
import { wrapParticipantResultsReport } from '@Query/reports/wrappers/wrapParticipantResultsReport';
import { wrapParticipantStats } from '@Query/reports/wrappers/wrapParticipantStats';
import { wrapSeedingPerformanceReport } from '@Query/reports/wrappers/wrapSeedingPerformanceReport';
import { wrapStructureReport } from '@Query/reports/wrappers/wrapStructureReport';
import { wrapVenuesReport } from '@Query/reports/wrappers/wrapVenuesReport';

let populated: any;
const empty: any = { tournamentId: 'empty-1' };

beforeAll(() => {
  const result = mocksEngine.generateTournamentRecord({
    inContext: true,
    completeAllMatchUps: true,
    drawProfiles: [{ drawSize: 8, seedsCount: 2, eventName: 'Singles A' }],
    venueProfiles: [{ courtsCount: 4 }],
  });
  populated = result.tournamentRecord;
});

const wrappers = [
  { name: 'wrapCompetitivenessReport', fn: wrapCompetitivenessReport },
  { name: 'wrapEntryStatusReport', fn: wrapEntryStatusReport },
  { name: 'wrapMatchResultsReport', fn: wrapMatchResultsReport },
  { name: 'wrapMatchUpStatusReport', fn: wrapMatchUpStatusReport },
  { name: 'wrapParticipantResultsReport', fn: wrapParticipantResultsReport },
  { name: 'wrapParticipantStats', fn: wrapParticipantStats },
  { name: 'wrapSeedingPerformanceReport', fn: wrapSeedingPerformanceReport },
  { name: 'wrapStructureReport', fn: wrapStructureReport },
  { name: 'wrapVenuesReport', fn: wrapVenuesReport },
];

describe('report wrappers — happy path on a populated tournament', () => {
  // Each wrapper should return a ReportResult shape with reportId/columns/rows.
  // Some may produce empty rows depending on whether the populated fixture
  // exercised the report's domain — assert structure, not row counts.
  it.each(wrappers)('$name returns a well-formed ReportResult', ({ fn }) => {
    const result: any = fn({ tournamentRecord: populated });
    expect(result.error).toBeUndefined();
    expect(typeof result.reportId).toBe('string');
    expect(Array.isArray(result.columns)).toBe(true);
    expect(result.columns.length).toBeGreaterThan(0);
    expect(Array.isArray(result.rows)).toBe(true);
    expect(typeof result.generatedAt).toBe('string');
    for (const column of result.columns) {
      expect(typeof column.key).toBe('string');
      expect(typeof column.title).toBe('string');
      expect(['string', 'number', 'date']).toContain(column.type);
    }
  });
});

describe('report wrappers — empty/skeleton tournament', () => {
  // A bare tournamentRecord exercises the `?? []` fallbacks across the
  // row-building loops and the for-of loop "no iterations" branches.
  it.each(wrappers)('$name handles an empty tournament without throwing', ({ fn }) => {
    const result: any = fn({ tournamentRecord: empty });
    if (result.error) {
      // Some wrappers route empty input through their underlying query's
      // error envelope (e.g. MISSING_TOURNAMENT_RECORD when nothing's set).
      expect(result.error.code || result.error.message).toBeDefined();
    } else {
      expect(Array.isArray(result.rows)).toBe(true);
      expect(result.rows.length).toBe(0);
    }
  });
});
