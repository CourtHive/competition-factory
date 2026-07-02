import {
  getStructureInconsistencies,
  WINNING_SIDE_ADVANCEMENT_MISMATCH,
  WINNING_SIDE_WITHOUT_PARTICIPANT,
  DRAW_POSITION_UNASSIGNED,
  DRAW_POSITIONS_NOT_SORTED,
  EXIT_CODE_ON_WINNER_SIDE,
  EXIT_WITHOUT_LOSER,
} from '@Query/drawDefinition/getStructureInconsistencies';
import { removeAssignment } from '../mutations/drawDefinitions/testingUtilities';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Tests/engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

import {
  COMPASS,
  FIRST_MATCH_LOSER_CONSOLATION,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
  ROUND_ROBIN,
} from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';

const matchUpAt = (drawId, roundNumber, roundPosition) =>
  tournamentEngine
    .allDrawMatchUps({ drawId, inContext: true })
    .matchUps.find((m) => m.roundNumber === roundNumber && m.roundPosition === roundPosition);

const matchUpInStructure = (drawId, structureId, roundNumber, roundPosition) =>
  tournamentEngine
    .allDrawMatchUps({ drawId, inContext: true })
    .matchUps.find(
      (m) => m.structureId === structureId && m.roundNumber === roundNumber && m.roundPosition === roundPosition,
    );

test.for([[SINGLE_ELIMINATION], [FIRST_MATCH_LOSER_CONSOLATION], [COMPASS], [ROUND_ROBIN_WITH_PLAYOFF]])(
  'reports no inconsistencies for a fully-completed %s draw',
  ([drawType]) => {
    setSubscriptions({});
    const drawId = `clean-${drawType}`;
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 16, drawType }],
      completeAllMatchUps: true,
      setState: true,
    });
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const result: any = tournamentEngine.getStructureInconsistencies({ drawId });
    expect(result.valid).toEqual(true);
    expect(result.inconsistencies).toEqual([]);
    // engine resolves the same drawDefinition
    expect(drawDefinition.drawId).toEqual(drawId);
  },
);

test('detects an advancement mismatch when a completed matchUp winningSide is corrupted to the loser', () => {
  setSubscriptions({});
  const drawId = 'corrupt';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 8, drawType: SINGLE_ELIMINATION, idPrefix: 'm' }],
    completeAllMatchUps: true,
    setState: true,
  });
  // baseline: clean
  expect(tournamentEngine.getStructureInconsistencies({ drawId }).valid).toEqual(true);

  // corrupt: flip a round-1 matchUp's winningSide to the loser while the real winner
  // has already advanced to round 2 (simulates the winningSide/drawPositions drift class).
  // getEvent returns a deep copy — mutate it and run the query directly on that copy.
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structure = drawDefinition.structures[0];
  const r1 = structure.matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 1 && m.winningSide);
  r1.winningSide = r1.winningSide === 1 ? 2 : 1;

  const result: any = getStructureInconsistencies({ drawDefinition });
  expect(result.valid).toEqual(false);
  const mismatch = result.inconsistencies.find((i) => i.matchUpId === r1.matchUpId);
  expect(mismatch?.issueType).toEqual(WINNING_SIDE_ADVANCEMENT_MISMATCH);
});

test('detects an exit code sitting on the winning side', () => {
  setSubscriptions({});
  const drawId = 'exitcode';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 8, drawType: SINGLE_ELIMINATION, idPrefix: 'm' }],
    setState: true,
  });
  // a normal WALKOVER: winner side has no code, loser side carries the code
  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: WALKOVER, winningSide: 1, matchUpStatusCodes: ['', 'W1'] },
    matchUpId: matchUpAt(drawId, 1, 1).matchUpId,
    drawId,
  });
  expect(tournamentEngine.getStructureInconsistencies({ drawId }).valid).toEqual(true);

  // corrupt: move the code onto the winning side (side 1) on the deep-copied drawDefinition
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const stored = drawDefinition.structures[0].matchUps.find((m) => m.matchUpId === matchUpAt(drawId, 1, 1).matchUpId);
  stored.matchUpStatusCodes = ['W1', ''];

  const result: any = getStructureInconsistencies({ drawDefinition });
  const issue = result.inconsistencies.find((i) => i.matchUpId === stored.matchUpId);
  expect(issue?.issueType).toEqual(EXIT_CODE_ON_WINNER_SIDE);
});

