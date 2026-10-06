import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

it('clearing a qualifying final with no winner link out of its round removes no qualifier and does not throw', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 40 },
    drawProfiles: [{ drawSize: 32 }],
    setState: true,
  });

  const { event, drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructureId = drawDefinition.structures.find(({ stage }) => stage === MAIN).structureId;
  const enteredIds = event.entries.map(({ participantId }) => participantId);
  const qualifyingIds = tournamentEngine
    .getParticipants()
    .participants.map(({ participantId }) => participantId)
    .filter((participantId) => !enteredIds.includes(participantId))
    .slice(0, 4);
  let result: any = tournamentEngine.addEventEntries({
    eventId: event.eventId,
    participantIds: qualifyingIds,
    entryStage: QUALIFYING,
    drawId,
  });
  expect(result.success).toEqual(true);

  // a one-round qualifying structure, attached with a link whose source is a round it does not have,
  // so its final round (finishingRound 1) has no WINNER link
  result = tournamentEngine.generateQualifyingStructure({
    targetStructureId: mainStructureId,
    qualifyingPositions: 2,
    drawSize: 4,
    drawId,
  });
  const { structure, link } = result;
  result = tournamentEngine.attachQualifyingStructure({
    link: { ...link, source: { ...link.source, roundNumber: 2 } },
    structure,
    drawId,
  });
  expect(result.success).toEqual(true);
  result = tournamentEngine.automatedPositioning({ structureId: structure.structureId, drawId });
  expect(result.success).toEqual(true);

  const qualifyingMatchUp = tournamentEngine
    .allDrawMatchUps({ drawId, inContext: true })
    .matchUps.find((matchUp) => matchUp.structureId === structure.structureId && matchUp.finishingRound === 1);
  result = tournamentEngine.setMatchUpStatus({
    outcome: { scoreString: '6-1 6-1', winningSide: 1 },
    matchUpId: qualifyingMatchUp.matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.setMatchUpStatus({
    policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { autoRemoveQualifiers: true } },
    matchUpId: qualifyingMatchUp.matchUpId,
    outcome: toBePlayed,
    drawId,
  });
  expect(result.error).toBeUndefined();
  expect(result.success).toEqual(true);
  expect(result.qualifierRemoved).toBeUndefined();

  const { matchUp } = tournamentEngine.findMatchUp({ matchUpId: qualifyingMatchUp.matchUpId, drawId });
  expect(matchUp.winningSide).toBeUndefined();
});
