import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, test } from 'vitest';

// constants
import { POSITION_ACTIONS } from '@Constants/extensionConstants';
import { BYE } from '@Constants/matchUpStatusConstants';
import {
  AD_HOC,
  COMPASS,
  FEED_IN_CHAMPIONSHIP,
  LUCKY_DRAW,
  MAIN,
  QUALIFYING,
  ROUND_ROBIN,
} from '@Constants/drawDefinitionConstants';

// prettier-ignore
const scenarios = [
  { drawProfile: { drawSize: 4 }, matchUpsCount: 3 },
  { drawProfile: { drawSize: 32, drawType: COMPASS }, matchUpsCount: 72 },
  { drawProfile: { drawSize: 32, drawType: FEED_IN_CHAMPIONSHIP }, matchUpsCount: 61 },
  { drawProfile: { drawSize: 32, drawType: ROUND_ROBIN }, matchUpsCount: 48, expectAllDrawPositions: true },
  { drawProfile: { drawSize: 8, drawType: AD_HOC, roundsCount: 3, automated: true }, matchUpsCount: 12, expectSideParticipants: true },
];

test.each(scenarios)('drawDefinitions can be reset to initial state', (scenario) => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [scenario.drawProfile],
    completeAllMatchUps: true,
  });
  tournamentEngine.setState(tournamentRecord);

  let { completedMatchUps } = tournamentEngine.tournamentMatchUps();
  expect(completedMatchUps.length).toEqual(scenario.matchUpsCount);

  const result = tournamentEngine.resetDrawDefinition({ drawId });
  expect(result.success).toEqual(true);

  completedMatchUps = tournamentEngine.tournamentMatchUps().completedMatchUps;
  expect(completedMatchUps.length).toEqual(0);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  matchUps.forEach((matchUp) => {
    expect(matchUp.score).toEqual({});
    expect(matchUp.matchUpFormatCodes).toBeUndefined();
    if (scenario.expectAllDrawPositions) {
      expect(matchUp.drawPositions.filter(Boolean).length).toEqual(2);
    }
    if (scenario.expectSideParticipants) {
      matchUp.sides.forEach((side) => {
        expect(side.participant).toBeDefined();
      });
    }
  });
});

it('returns error when drawDefinition is missing', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
  });
  tournamentEngine.setState(tournamentRecord);

  // passing a bogus drawId that won't resolve to a drawDefinition
  const result = tournamentEngine.resetDrawDefinition({ drawId: 'bogusDrawId' });
  expect(result.error).toBeDefined();
});

it('removes scheduling timeItems when removeScheduling is true', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
  });
  tournamentEngine.setState(tournamentRecord);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const matchUpId = matchUps[0].matchUpId;

  // add scheduling data
  let result = tournamentEngine.addMatchUpScheduledDate({ drawId, matchUpId, scheduledDate: '2020-01-01' });
  expect(result.success).toEqual(true);
  result = tournamentEngine.addMatchUpScheduledTime({ drawId, matchUpId, scheduledTime: '08:00' });
  expect(result.success).toEqual(true);
  result = tournamentEngine.addMatchUpStartTime({ drawId, matchUpId, startTime: '2020-01-01T08:05:00Z' });
  expect(result.success).toEqual(true);

  // verify scheduling data was added
  let { matchUps: updatedMatchUps } = tournamentEngine.allTournamentMatchUps();
  const scheduledMatchUp = updatedMatchUps.find((m) => m.matchUpId === matchUpId);
  expect(scheduledMatchUp.schedule).toBeDefined();

  // reset with removeScheduling: true
  result = tournamentEngine.resetDrawDefinition({ drawId, removeScheduling: true });
  expect(result.success).toEqual(true);

  // verify scheduling data was removed
  updatedMatchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const resetMatchUp = updatedMatchUps.find((m) => m.matchUpId === matchUpId);
  expect(resetMatchUp.schedule?.scheduledDate).toBeUndefined();
  expect(resetMatchUp.schedule?.scheduledTime).toBeUndefined();
});

