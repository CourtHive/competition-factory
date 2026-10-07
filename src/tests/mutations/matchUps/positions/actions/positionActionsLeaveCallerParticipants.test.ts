import POLICY_POSITION_ACTIONS_UNRESTRICTED from '@Fixtures/policies/POLICY_POSITION_ACTIONS_UNRESTRICTED';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { ALTERNATE_PARTICIPANT, LUCKY_PARTICIPANT } from '@Constants/positionActionConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';

const hasEntryPosition = (participant: any) => Object.hasOwn(participant, 'entryPosition');

it('positionActions does not write entryPosition onto the participants the caller passes for alternates', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, participantsCount: 6 }],
    setState: true,
  });

  const { upcomingMatchUps } = tournamentEngine.tournamentMatchUps();
  const { structureId, drawPositions } = upcomingMatchUps[0];

  const { participants: tournamentParticipants } = tournamentEngine.getParticipants();
  expect(tournamentParticipants.some(hasEntryPosition)).toEqual(false);

  const result = tournamentEngine.positionActions({
    drawPosition: drawPositions[0],
    tournamentParticipants,
    structureId,
    drawId,
  });

  const alternateAction = result.validActions.find(({ type }) => type === ALTERNATE_PARTICIPANT);
  expect(alternateAction.availableAlternates.length).toBeGreaterThan(0);
  // the caller's participants are not decorated
  expect(tournamentParticipants.some(hasEntryPosition)).toEqual(false);
});

it('positionActions does not write entryPosition onto the participants the caller passes for lucky losers', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 16,
        completionGoal: 12,
        qualifyingProfiles: [{ structureProfiles: [{ qualifyingPositions: 4, drawSize: 16 }] }],
      },
    ],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);
  const { positionAssignments } = tournamentEngine.getPositionAssignments({
    structureId: mainStructure.structureId,
    drawId,
  });
  const qualifierDrawPosition = positionAssignments.find(({ qualifier }) => qualifier)?.drawPosition;
  expect(qualifierDrawPosition).toBeDefined();

  const { participants: tournamentParticipants } = tournamentEngine.getParticipants();
  expect(tournamentParticipants.some(hasEntryPosition)).toEqual(false);

  const result = tournamentEngine.positionActions({
    policyDefinitions: POLICY_POSITION_ACTIONS_UNRESTRICTED,
    structureId: mainStructure.structureId,
    drawPosition: qualifierDrawPosition,
    tournamentParticipants,
    drawId,
  });

  const luckyAction = result.validActions.find(({ type }) => type === LUCKY_PARTICIPANT);
  expect(luckyAction.availableLuckyLosers.length).toBeGreaterThan(0);
  // the action's own copies are decorated
  expect(luckyAction.availableLuckyLosers.every(hasEntryPosition)).toEqual(true);
  // the caller's participants are not
  expect(tournamentParticipants.some(hasEntryPosition)).toEqual(false);
});
