import { POLICY_RATINGS_ELO_538_TENNIS } from '@Fixtures/policies/POLICY_RATINGS_ELO_538_TENNIS';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import scaleEngine from '@Engines/scaleEngine';
import { expect, it, test } from 'vitest';

// constants
import { INVALID_SCALE_ITEM, INVALID_VALUES, PARTICIPANT_NOT_FOUND } from '@Constants/errorConditionConstants';
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_RATINGS } from '@Constants/policyConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import { TEAM } from '@Constants/participantConstants';

// RATINGS-103: generateDynamicRatings validates before it writes, writes all or nothing, returns the write's error,
// and says which matchUps it rated apart from which it processed. RATINGS-101: it sorts a copy of params.matchUps.

const policy538 = POLICY_RATINGS_ELO_538_TENNIS[POLICY_TYPE_RATINGS];
const outcomes = [
  { roundNumber: 1, roundPosition: 1, scoreString: '6-1 6-2', winningSide: 1 },
  { roundNumber: 1, roundPosition: 2, scoreString: '6-1 6-2', winningSide: 1 },
  { roundNumber: 2, roundPosition: 1, scoreString: '6-4 3-6 6-2', winningSide: 1 },
];
const base = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4, outcomes }] }).tournamentRecord;

function setup() {
  tournamentEngine.setState(makeDeepCopy(base));
  const matchUps = makeDeepCopy(tournamentEngine.allTournamentMatchUps().matchUps);
  const participantIds: string[] = [
    ...new Set<string>(matchUps.flatMap((m: any) => m.sides.map((s: any) => s.participantId)).filter(Boolean)),
  ];
  return { matchUps, matchUpIds: matchUps.map((m: any) => m.matchUpId), participantIds };
}

function participantsWithEloWritten() {
  const { participants } = tournamentEngine.getParticipants();
  return participants.filter((p: any) => (p.timeItems ?? []).some((t: any) => String(t.itemType).includes('ELO')));
}

test.each([-5, -6, '3', Number.NaN, 1.5, Infinity, null])('a career count of %s is refused', (count) => {
  const { matchUpIds, participantIds } = setup();
  const matchesPlayed = Object.fromEntries(participantIds.map((id) => [id, count]));
  let result: any = scaleEngine.generateDynamicRatings({
    updateParticipantRatings: true,
    ratingsPolicy: policy538,
    matchesPlayed,
    matchUpIds,
  });
  expect(result.error).toEqual(INVALID_VALUES);
  expect(result.modifiedScaleValues).toBeUndefined();
  expect(participantsWithEloWritten()).toHaveLength(0);

  // one bad count among good ones is refused too
  const mixed = Object.fromEntries(participantIds.map((id, i) => [id, i ? 10 : count]));
  result = scaleEngine.generateDynamicRatings({ ratingsPolicy: policy538, matchesPlayed: mixed, matchUpIds });
  expect(result.error).toEqual(INVALID_VALUES);
});

it('valid career counts (including 0) still rate', () => {
  const { matchUpIds, participantIds } = setup();
  const matchesPlayed = Object.fromEntries(participantIds.map((id, i) => [id, i % 2 ? 0 : 12]));
  let result: any = scaleEngine.generateDynamicRatings({ ratingsPolicy: policy538, matchesPlayed, matchUpIds });
  expect(result.success).toEqual(true);
  for (const id of participantIds) expect(Number.isFinite(result.modifiedScaleValues[id].scaleValue)).toEqual(true);
  expect(result.ratedMatchUpIds).toEqual(result.processedMatchUpIds);
});

it('a participant missing from the record refuses the write and writes nothing', () => {
  const { matchUps } = setup();
  const final = matchUps.find((m: any) => m.roundNumber === 2);
  final.sides[0].participant = { ...final.sides[0].participant, participantId: 'ghost' };
  final.sides[0].participantId = 'ghost';

  let result: any = scaleEngine.generateDynamicRatings({
    matchUpIds: matchUps.map((m: any) => m.matchUpId),
    updateParticipantRatings: true,
    matchUps,
  });
  expect(result.error).toEqual(PARTICIPANT_NOT_FOUND);
  expect(result.success).toBeUndefined();
  // the round 1 matchUps were rated before the final: none of their values were written either
  expect(participantsWithEloWritten()).toHaveLength(0);
});