it('filters scheduling timeItems but keeps non-scheduling timeItems when removeScheduling is false', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
  });
  tournamentEngine.setState(tournamentRecord);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const matchUpId = matchUps[0].matchUpId;

  // add scheduling data
  let result = tournamentEngine.addMatchUpScheduledDate({ drawId, matchUpId, scheduledDate: '2020-01-01' });
  expect(result.success).toEqual(true);
  result = tournamentEngine.addMatchUpScheduledTime({ drawId, matchUpId, scheduledTime: '08:00' });
  expect(result.success).toEqual(true);
  // also add a start time (non-scheduling timeItem type)
  result = tournamentEngine.addMatchUpStartTime({ drawId, matchUpId, startTime: '2020-01-01T08:05:00Z' });
  expect(result.success).toEqual(true);

  // reset WITHOUT removeScheduling — should filter scheduling timeItems but keep others
  result = tournamentEngine.resetDrawDefinition({ drawId, removeScheduling: false });
  expect(result.success).toEqual(true);

  const updatedMatchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const resetMatchUp = updatedMatchUps.find((m) => m.matchUpId === matchUpId);
  // scheduling timeItems should be removed
  expect(resetMatchUp.schedule?.scheduledDate).toBeUndefined();
  expect(resetMatchUp.schedule?.scheduledTime).toBeUndefined();
  // start time is not a scheduling-type timeItem so it should be retained
  expect(resetMatchUp.schedule?.startTime).toBeDefined();
});

it('preserves BYE matchUpStatus during reset', () => {
  // drawSize=8 with only 6 participants forces 2 BYE positions
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, participantsCount: 6 }],
    completeAllMatchUps: true,
  });
  tournamentEngine.setState(tournamentRecord);

  // check for BYE matchUps before reset
  const { matchUps: beforeMatchUps } = tournamentEngine.allTournamentMatchUps();
  const byeMatchUpsBefore = beforeMatchUps.filter((m) => m.matchUpStatus === BYE);
  expect(byeMatchUpsBefore.length).toBeGreaterThan(0);

  const result = tournamentEngine.resetDrawDefinition({ drawId });
  expect(result.success).toEqual(true);

  // BYE matchUps should retain their status
  const { matchUps: afterMatchUps } = tournamentEngine.allTournamentMatchUps();
  const byeMatchUpsAfter = afterMatchUps.filter((m) => m.matchUpStatus === BYE);
  expect(byeMatchUpsAfter.length).toEqual(byeMatchUpsBefore.length);
});

it('resets positionAssignments for non-main/qualifying structures (e.g. COMPASS)', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, drawType: COMPASS }],
    completeAllMatchUps: true,
  });
  tournamentEngine.setState(tournamentRecord);

  const result = tournamentEngine.resetDrawDefinition({ drawId });
  expect(result.success).toEqual(true);

  // get the draw definition to inspect structures
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structures = drawDefinition.structures || [];

  for (const structure of structures) {
    const { positionAssignments, stage, stageSequence } = structure;
    if (positionAssignments && (stageSequence !== 1 || ![QUALIFYING, MAIN].includes(stage))) {
      // non-main/qualifying structures should have participantId removed
      positionAssignments.forEach((assignment) => {
        expect(assignment.participantId).toBeUndefined();
      });
      // seed assignments should be cleared
      expect(structure.seedAssignments).toEqual([]);
    }
  }
});

it('filters positionActions extension from draw definition on reset', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
    completeAllMatchUps: true,
  });
  tournamentEngine.setState(tournamentRecord);

  // add a positionActions extension to the draw
  let result = tournamentEngine.addDrawDefinitionExtension({
    drawId,
    extension: { name: POSITION_ACTIONS, value: { someAction: true } },
  });
  expect(result.success).toEqual(true);

  // also add a non-positionActions extension to verify it survives
  result = tournamentEngine.addDrawDefinitionExtension({
    drawId,
    extension: { name: 'otherExtension', value: { data: 'keep' } },
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.resetDrawDefinition({ drawId });
  expect(result.success).toEqual(true);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const extensionNames = (drawDefinition.extensions || []).map((ext) => ext.name);
  // positionActions should be removed
  expect(extensionNames).not.toContain(POSITION_ACTIONS);
  // other extensions should survive
  expect(extensionNames).toContain('otherExtension');
});

