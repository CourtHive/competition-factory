import { GOES_TO_NOT_STORED, migrateTournamentRecord } from '@Mutate/tournaments/migrateTournamentRecord';
import { matchUpsOf, structuresOf } from '@Acquire/structureMembers';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import {
  AD_HOC,
  FEED_IN_CHAMPIONSHIP,
  LOSER,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

/**
 * A DRAW THAT DOES NOT STORE ITS EDGES IS GIVEN THEM BY `migrateTournamentRecord` (CA, 2026-10-16: a one-time backfill of
 * stored converted records, and the migration a standard requirement of ingest).
 *
 * A record the factory did not produce may store no `winnerMatchUpId` / `loserMatchUpId`, and a lone structure of one
 * may carry no `finishingPositionRange`. A query used to write them as a side effect, which the server then saved; no
 * query writes now (#5485). The migration writes what `addGoesTo` derives, so the stored record matches one the factory
 * generated.
 */

const drawMatchUps = (tournamentRecord) =>
  tournamentRecord.events[0].drawDefinitions[0].structures
    .flatMap((structure) => [structure, ...(structuresOf(structure) ?? [])])
    .flatMap((structure) => matchUpsOf(structure) ?? []);

const edges = (tournamentRecord) =>
  Object.fromEntries(
    drawMatchUps(tournamentRecord).map(({ matchUpId, winnerMatchUpId, loserMatchUpId, finishingPositionRange }) => [
      matchUpId,
      { winnerMatchUpId, loserMatchUpId, finishingPositionRange },
    ]),
  );

const stripped = (tournamentRecord, { ranges = true } = {}) => {
  const copy = structuredClone(tournamentRecord);
  for (const matchUp of drawMatchUps(copy)) {
    delete matchUp.winnerMatchUpId;
    delete matchUp.loserMatchUpId;
    if (ranges) delete matchUp.finishingPositionRange;
  }
  return copy;
};

const generate = (drawProfile) =>
  mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile], setState: false }).tournamentRecord;

// a round robin with a playoff and a TEAM draw are among them: the query's write skipped both, the migration does not
it.each([
  { drawType: FEED_IN_CHAMPIONSHIP, drawSize: 16 },
  { drawType: ROUND_ROBIN_WITH_PLAYOFF, drawSize: 16 },
  { eventType: TEAM_EVENT, drawSize: 8 },
])('gives a draw that stores no edges the edges a generated draw stores, once: %o', (drawProfile) => {
  const tournamentRecord = generate(drawProfile);
  // the loser ranges are widened from the stored ones, so only the edges are stripped here
  const record = stripped(tournamentRecord, { ranges: false });

  const result: any = migrateTournamentRecord({ tournamentRecord: record });
  expect(result.promoted.goesTo).toEqual(1);
  expect(edges(record)).toEqual(edges(tournamentRecord));

  const again: any = migrateTournamentRecord({ tournamentRecord: record });
  expect(again.totalPromoted).toEqual(0);
});

it('gives a one-round foreign draw its finishing rounds', () => {
  const tournamentRecord = generate({ drawType: SINGLE_ELIMINATION, drawSize: 2 });
  const record = stripped(tournamentRecord);

  const result: any = migrateTournamentRecord({ tournamentRecord: record });
  expect(result.promoted.goesTo).toEqual(1);
  expect(drawMatchUps(record).every((matchUp) => matchUp.finishingPositionRange)).toEqual(true);

  const again: any = migrateTournamentRecord({ tournamentRecord: record });
  expect(again.totalPromoted).toEqual(0);
});

it('leaves a draw the factory generated as it is', () => {
  const tournamentRecord = generate({ drawType: FEED_IN_CHAMPIONSHIP, drawSize: 16 });
  const before = structuredClone(tournamentRecord);

  const result: any = migrateTournamentRecord({ tournamentRecord });
  expect(result.promoted.goesTo).toEqual(0);
  expect(tournamentRecord).toEqual(before);
});

// an AD_HOC draw's rounds are paired, not linked: there is nothing to derive, and no elimination range to give it
it('leaves an AD_HOC draw as it is', () => {
  const tournamentRecord = generate({ drawType: AD_HOC, drawSize: 8, automated: true, roundsCount: 3 });
  const record = stripped(tournamentRecord);
  const before = structuredClone(record);

  const result: any = migrateTournamentRecord({ tournamentRecord: record });
  expect(result.promoted.goesTo).toEqual(0);
  expect(record).toEqual(before);
});

// a malformed round link is an error (CA, 2026-10-06): the draw is left as it was, never half given its edges
it('leaves a draw with a malformed round link untouched', () => {
  const record = stripped(generate({ drawType: FEED_IN_CHAMPIONSHIP, drawSize: 16 }), { ranges: false });
  const link = record.events[0].drawDefinitions[0].links.find(({ linkType }) => linkType === LOSER);
  Reflect.deleteProperty(link.source, 'roundNumber');
  const before = structuredClone(record);

  const result: any = migrateTournamentRecord({ tournamentRecord: record });
  expect(result.success).toEqual(true);
  expect(result.promoted.goesTo).toEqual(0);
  expect(record).toEqual(before);
  // and SAID to be left: the error the derivation met is reported, not swallowed
  const { drawId } = record.events[0].drawDefinitions[0];
  expect(result.warnings).toEqual([
    expect.objectContaining({
      code: GOES_TO_NOT_STORED,
      eventId: record.events[0].eventId,
      error: INVALID_VALUES,
      drawId,
    }),
  ]);
});

// an entry that is not a link makes the derivation throw: reported the same way, and the run completes
it('reports, rather than throws on, a draw whose links hold an entry that is not a link', () => {
  const record = stripped(generate({ drawType: FEED_IN_CHAMPIONSHIP, drawSize: 16 }), { ranges: false });
  record.events[0].drawDefinitions[0].links.push(null);
  const before = structuredClone(record);

  const result: any = migrateTournamentRecord({ tournamentRecord: record });
  expect(result.success).toEqual(true);
  expect(result.promoted.goesTo).toEqual(0);
  expect(record).toEqual(before);
  expect(result.warnings).toEqual([
    expect.objectContaining({ code: GOES_TO_NOT_STORED, drawId: record.events[0].drawDefinitions[0].drawId }),
  ]);
  expect(typeof result.warnings[0].info).toEqual('string');
});