it('a write that fails part way restores the participants already written', () => {
  const { matchUps } = setup();
  const teamId = 'team-participant';
  let result: any = tournamentEngine.addParticipant({
    participant: { participantId: teamId, participantType: TEAM, participantRole: COMPETITOR, participantName: 'Team' },
  });
  expect(result.success).toEqual(true);

  // a SINGLES rating cannot be written to a TEAM: setParticipantScaleItem refuses it after the others are written
  const final = matchUps.find((m: any) => m.roundNumber === 2);
  final.sides[0].participant = { participantId: teamId, participantType: TEAM };
  final.sides[0].participantId = teamId;

  result = scaleEngine.generateDynamicRatings({
    matchUpIds: matchUps.map((m: any) => m.matchUpId),
    updateParticipantRatings: true,
    matchUps,
  });
  expect(result.error).toEqual(INVALID_SCALE_ITEM);
  expect(participantsWithEloWritten()).toHaveLength(0);
});

it('a successful write stores the returned values', () => {
  const { matchUpIds } = setup();
  let result: any = scaleEngine.generateDynamicRatings({ updateParticipantRatings: true, matchUpIds });
  expect(result.success).toEqual(true);
  const written = participantsWithEloWritten();
  expect(written).toHaveLength(Object.keys(result.modifiedScaleValues).length);
  for (const participant of written) {
    const item = participant.timeItems.filter((t: any) => String(t.itemType).includes('ELO')).pop();
    expect(item.itemValue).toEqual(result.modifiedScaleValues[participant.participantId].scaleValue);
  }
});

it('a DOUBLE_WALKOVER is processed but not rated, and is not a match played', () => {
  const { matchUps, participantIds } = setup();
  const first = matchUps.find((m: any) => m.roundNumber === 1 && m.roundPosition === 1);
  const final = matchUps.find((m: any) => m.roundNumber === 2);
  Object.assign(first, { matchUpStatus: DOUBLE_WALKOVER, winningSide: undefined, score: {} });
  const matchesPlayed = () => Object.fromEntries(participantIds.map((id) => [id, 10]));

  let result: any = scaleEngine.generateDynamicRatings({
    matchUpIds: [first.matchUpId, final.matchUpId],
    matchesPlayed: matchesPlayed(),
    ratingsPolicy: policy538,
    matchUps: [first, final],
  });
  expect(result.success).toEqual(true);
  expect(result.processedMatchUpIds).toEqual([first.matchUpId, final.matchUpId]);
  expect(result.ratedMatchUpIds).toEqual([final.matchUpId]);

  // the final alone: a DOUBLE_WALKOVER ahead of it changes no one's K
  const alone: any = scaleEngine.generateDynamicRatings({
    matchUpIds: [final.matchUpId],
    matchesPlayed: matchesPlayed(),
    ratingsPolicy: policy538,
    matchUps: [final],
  });
  for (const side of final.sides) {
    expect(result.modifiedScaleValues[side.participantId].scaleValue).toEqual(
      alone.modifiedScaleValues[side.participantId].scaleValue,
    );
  }
});

it("the caller's matchUps are not reordered; the run follows draw order", () => {
  const { matchUps } = setup();
  const reversed = [...matchUps].reverse();
  const callerOrder = reversed.map((m: any) => m.matchUpId);
  let result: any = scaleEngine.generateDynamicRatings({ matchUpIds: callerOrder, matchUps: reversed });
  expect(result.success).toEqual(true);
  expect(reversed.map((m: any) => m.matchUpId)).toEqual(callerOrder);
  // draw order: both round 1 matchUps before the final
  expect(result.processedMatchUpIds.at(-1)).toEqual(matchUps.find((m: any) => m.roundNumber === 2).matchUpId);
});
