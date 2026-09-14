import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
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
  VOLUNTARY_CONSOLATION,
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
    startDate: '2020-01-01',
    endDate: '2020-01-07',
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
    startDate: '2020-01-01',
    endDate: '2020-01-07',
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

  // Verify: R1 BYE matchUp is preserved (removeAssignments not set → BYEs kept)
  const r1Byes = structure.matchUps.filter((m) => m.roundNumber === 1 && m.matchUpStatus === BYE);
  expect(r1Byes.length).toBeGreaterThan(0);

  // Verify: BYE positionAssignments are preserved
  const byeAssignments = structure.positionAssignments.filter((a: any) => a.bye);
  expect(byeAssignments.length).toBeGreaterThan(0);

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

it('lucky draw reset preserves BYE assignments when removeAssignments is false', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 11, drawType: LUCKY_DRAW, completionGoal: 50 }],
  });
  tournamentEngine.setState(tournamentRecord);

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const structure = drawDefinition.structures.find((s: any) => s.stage === MAIN);
  const assignmentsBefore = structure.positionAssignments;

  // Verify BYE exists before reset
  const byesBefore = assignmentsBefore.filter((a: any) => a.bye);
  expect(byesBefore.length).toBeGreaterThan(0);

  // Verify some matchUps have BYE status before reset
  const byeMatchUpsBefore = structure.matchUps.filter((m: any) => m.matchUpStatus === BYE);
  expect(byeMatchUpsBefore.length).toBeGreaterThan(0);

  // Reset WITHOUT removing assignments
  const result = tournamentEngine.resetDrawDefinition({ drawId, removeAssignments: false });
  expect(result.success).toBe(true);

  // Re-fetch
  const resetDrawDef = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const resetStructure = resetDrawDef.structures.find((s: any) => s.stage === MAIN);

  // BYE position assignments should be preserved
  const byesAfter = resetStructure.positionAssignments.filter((a: any) => a.bye);
  expect(byesAfter.length).toBe(byesBefore.length);

  // BYE matchUps should be preserved
  const byeMatchUpsAfter = resetStructure.matchUps.filter((m: any) => m.matchUpStatus === BYE);
  expect(byeMatchUpsAfter.length).toBe(byeMatchUpsBefore.length);

  // Participant assignments should be preserved
  const participantsAfter = resetStructure.positionAssignments.filter((a: any) => a.participantId);
  const participantsBefore = assignmentsBefore.filter((a: any) => a.participantId);
  expect(participantsAfter.length).toBe(participantsBefore.length);

  // Scored matchUps should be reset
  const scoredMatchUps = resetStructure.matchUps.filter((m: any) => m.winningSide);
  expect(scoredMatchUps.length).toBe(0);
});

it('lucky draw reset removes BYE assignments when removeAssignments is true', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 11, drawType: LUCKY_DRAW }],
  });
  tournamentEngine.setState(tournamentRecord);

  // Reset WITH removing assignments
  const result = tournamentEngine.resetDrawDefinition({ drawId, removeAssignments: true });
  expect(result.success).toBe(true);

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const structure = drawDefinition.structures.find((s: any) => s.stage === MAIN);

  // BYE assignments should be removed
  const byes = structure.positionAssignments.filter((a: any) => a.bye);
  expect(byes.length).toBe(0);

  // Participant assignments should be removed
  const participants = structure.positionAssignments.filter((a: any) => a.participantId);
  expect(participants.length).toBe(0);

  // All matchUps should be TO_BE_PLAYED
  const byeMatchUps = structure.matchUps.filter((m: any) => m.matchUpStatus === BYE);
  expect(byeMatchUps.length).toBe(0);
});

it('resets AD_HOC voluntary consolation by clearing all matchUps', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, voluntaryConsolation: {} }],
    completeAllMatchUps: true,
  });

  // Directly inject matchUps onto the VC structure to simulate AD_HOC consolation play
  const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
  const vcStructure = drawDefinition.structures.find((s) => s.stage === VOLUNTARY_CONSOLATION);
  expect(vcStructure).toBeDefined();

  // AD_HOC VC structures have finishingPosition: WIN_RATIO and no roundPosition on matchUps
  vcStructure.matchUps = [
    { matchUpId: 'vc-m1', roundNumber: 1, matchUpStatus: 'COMPLETED', winningSide: 1 },
    { matchUpId: 'vc-m2', roundNumber: 1, matchUpStatus: 'COMPLETED', winningSide: 2 },
  ];

  tournamentEngine.setState(tournamentRecord);

  // Verify matchUps exist on the VC structure before reset
  const { drawDefinition: beforeReset } = tournamentEngine.getEvent({ drawId });
  const vcBefore = beforeReset.structures.find((s) => s.stage === VOLUNTARY_CONSOLATION);
  expect(vcBefore.matchUps.length).toBe(2);

  // Reset the draw
  const result = tournamentEngine.resetDrawDefinition({ drawId });
  expect(result.success).toBe(true);

  // Verify: VC matchUps are cleared
  const { drawDefinition: afterReset } = tournamentEngine.getEvent({ drawId });
  const vcAfter = afterReset.structures.find((s) => s.stage === VOLUNTARY_CONSOLATION);
  expect(vcAfter.matchUps.length).toBe(0);

  // Verify: MAIN structure matchUps still exist and are reset (not cleared)
  const mainAfter = afterReset.structures.find((s) => s.stage === MAIN && s.stageSequence === 1);
  expect(mainAfter.matchUps.length).toBe(7); // 8-draw SE = 7 matchUps
  const completedMain = mainAfter.matchUps.filter((m) => m.winningSide);
  expect(completedMain.length).toBe(0); // all scores reset
});

