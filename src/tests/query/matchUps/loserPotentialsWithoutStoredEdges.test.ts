import { matchUpsOf, structuresOf } from '@Acquire/structureMembers';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { FEED_IN_CHAMPIONSHIP, FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';

// A draw that does not store `winnerMatchUpId` / `loserMatchUpId` (an older record, or one the factory did not
// produce) has its targets resolved through `positionTargets`, which hands back COPIES of the in-context matchUps.
// `addPotentialParticipants` re-finds each target in the in-context array before writing to it; the loser target was
// re-found into `winnerMatchUp`, so the loser potentials were pushed onto the copy and lost.
function potentials({ tournamentRecord, drawId, stripEdges }) {
  tournamentRecord = structuredClone(tournamentRecord);
  if (stripEdges) {
    for (const drawDefinition of tournamentRecord.events[0].drawDefinitions) {
      const structures = drawDefinition.structures.flatMap((structure) => [
        structure,
        ...(structuresOf(structure) ?? []),
      ]);
      for (const matchUp of structures.flatMap((structure) => matchUpsOf(structure) ?? [])) {
        delete matchUp.winnerMatchUpId;
        delete matchUp.loserMatchUpId;
      }
    }
  }
  tournamentEngine.setState(tournamentRecord);

  const { matchUps } = tournamentEngine.allDrawMatchUps({ nextMatchUps: true, drawId });
  return Object.fromEntries(
    matchUps
      .filter((matchUp) => matchUp.potentialParticipants?.length)
      .map((matchUp) => [
        matchUp.matchUpId,
        matchUp.potentialParticipants.map((group) => group.map(({ participantId, bye }) => participantId ?? bye)),
      ]),
  );
}

it.each([FEED_IN_CHAMPIONSHIP, FIRST_MATCH_LOSER_CONSOLATION])(
  'a %s draw that stores no edges hydrates the same potential participants as one that does',
  (drawType) => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawType, drawSize: 16 }] });
    const stored = potentials({ tournamentRecord, drawId, stripEdges: false });
    const derived = potentials({ tournamentRecord, drawId, stripEdges: true });

    // the consolation structure is fed by losers: without loser potentials it holds none at all
    expect(Object.keys(stored).length).toBeGreaterThanOrEqual(8);
    expect(derived).toEqual(stored);
  },
);