it('removes all position assignments when removeAssignments is true', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    completeAllMatchUps: true,
  });
  tournamentEngine.setState(tournamentRecord);

  // Before reset: MAIN stageSequence 1 should have participantIds
  let { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructure = drawDefinition.structures.find((s) => s.stage === MAIN && s.stageSequence === 1);
  const assignedBefore = mainStructure.positionAssignments.filter((a) => a.participantId);
  expect(assignedBefore.length).toBeGreaterThan(0);

  // Reset WITHOUT removeAssignments — should preserve main draw assignments
  let result = tournamentEngine.resetDrawDefinition({ drawId });
  expect(result.success).toEqual(true);

  ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
  const mainAfterNormal = drawDefinition.structures.find((s) => s.stage === MAIN && s.stageSequence === 1);
  const assignedAfterNormal = mainAfterNormal.positionAssignments.filter((a) => a.participantId);
  expect(assignedAfterNormal.length).toEqual(assignedBefore.length);

  // Reset WITH removeAssignments — should clear all participantIds
  result = tournamentEngine.resetDrawDefinition({ drawId, removeAssignments: true });
  expect(result.success).toEqual(true);

  ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
  const mainAfterRemove = drawDefinition.structures.find((s) => s.stage === MAIN && s.stageSequence === 1);
  const assignedAfterRemove = mainAfterRemove.positionAssignments.filter((a) => a.participantId);
  expect(assignedAfterRemove.length).toEqual(0);
  expect(mainAfterRemove.seedAssignments).toEqual([]);
});

it('clears matchUp extensions and notes on reset', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
    completeAllMatchUps: true,
  });

  // directly inject extensions and notes onto raw matchUps before setting state
  const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
  const rawMatchUp = drawDefinition.structures[0].matchUps[0];
  const matchUpId = rawMatchUp.matchUpId;
  rawMatchUp.extensions = [{ name: 'testExtension', value: { test: true } }];
  rawMatchUp.notes = 'test notes';

  tournamentEngine.setState(tournamentRecord);

  const result = tournamentEngine.resetDrawDefinition({ drawId });
  expect(result.success).toEqual(true);

  // inspect the raw draw definition to verify extensions/notes were removed
  const { drawDefinition: resetDraw } = tournamentEngine.getEvent({ drawId });
  const resetRawMatchUp = resetDraw.structures[0].matchUps.find((m) => m.matchUpId === matchUpId);
  expect(resetRawMatchUp.extensions).toBeUndefined();
  expect(resetRawMatchUp.notes).toBeUndefined();
});

it('resets lucky draw: removes virtual positions, clears R2+ matchUps, keeps R1 BYE', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 9, drawType: LUCKY_DRAW }],
    completeAllMatchUps: true,
  });
  tournamentEngine.setState(tournamentRecord);

  // Advance round 1 (creates virtual positions for R2)
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;
  const status = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
  const round1 = status.rounds.find((r) => r.roundNumber === 1);
  const loser = round1.eligibleLosers[0];
  let result = tournamentEngine.luckyDrawAdvancement({
    participantId: loser.participantId,
    roundNumber: 1,
    structureId,
    drawId,
  });
  expect(result.success).toBe(true);

  // Verify R2 has positions before reset
  const { drawDefinition: beforeReset } = tournamentEngine.getEvent({ drawId });
  const r2Before = beforeReset.structures[0].matchUps.filter((m) => m.roundNumber === 2);
  expect(r2Before.some((m) => m.drawPositions?.filter(Boolean).length === 2)).toBe(true);

  // Reset
  result = tournamentEngine.resetDrawDefinition({ drawId });
  expect(result.success).toBe(true);

  // Verify: R2+ matchUps have no drawPositions
  const { drawDefinition: afterReset } = tournamentEngine.getEvent({ drawId });
  const structure = afterReset.structures[0];
  const r2After = structure.matchUps.filter((m) => m.roundNumber === 2);
  for (const m of r2After) {
    const filledPositions = (m.drawPositions || []).filter(Boolean);
    expect(filledPositions.length).toBe(0);
    expect(m.matchUpStatus).not.toBe(BYE);
  }

  // Verify: R1 BYE matchUp is reset (BYE positionAssignment removed, so no BYE matchUps)
  const r1Byes = structure.matchUps.filter((m) => m.roundNumber === 1 && m.matchUpStatus === BYE);
  expect(r1Byes.length).toBe(0);

  // Verify: no BYE positionAssignments remain
  const byeAssignments = structure.positionAssignments.filter((a: any) => a.bye);
  expect(byeAssignments.length).toBe(0);

  // Verify: no orphaned positionAssignments (only initial R1 participant positions remain)
  const r1Positions = new Set(
    structure.matchUps
      .filter((m) => m.roundNumber === 1)
      .flatMap((m) => m.drawPositions || [])
      .filter(Boolean),
  );
  for (const a of structure.positionAssignments) {
    expect(r1Positions.has(a.drawPosition)).toBe(true);
  }

  // Verify: R1 scored matchUps are reset to TO_BE_PLAYED
  const r1Scored = structure.matchUps.filter((m) => m.roundNumber === 1 && m.matchUpStatus !== BYE);
  for (const m of r1Scored) {
    expect(m.winningSide).toBeUndefined();
  }
});
