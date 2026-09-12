import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import { INSUFFICIENT_UUIDS } from '@Constants/errorConditionConstants';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { TEAM as TEAM_EVENT } from '@Constants/eventConstants';
import { SINGLES } from '@Constants/matchUpTypes';

/**
 * A `collectionId` minted from a caller-supplied pool, so client and server agree.
 *
 * TMX executes every mutation twice — the server applies it and acknowledges, then the client
 * applies the same methods locally. A mint that calls `UUID()` on each side produces two different
 * ids for the same collection and the copies of the record diverge silently. Measured on the
 * pre-fix tree: two identical draw generations produced different collectionIds.
 *
 * `addCollectionDefinition` draws from `tieFormatUuids` rather than `uuids`: a collectionId
 * identifies a collection within the tieFormat — the same container the copy-on-write forks
 * describe — while `uuids` feeds matchUp id minting. Keeping the streams apart is what lets
 * `INSUFFICIENT_UUIDS` say which one ran short.
 */

const collectionDefinition = (collectionName: string) => ({
  matchUpFormat: FORMAT_STANDARD,
  matchUpType: SINGLES,
  matchUpCount: 1,
  matchUpValue: 1,
  collectionName,
});

function teamEvent() {
  mocksEngine.generateTournamentRecord({ setState: true });
  const tieFormat = {
    collectionDefinitions: [{ ...collectionDefinition('Singles'), collectionId: 'fixed-1' }],
    winCriteria: { valueGoal: 1 },
  };
  const result: any = tournamentEngine.addEvent({
    event: { eventId: 'e1', eventName: 'Dual', eventType: TEAM_EVENT, tieFormat },
  });
  expect(result.success).toEqual(true);
  return 'e1';
}

it('mints the collectionId from the supplied tieFormatUuids pool', () => {
  const eventId = teamEvent();
  const result: any = tournamentEngine.addCollectionDefinition({
    collectionDefinition: collectionDefinition('Doubles'),
    tieFormatUuids: ['pooled-collection-id'],
    eventId,
  });
  expect(result.error).toBeUndefined();

  const added = (result.tieFormat?.collectionDefinitions ?? []).find((d: any) => d.collectionName === 'Doubles');
  expect(added).toBeDefined();
  expect(added.collectionId).toEqual('pooled-collection-id');
});

it('refuses rather than minting a fresh id when a supplied pool is exhausted', () => {
  const eventId = teamEvent();
  const result: any = tournamentEngine.addCollectionDefinition({
    collectionDefinition: collectionDefinition('Doubles'),
    tieFormatUuids: [],
    eventId,
  });
  // a silent fresh id here is the divergence this exists to prevent
  expect(result.error).toEqual(INSUFFICIENT_UUIDS);
});

it('still mints when no pool is supplied — the single-execution case', () => {
  const eventId = teamEvent();
  const result: any = tournamentEngine.addCollectionDefinition({
    collectionDefinition: collectionDefinition('Doubles'),
    eventId,
  });
  expect(result.error).toBeUndefined();
  const added = (result.tieFormat?.collectionDefinitions ?? []).find((d: any) => d.collectionName === 'Doubles');
  expect(typeof added?.collectionId).toEqual('string');
});