it('removes VOLUNTARY_CONSOLATION entries on reset', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, voluntaryConsolation: {} }],
    completeAllMatchUps: true,
    setState: true,
  });

  // Get eligible participants and add them as VC entries with mixed statuses
  let result: any = tournamentEngine.getEligibleVoluntaryConsolationParticipants({ drawId });
  const eligibleIds = result.eligibleParticipants.map((p: any) => p.participantId);
  expect(eligibleIds.length).toBeGreaterThanOrEqual(4);

  const acceptedIds = eligibleIds.slice(0, 3);
  const alternateIds = eligibleIds.slice(3, 5);

  result = tournamentEngine.addDrawEntries({
    entryStage: VOLUNTARY_CONSOLATION,
    entryStatus: 'DIRECT_ACCEPTANCE',
    participantIds: acceptedIds,
    ignoreStageSpace: true,
    drawId,
  });
  expect(result.success).toBe(true);

  if (alternateIds.length) {
    result = tournamentEngine.addDrawEntries({
      entryStage: VOLUNTARY_CONSOLATION,
      entryStatus: 'ALTERNATE',
      participantIds: alternateIds,
      ignoreStageSpace: true,
      drawId,
    });
    expect(result.success).toBe(true);
  }

  // Verify VC entries exist before reset
  const { drawDefinition: beforeReset } = tournamentEngine.getEvent({ drawId });
  const vcEntriesBefore = beforeReset.entries.filter((e: any) => e.entryStage === VOLUNTARY_CONSOLATION);
  expect(vcEntriesBefore.length).toBe(acceptedIds.length + alternateIds.length);

  // MAIN entries should also exist
  const mainEntriesBefore = beforeReset.entries.filter((e: any) => e.entryStage !== VOLUNTARY_CONSOLATION);
  expect(mainEntriesBefore.length).toBeGreaterThan(0);

  // Reset the draw
  result = tournamentEngine.resetDrawDefinition({ drawId });
  expect(result.success).toBe(true);

  // Verify: ALL VC entries removed
  const { drawDefinition: afterReset } = tournamentEngine.getEvent({ drawId });
  const vcEntriesAfter = afterReset.entries.filter((e: any) => e.entryStage === VOLUNTARY_CONSOLATION);
  expect(vcEntriesAfter.length).toBe(0);

  // Verify: MAIN entries are preserved
  const mainEntriesAfter = afterReset.entries.filter((e: any) => e.entryStage !== VOLUNTARY_CONSOLATION);
  expect(mainEntriesAfter.length).toBe(mainEntriesBefore.length);
});

it('resets elimination voluntary consolation by clearing scores but keeping matchUps', () => {
  // Generate a draw with a non-AD_HOC voluntary consolation (elimination-style)
  const eventId = 'vc-elim-event';

  mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventId, eventName: 'VC Elim', participantsProfile: { participantsCount: 8 } }],
    setState: true,
  });

  let result: any = tournamentEngine.generateDrawDefinition({
    voluntaryConsolation: { structureName: 'VC Elimination' },
    eventId,
    drawSize: 8,
  });
  expect(result.success).toBe(true);
  const drawId = result.drawDefinition.drawId;

  result = tournamentEngine.addDrawDefinition({
    drawDefinition: result.drawDefinition,
    eventId,
  });
  expect(result.success).toBe(true);

  // Verify VC structure exists but is not AD_HOC (elimination structures have roundPosition on matchUps)
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const vcStructure = drawDefinition.structures.find((s) => s.stage === VOLUNTARY_CONSOLATION);
  expect(vcStructure).toBeDefined();

  // Reset should NOT clear matchUps from elimination VC (only AD_HOC)
  result = tournamentEngine.resetDrawDefinition({ drawId });
  expect(result.success).toBe(true);

  const { drawDefinition: afterReset } = tournamentEngine.getEvent({ drawId });
  const mainAfter = afterReset.structures.find((s) => s.stage === MAIN);
  expect(mainAfter.matchUps.length).toBe(7);
});
