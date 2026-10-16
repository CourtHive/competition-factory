import { getStructureDrawPositionProfiles } from '@Query/structure/getStructureDrawPositionProfiles';
import { getMatchUpDependencies } from '@Query/matchUps/getMatchUpDependencies';
import { matchUpsOf, structuresOf } from '@Acquire/structureMembers';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { FEED_IN_CHAMPIONSHIP, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

// `getMatchUpDependencies` is a query, and it repaired the record it read: on a draw that does not store
// `winnerMatchUpId` / `loserMatchUpId` it ran `addGoesTo` on the STORED draw, writing the edges, a widened
// `finishingPositionRange.loser` and a lone foreign structure's finishing rounds. The edges are now derived on a copy.
const storedMatchUps = (tournamentRecord) =>
  tournamentRecord.events[0].drawDefinitions[0].structures
    .flatMap((structure) => [structure, ...(structuresOf(structure) ?? [])])
    .flatMap((structure) => matchUpsOf(structure) ?? []);

const generate = (drawProfile) => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile] });
  return { drawId, tournamentRecord };
};

const withoutEdges = (tournamentRecord) => {
  const stripped = structuredClone(tournamentRecord);
  for (const matchUp of storedMatchUps(stripped)) {
    delete matchUp.winnerMatchUpId;
    delete matchUp.loserMatchUpId;
    delete matchUp.finishingPositionRange;
  }
  return stripped;
};

it.each([
  ['the tournament', (tournamentRecord) => ({ tournamentRecord })],
  ['the draw', (tournamentRecord) => ({ drawDefinition: tournamentRecord.events[0].drawDefinitions[0] })],
])('reading %s that stores no edges leaves it as it was, and finds the same dependencies', (_, scope) => {
  const { tournamentRecord } = generate({ drawType: FEED_IN_CHAMPIONSHIP, drawSize: 16 });
  const stored: any = getMatchUpDependencies(scope(tournamentRecord));

  const stripped = withoutEdges(tournamentRecord);
  const before = structuredClone(stripped);
  const derived: any = getMatchUpDependencies(scope(stripped));

  expect(derived.success).toEqual(true);
  expect(stripped).toEqual(before);
  // a dependency read from a derived edge is the dependency the stored edge gives
  expect(Object.keys(stored.matchUpDependencies).length).toBeGreaterThan(16);
  for (const [matchUpId, dependency] of Object.entries<any>(stored.matchUpDependencies)) {
    expect(derived.matchUpDependencies[matchUpId].matchUpIds.toSorted()).toEqual(dependency.matchUpIds.toSorted());
    expect(derived.matchUpDependencies[matchUpId].dependentMatchUpIds.toSorted()).toEqual(
      dependency.dependentMatchUpIds.toSorted(),
    );
  }
});

it('a one-round foreign draw is not given its finishing rounds by a read', () => {
  const { drawId, tournamentRecord } = generate({ drawType: SINGLE_ELIMINATION, drawSize: 2 });
  const stripped = withoutEdges(tournamentRecord);
  const before = structuredClone(stripped);

  const result: any = getMatchUpDependencies({ tournamentRecord: stripped, drawIds: [drawId] });
  expect(result.success).toEqual(true);
  expect(stripped).toEqual(before);
});

// The repair was also late for the call that made it: a caller hydrates its matchUps, then asks for their dependencies,
// so on a draw that stores no edges the FIRST call read none and only the next saw what it had written. Measured on
// the ingest corpus: a UTR event's 63-matchUp structure reported different activeDependentMatchUpIds on its first
// call than on every later one.
it('the first read of a draw that stores no edges finds the active dependents the stored edges give', () => {
  const { tournamentRecord } = generate({
    drawType: FEED_IN_CHAMPIONSHIP,
    drawSize: 16,
    // a second-round result: its first-round sources are what a missing edge drops
    outcomes: [
      { roundNumber: 1, roundPosition: 1, scoreString: '6-1 6-1', winningSide: 1 },
      { roundNumber: 1, roundPosition: 2, scoreString: '6-1 6-1', winningSide: 1 },
      { roundNumber: 2, roundPosition: 1, scoreString: '6-1 6-1', winningSide: 1 },
    ],
  });
  const activeDependents = (record) => {
    const event = record.events[0];
    const drawDefinition = event.drawDefinitions[0];
    return drawDefinition.structures.map(
      ({ structureId }) =>
        getStructureDrawPositionProfiles({ drawDefinition, structureId, event }).activeDependentMatchUpIds,
    );
  };

  const stored = activeDependents(tournamentRecord);
  expect(stored.flat().length).toBeGreaterThan(0);
  expect(activeDependents(withoutEdges(tournamentRecord))).toEqual(stored);
});
