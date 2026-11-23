import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

// constants
import { MODIFY_POSITION_ASSIGNMENTS } from '@Constants/topicConstants';

/**
 * MODIFY_POSITION_ASSIGNMENTS carries the structure's `positionAssignments` ARRAY. It carried the getter's result
 * object (`{ positionAssignments }`), so a consumer iterating it threw: courthive-public's live patch
 * (`for (const assignment of pa.assignments)`, fed by CFS's public broadcast) is one. Found by notice batch A,
 * 2026-10-18.
 */

afterEach(() => setSubscriptions({}));

it('the notice payload holds the assignments as an array of drawPositions', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4, automated: false }], setState: true });
  const payloads: any[] = [];
  setSubscriptions({ subscriptions: { [MODIFY_POSITION_ASSIGNMENTS]: (notices: any[]) => payloads.push(...notices) } });

  const { structures } = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const structureId = structures[0].structureId;
  const { participants } = tournamentEngine.getParticipants();
  const result: any = tournamentEngine.assignDrawPosition({
    participantId: participants[0].participantId,
    drawPosition: 1,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  expect(payloads.length).toBeGreaterThan(0);
  const [payload] = payloads;
  expect(Array.isArray(payload.positionAssignments)).toEqual(true);
  expect(payload.positionAssignments.map((assignment: any) => assignment.drawPosition)).toEqual([1, 2, 3, 4]);
  expect(payload.positionAssignments[0].participantId).toEqual(participants[0].participantId);
});