test('a legitimately PENDING propagated exit is NOT reported as inconsistent', () => {
  setSubscriptions({});
  const drawId = 'pendingExit';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 32, drawType: FIRST_MATCH_LOSER_CONSOLATION, idPrefix: 'm' }],
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructureId = drawDefinition.structures[0].structureId;
  [2, 6, 8, 10, 23, 31].forEach((drawPosition) =>
    removeAssignment({ drawId, structureId: mainStructureId, drawPosition, replaceWithBye: true }),
  );
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
  tournamentEngine.setMatchUpStatus({
    matchUpId: matchUpInStructure(drawId, mainStructureId, 1, 2).matchUpId,
    outcome,
    drawId,
  });
  // propagate a WALKOVER into the consolation → pending exit (empty winner slot)
  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: WALKOVER, winningSide: 2, matchUpStatusCodes: ['W1'] },
    propagateExitStatus: true,
    matchUpId: matchUpInStructure(drawId, mainStructureId, 2, 2).matchUpId,
    drawId,
  });

  const result: any = tournamentEngine.getStructureInconsistencies({ drawId });
  expect(result.valid).toEqual(true);
});

test('detects unsorted drawPositions', () => {
  setSubscriptions({});
  const drawId = 'unsorted';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 8, drawType: SINGLE_ELIMINATION, idPrefix: 'm' }],
    completeAllMatchUps: true,
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const target = drawDefinition.structures[0].matchUps.find(
    (m) => (m.drawPositions ?? []).filter(Boolean).length === 2,
  );
  target.drawPositions = [...target.drawPositions].sort((a, b) => b - a); // descending

  const result: any = getStructureInconsistencies({ drawDefinition });
  const issue = result.inconsistencies.find((i) => i.matchUpId === target.matchUpId);
  expect(issue?.issueType).toEqual(DRAW_POSITIONS_NOT_SORTED);
});

test('round-robin group matchUps are exempt from the drawPositions-sorted check', () => {
  // RR groups store drawPositions in Berger round-pairing order (e.g. [10,7]); the engine
  // normalizes to ascending when deriving sides, so unsorted order is benign. Confirmed
  // against the full prod corpus (2026-07-01). Elimination structures still assert the sort.
  setSubscriptions({});
  const drawId = 'rrUnsorted';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 8, drawType: ROUND_ROBIN, idPrefix: 'rr' }],
    completeAllMatchUps: true,
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  // RR group structures are ITEM children of the CONTAINER
  const group = drawDefinition.structures[0].structures.find((s) => (s.matchUps ?? []).length);
  const target = group.matchUps.find((m) => (m.drawPositions ?? []).filter(Boolean).length === 2);
  target.drawPositions = [...target.drawPositions].sort((a, b) => b - a); // force descending

  const result: any = getStructureInconsistencies({ drawDefinition });
  const flagged = result.inconsistencies.filter(
    (i) => i.matchUpId === target.matchUpId && i.issueType === DRAW_POSITIONS_NOT_SORTED,
  );
  expect(flagged).toEqual([]);
});

test('detects an exit with no participant on the losing side', () => {
  setSubscriptions({});
  const drawId = 'noloser';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 8, drawType: SINGLE_ELIMINATION, idPrefix: 'm' }],
    setState: true,
  });
  const woMatchUp = matchUpAt(drawId, 1, 1);
  const loserDrawPosition = woMatchUp.sides.find((s) => s.sideNumber === 2).drawPosition;
  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: WALKOVER, winningSide: 1, matchUpStatusCodes: ['', 'W1'] },
    matchUpId: woMatchUp.matchUpId,
    drawId,
  });
  expect(tournamentEngine.getStructureInconsistencies({ drawId }).valid).toEqual(true);

  // corrupt: clear the losing participant's assignment (a walkover with nobody who walked over)
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const assignment = drawDefinition.structures[0].positionAssignments.find((a) => a.drawPosition === loserDrawPosition);
  delete assignment.participantId;

  const result: any = getStructureInconsistencies({ drawDefinition });
  const issue = result.inconsistencies.find((i) => i.matchUpId === woMatchUp.matchUpId);
  expect(issue?.issueType).toEqual(EXIT_WITHOUT_LOSER);
});

