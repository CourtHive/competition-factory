import { wrapParticipantExperienceReport } from '@Query/reports/wrappers/wrapParticipantExperienceReport';
import { wrapCallTimingVarianceReport } from '@Query/reports/wrappers/wrapCallTimingVarianceReport';
import { wrapParticipantResultsReport } from '@Query/reports/wrappers/wrapParticipantResultsReport';
import { wrapSeedingPerformanceReport } from '@Query/reports/wrappers/wrapSeedingPerformanceReport';
import { wrapCompetitivenessReport } from '@Query/reports/wrappers/wrapCompetitivenessReport';
import { wrapMatchUpStatusReport } from '@Query/reports/wrappers/wrapMatchUpStatusReport';
import { wrapRecoveryTimeReport } from '@Query/reports/wrappers/wrapRecoveryTimeReport';
import { wrapMatchResultsReport } from '@Query/reports/wrappers/wrapMatchResultsReport';
import { wrapEntryStatusReport } from '@Query/reports/wrappers/wrapEntryStatusReport';
import { wrapParticipantStats } from '@Query/reports/wrappers/wrapParticipantStats';
import { wrapStructureReport } from '@Query/reports/wrappers/wrapStructureReport';
import { wrapVenuesReport } from '@Query/reports/wrappers/wrapVenuesReport';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

/**
 * A REPORT OVER A SPARSE RECORD RENDERS EMPTY CELLS, NEVER `undefined`.
 *
 * `wrappers.test.ts` runs every wrapper over a fully populated record and over an empty one. A
 * record that comes from an older converter or another system is neither: it has participants,
 * events, draws, structures and venues, and is missing their NAMES. Every wrapper falls back cell by
 * cell (`value ?? ''`), and none of those fallbacks was exercised. A cell rendered `undefined` reaches
 * a CSV export as the word "undefined".
 */

function sparseRecord() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, seedsCount: 2 }],
    venueProfiles: [{ courtsCount: 2 }],
    completeAllMatchUps: true,
    autoSchedule: true,
  });

  for (const participant of tournamentRecord.participants ?? []) delete participant.participantName;
  for (const venue of tournamentRecord.venues ?? []) {
    delete venue.venueName;
    for (const court of venue.courts ?? []) delete court.courtName;
  }
  for (const event of tournamentRecord.events ?? []) {
    delete event.eventName;
    for (const drawDefinition of event.drawDefinitions ?? []) {
      delete drawDefinition.drawName;
      for (const structure of drawDefinition.structures ?? []) delete structure.structureName;
    }
  }
  return tournamentRecord;
}

const WRAPPERS: [string, (args: any) => any][] = [
  ['callTimingVariance', wrapCallTimingVarianceReport],
  ['participantResults', wrapParticipantResultsReport],
  ['seedingPerformance', wrapSeedingPerformanceReport],
  ['competitiveness', wrapCompetitivenessReport],
  ['matchUpStatus', wrapMatchUpStatusReport],
  ['matchResults', wrapMatchResultsReport],
  ['entryStatus', wrapEntryStatusReport],
  ['participantStats', wrapParticipantStats],
  ['structure', wrapStructureReport],
  ['venues', wrapVenuesReport],
];

it.each(WRAPPERS)('the %s report renders every cell of a nameless record', (_name, wrap) => {
  const tournamentRecord = sparseRecord();
  // CONTROL: the record really is sparse, and really is populated
  expect(tournamentRecord.participants?.length).toBeGreaterThan(0);
  expect(tournamentRecord.participants?.every((participant: any) => !participant.participantName)).toEqual(true);

  const report = wrap({ tournamentRecord, parameters: {} });
  expect(report.error).toBeUndefined();
  expect(report.columns.length).toBeGreaterThan(0);

  const undefinedCells = report.rows.flatMap((row: any) =>
    report.columns
      .filter((column: any) => row[column.key] === undefined || row[column.key] === null)
      .map((column: any) => column.key),
  );
  expect(undefinedCells).toEqual([]);
});

// These two read the times a matchUp was actually played, which a mock completion does not record.
// Over a record with none, the answer is a refusal that says so — not a report of empty rows.
it.each([
  ['participantExperience', wrapParticipantExperienceReport],
  ['recoveryTime', wrapRecoveryTimeReport],
] as [string, (args: any) => any][])('the %s report refuses a record whose play carries no times', (_name, wrap) => {
  const report = wrap({ tournamentRecord: sparseRecord(), parameters: {} });
  expect(report.error).toEqual('No played matchUps with resolvable times');
});
