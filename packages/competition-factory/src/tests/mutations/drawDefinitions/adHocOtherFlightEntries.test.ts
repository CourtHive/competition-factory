import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { POLICY_TYPE_POSITION_ACTIONS } from '@Constants/policyConstants';
import { AD_HOC } from '@Constants/drawDefinitionConstants';
import { ALTERNATE } from '@Constants/entryStatusConstants';

/**
 * Two AD_HOC flights of one event, each with its own participants. With the position actions policy's
 * `otherFlightEntries`, a side in one flight is offered the other flight's entered participants as
 * alternates, as it already is in elimination draws (getValidAlternatesAction).
 */
function setup({ otherFlightEntries }: { otherFlightEntries?: boolean }) {
  const policyDefinitions = { [POLICY_TYPE_POSITION_ACTIONS]: { otherFlightEntries, enabledStructures: [] } };
  const {
    drawIds: [drawId, otherDrawId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [
      {
        drawProfiles: [
          { drawType: AD_HOC, drawSize: 4, uniqueParticipants: true },
          { drawType: AD_HOC, drawSize: 4, uniqueParticipants: true },
        ],
        policyDefinitions,
      },
    ],
    setState: true,
  });

  // an empty round in the first flight, so its sides are open to assignment
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;
  const generated = tournamentEngine.generateAdHocMatchUps({ drawId, matchUpsCount: 2, newRound: true });
  expect(tournamentEngine.addAdHocMatchUps({ matchUps: generated.matchUps, drawId, structureId }).success).toEqual(
    true,
  );
  const matchUp = generated.matchUps[0];

  const thisFlightParticipantIds = drawDefinition.entries.map(({ participantId }) => participantId);
  const otherFlightParticipantIds = tournamentEngine
    .getEvent({ drawId: otherDrawId })
    .drawDefinition.entries.map(({ participantId }) => participantId);
  expect(otherFlightParticipantIds.some((participantId) => thisFlightParticipantIds.includes(participantId))).toEqual(
    false,
  );

  const { validActions } = tournamentEngine.matchUpActions({ matchUpId: matchUp.matchUpId, sideNumber: 1, drawId });
  return { validActions, otherFlightParticipantIds };
}

test('an AD_HOC side is offered the other flight entries as alternates when the policy allows it', () => {
  const { validActions, otherFlightParticipantIds } = setup({ otherFlightEntries: true });

  expect(otherFlightParticipantIds.length).toEqual(4);
  const alternateAction = validActions.find(({ type }) => type === ALTERNATE);
  expect(alternateAction).toBeDefined();
  expect([...alternateAction.availableParticipantIds].sort((a, b) => a.localeCompare(b))).toEqual(
    [...otherFlightParticipantIds].sort((a, b) => a.localeCompare(b)),
  );
});

test('an AD_HOC side is offered no other flight entries without the policy', () => {
  const { validActions, otherFlightParticipantIds } = setup({ otherFlightEntries: false });

  expect(otherFlightParticipantIds.length).toEqual(4);
  const offered = validActions.find(({ type }) => type === ALTERNATE)?.availableParticipantIds ?? [];
  expect(offered.filter((participantId) => otherFlightParticipantIds.includes(participantId))).toEqual([]);
});