test('detects a decided matchUp referencing an unassigned (phantom) losing drawPosition', () => {
  setSubscriptions({});
  const drawId = 'phantom';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 8, drawType: SINGLE_ELIMINATION, idPrefix: 'm' }],
    completeAllMatchUps: true,
    setState: true,
  });
  expect(tournamentEngine.getStructureInconsistencies({ drawId }).valid).toEqual(true);

  // corrupt: on a completed, non-exit round-1 matchUp, clear the LOSING participant's
  // stored positionAssignment. inContext derivation silently resolves that slot to a side
  // with no participantId; no winning-side / exit check inspects the losing side of a
  // non-exit, so only the stored-state phantom pass surfaces it.
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structure = drawDefinition.structures[0];
  const target = structure.matchUps.find(
    (m) => m.roundNumber === 1 && m.winningSide && (m.drawPositions ?? []).filter(Boolean).length === 2,
  );
  // clear the assignment for the loser's drawPosition (the one NOT on the winning side)
  const winnerDrawPosition = target.drawPositions[target.winningSide - 1];
  const loserDrawPosition = target.drawPositions.find((dp) => dp !== winnerDrawPosition);
  const assignment = structure.positionAssignments.find((a) => a.drawPosition === loserDrawPosition);
  delete assignment.participantId;

  const result: any = getStructureInconsistencies({ drawDefinition });
  expect(result.valid).toEqual(false);
  const forMatchUp = result.inconsistencies.filter((i) => i.matchUpId === target.matchUpId);
  const phantom = forMatchUp.find((i) => i.issueType === DRAW_POSITION_UNASSIGNED);
  expect(phantom).toBeTruthy();
  expect(phantom.phantomPositions).toContain(loserDrawPosition);
  // proves the stored pass is not redundant with the inContext winning-side check:
  // clearing a LOSING slot produces no WINNING_SIDE_WITHOUT_PARTICIPANT for this matchUp
  expect(forMatchUp.some((i) => i.issueType === WINNING_SIDE_WITHOUT_PARTICIPANT)).toEqual(false);
});

test('a pending propagated exit with an empty slot is NOT flagged as a phantom position', () => {
  setSubscriptions({});
  const drawId = 'phantomPending';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 32, drawType: FIRST_MATCH_LOSER_CONSOLATION, idPrefix: 'm' }],
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructureId = drawDefinition.structures[0].structureId;
  [2, 6, 8, 10, 23, 31].forEach((drawPosition) =>
    removeAssignment({ drawId, structureId: mainStructureId, drawPosition, replaceWithBye: true }),
  );
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
  tournamentEngine.setMatchUpStatus({
    matchUpId: matchUpInStructure(drawId, mainStructureId, 1, 2).matchUpId,
    outcome,
    drawId,
  });
  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: WALKOVER, winningSide: 2, matchUpStatusCodes: ['W1'] },
    propagateExitStatus: true,
    matchUpId: matchUpInStructure(drawId, mainStructureId, 2, 2).matchUpId,
    drawId,
  });

  const result: any = tournamentEngine.getStructureInconsistencies({ drawId });
  expect(result.inconsistencies.some((i) => i.issueType === DRAW_POSITION_UNASSIGNED)).toEqual(false);
  expect(result.valid).toEqual(true);
});

test('a consolation exit PRODUCED by an upstream double-walkover is NOT flagged as an orphan', () => {
  // regression for the EXIT_WITHOUT_LOSER false positive the CI sweep surfaced: a main-draw
  // DOUBLE_WALKOVER feeds an empty loser slot into consolation, which the engine legitimately
  // resolves to a WALKOVER (stamped previousMatchUpStatus). That empty losing slot is correct.
  setSubscriptions({});
  const drawId = 'producedExit';
  const { drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawId,
        drawSize: 8,
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        idPrefix: 'pe',
        outcomes: [{ roundNumber: 1, roundPosition: 1, matchUpStatus: DOUBLE_WALKOVER }],
      },
    ],
    completeAllMatchUps: true,
    setState: true,
  });
  expect(drawIds).toContain(drawId);

  const result: any = tournamentEngine.getStructureInconsistencies({ drawId });
  const producedExits = result.inconsistencies.filter((i) => i.issueType === EXIT_WITHOUT_LOSER);
  expect(producedExits).toEqual([]);
  expect(result.valid).toEqual(true);
});

// Corpus sweep: no legitimately-generated, fully-completed draw should report any
// inconsistency. Guards against false positives in every check across draw types/sizes.
test.for([
  [SINGLE_ELIMINATION, 8],
  [SINGLE_ELIMINATION, 32],
  [FIRST_MATCH_LOSER_CONSOLATION, 16],
  [FIRST_MATCH_LOSER_CONSOLATION, 32],
  [COMPASS, 16],
  [COMPASS, 32],
  [ROUND_ROBIN_WITH_PLAYOFF, 16],
])('corpus sweep: %s drawSize %d completes with zero inconsistencies', ([drawType, drawSize]) => {
  setSubscriptions({});
  const drawId = `sweep-${drawType}-${drawSize}`;
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize, drawType }],
    completeAllMatchUps: true,
    setState: true,
  });
  const result: any = tournamentEngine.getStructureInconsistencies({ drawId });
  expect(result.inconsistencies).toEqual([]);
  expect(result.valid).toEqual(true);
});
