import { tallyParticipantResults } from '@Query/matchUps/roundRobinTally/tallyParticipantResults';
import { getParticipantResults } from '@Query/matchUps/roundRobinTally/getParticipantResults';
import { setOutcomePipeline } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

// constants and types
import { COMPLETED, IN_PROGRESS, CANCELLED, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';
import type { RoundRobinTallyPolicy } from '@Types/roundRobinTallyPolicy';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import type { HydratedMatchUp } from '@Types/hydrated';

afterEach(() => setOutcomePipeline());

function setup() {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, drawType: ROUND_ROBIN, matchUpFormat: 'SET1-S:P32' }],
  });
  tournamentEngine.setState(tournamentRecord);
  const template = tournamentEngine.allTournamentMatchUps().matchUps[0];
  const match = (
    a: string,
    b: string,
    scores: [number, number],
    winningSide?: number,
    matchUpStatus: MatchUpStatusUnion = COMPLETED,
  ): HydratedMatchUp => ({
    ...structuredClone(template),
    matchUpId: `${a}-${b}`,
    matchUpFormat: 'SET1-S:P32',
    drawPositions: [Number(a.slice(1)) + 1, Number(b.slice(1)) + 1],
    sides: [
      { ...template.sides[0], participantId: a },
      { ...template.sides[1], participantId: b },
    ],
    matchUpStatus,
    winningSide,
    score: { sets: [{ setNumber: 1, side1Score: scores[0], side2Score: scores[1], winningSide }] },
  });
  return { match, drawId };
}

it('counts a completed permitted tie as drawn, retaining rally points without games or invented winners', () => {
  const { match } = setup();
  const matchUps = [match('p0', 'p1', [16, 16])];
  const before = structuredClone(matchUps);
  let result: any = getParticipantResults({ matchUps });
  for (const id of ['p0', 'p1']) {
    expect(result.participantResults[id]).toMatchObject({
      matchUpsDrawn: 1,
      matchUpsWon: 0,
      matchUpsLost: 0,
      matchUpsCancelled: 0,
      pointsWon: 16,
      pointsLost: 16,
      pointsPct: 0.5,
      matchUpsPct: 0.5,
      gamesWon: 0,
      gamesLost: 0,
      setsWon: 0,
      setsLost: 0,
      victories: [],
      defeats: [],
    });
    expect(result.participantResults[id].standingsPoints).toBeUndefined();
  }
  expect(matchUps).toEqual(before);
});

it.each([0, 0.25, 0.5, 1])('applies drawCredit %s with draws in the completed-match denominator', (drawCredit) => {
  const { match } = setup();
  let result: any = getParticipantResults({
    matchUps: [match('p0', 'p1', [17, 15], 1), match('p0', 'p2', [16, 16])],
    tallyPolicy: { drawCredit, outcomePoints: { win: 3, draw: 1, loss: 0 } },
  });
  expect(result.participantResults.p0).toMatchObject({
    matchUpsWon: 1,
    matchUpsDrawn: 1,
    matchUpsPct: (1 + drawCredit) / 2,
    pointsWon: 33,
    pointsLost: 31,
    standingsPoints: 4,
  });
  expect(result.participantResults.p1.standingsPoints).toBe(0);
  expect(result.participantResults.p2.standingsPoints).toBe(1);
});

it.each<MatchUpStatusUnion>([CANCELLED, DOUBLE_WALKOVER])('keeps %s distinct from drawn results', (status) => {
  const { match } = setup();
  let result: any = getParticipantResults({ matchUps: [match('p0', 'p1', [16, 16], undefined, status)] });
  expect(result.participantResults.p0).toMatchObject({ matchUpsDrawn: 0, matchUpsCancelled: 1, pointsWon: 0 });
});

it('does not mistake incomplete or unsupported winnerless scores for a completed tie', () => {
  const { match } = setup();
  for (const format of ['SET1-S:P32DP', 'SET1-S:P32WB2', 'SET1-S:P31', 'SET1-S:6/TB7']) {
    const m = match('p0', 'p1', [16, 16]);
    m.matchUpFormat = format;
    let result: any = getParticipantResults({ matchUps: [m] });
    expect(result.participantResults.p0.matchUpsDrawn).toBe(0);
  }
  let result: any = getParticipantResults({ matchUps: [match('p0', 'p1', [15, 15], undefined, IN_PROGRESS)] });
  expect(result.participantResults.p0.matchUpsDrawn).toBe(0);
});

it('honours format fallback and status exclusion', () => {
  const { match } = setup();
  const m = match('p0', 'p1', [16, 16]);
  delete m.matchUpFormat;
  expect(
    (
      getParticipantResults({ matchUps: [m], matchUpFormat: 'SET1-S:P32' }).participantResults as Record<
        string,
        { matchUpsDrawn: number }
      >
    ).p0.matchUpsDrawn,
  ).toBe(1);
  expect(
    getParticipantResults({ matchUps: [m], tallyPolicy: { excludeMatchUpStatuses: [COMPLETED] } }).participantResults,
  ).toEqual({});
});

it.each([
  { drawCredit: -1 },
  { drawCredit: 2 },
  { drawCredit: Number.NaN },
  { drawCredit: Infinity },
  { drawCredit: '0.5' },
  { outcomePoints: { win: 3, draw: 1 } },
  { outcomePoints: { win: 3, draw: Infinity, loss: 0 } },
  { outcomePoints: null },
  { groupOrderKey: 'standingsPoints' },
  { tallyDirectives: [{ attribute: 'standingsPoints' }] },
])('refuses invalid drawn-result policy %j before tallying', (tallyPolicy) => {
  const { match } = setup();
  expect(getParticipantResults({ matchUps: [match('p0', 'p1', [16, 16])], tallyPolicy }).error).toBe(INVALID_VALUES);
});

it('ranks on standings points and recalculates after a correction or clear', () => {
  const { match } = setup();
  const matchUps = [match('p0', 'p1', [16, 16]), match('p0', 'p2', [17, 15], 1), match('p1', 'p2', [17, 15], 1)];
  const roundRobinTally: RoundRobinTallyPolicy = {
    groupOrderKey: 'standingsPoints',
    outcomePoints: { win: 3, draw: 1, loss: 0 },
    tallyDirectives: [{ attribute: 'pointsWon', idsFilter: false }],
  };
  const tally = () =>
    tallyParticipantResults({ matchUps, policyDefinitions: { [POLICY_TYPE_ROUND_ROBIN_TALLY]: roundRobinTally } });
  let result = tally();
  expect(result.error).toBeUndefined();
  expect(result.bracketComplete).toBe(true);
  expect(result.participantResults.p0.standingsPoints).toBe(4);
  expect(result.participantResults.p1.standingsPoints).toBe(4);
  expect(result.participantResults.p0.groupOrder).toBe(result.participantResults.p1.groupOrder);
  Object.assign(matchUps[0], match('p0', 'p1', [17, 15], 1));
  result = tally();
  expect(result.participantResults.p0.standingsPoints).toBe(6);
  expect(result.participantResults.p1.standingsPoints).toBe(3);
  expect(result.participantResults.p0.groupOrder).toBe(1);
  matchUps[0].matchUpStatus = IN_PROGRESS;
  matchUps[0].winningSide = undefined;
  matchUps[0].score = { sets: [] };
  result = tally();
  expect(result.bracketComplete).toBe(false);
  expect(result.participantResults.p0.standingsPoints).toBe(3);
});

it('leaves a drawn head-to-head unresolved when no ranking directive separates the competitors', () => {
  const { match } = setup();
  let result: any = tallyParticipantResults({
    matchUps: [match('p0', 'p1', [16, 16])],
    policyDefinitions: { [POLICY_TYPE_ROUND_ROBIN_TALLY]: { groupOrderKey: 'matchUpsPct', tallyDirectives: [] } },
  });
  expect(result.error).toBeUndefined();
  expect(result.participantResults.p0.groupOrder).toBe(result.participantResults.p1.groupOrder);
});

it.each(['v1', 'v2', 'differential'] as const)(
  'supports persisted RR scores and attached tally policies through the public engine (%s)',
  (pipeline) => {
    setOutcomePipeline(pipeline);
    const { drawId } = setup();
    expect(
      tournamentEngine.attachPolicies({
        drawId,
        policyDefinitions: {
          [POLICY_TYPE_ROUND_ROBIN_TALLY]: {
            groupOrderKey: 'standingsPoints',
            drawCredit: 0.25,
            outcomePoints: { win: 3, draw: 1, loss: 0 },
          },
        },
      }).error,
    ).toBeUndefined();
    const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    for (const matchUp of matchUps) {
      expect(
        tournamentEngine.setMatchUpStatus({
          drawId,
          matchUpId: matchUp.matchUpId,
          outcome: { matchUpStatus: COMPLETED, score: { sets: [{ setNumber: 1, side1Score: 16, side2Score: 16 }] } },
        }).error,
      ).toBeUndefined();
    }
    const current = tournamentEngine.allTournamentMatchUps().matchUps;

    let result: any = tournamentEngine.tallyParticipantResults({
      matchUps: current,
      policyDefinitions: {
        [POLICY_TYPE_ROUND_ROBIN_TALLY]: {
          groupOrderKey: 'standingsPoints',
          drawCredit: 0.25,
          outcomePoints: { win: 3, draw: 1, loss: 0 },
        },
      },
    });
    expect(result.error).toBeUndefined();
    expect(result.bracketComplete).toBe(true);
    for (const row of Object.values(result.participantResults)) {
      expect(row).toMatchObject({
        matchUpsDrawn: 3,
        matchUpsCancelled: 0,
        pointsWon: 48,
        pointsLost: 48,
        standingsPoints: 3,
        matchUpsPct: 0.25,
        groupOrder: 1,
      });
    }
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const { positionAssignments } = tournamentEngine.getPositionAssignments({
      drawId,
      structureId: drawDefinition.structures[0].structures[0].structureId,
    });
    for (const assignment of positionAssignments) {
      expect(assignment.tally).toMatchObject({ matchUpsDrawn: 3, standingsPoints: 3, matchUpsPct: 0.25 });
    }
  },
);

it.each(['v1', 'v2', 'differential'] as const)(
  'corrects a saved RR winner to a draw and clears it (%s)',
  (pipeline) => {
    setOutcomePipeline(pipeline);
    const { drawId } = setup();
    const matchUpId = tournamentEngine.allTournamentMatchUps().matchUps[0].matchUpId;
    const read = () => tournamentEngine.allTournamentMatchUps().matchUps.find((match) => match.matchUpId === matchUpId);
    expect(
      tournamentEngine.setMatchUpStatus({
        drawId,
        matchUpId,
        outcome: {
          matchUpStatus: COMPLETED,
          winningSide: 1,
          score: { sets: [{ setNumber: 1, side1Score: 17, side2Score: 15, winningSide: 1 }] },
        },
      }).error,
    ).toBeUndefined();
    expect(
      tournamentEngine.setMatchUpStatus({
        drawId,
        matchUpId,
        outcome: {
          matchUpStatus: COMPLETED,
          score: { sets: [{ setNumber: 1, side1Score: 16, side2Score: 16 }] },
        },
      }).error,
    ).toBeUndefined();
    expect(read().winningSide).toBeUndefined();
    expect(read().score.sets).toMatchObject([{ side1Score: 16, side2Score: 16 }]);
    expect(
      tournamentEngine.setMatchUpStatus({
        drawId,
        matchUpId,
        outcome: {
          matchUpStatus: 'TO_BE_PLAYED',
          score: { scoreStringSide1: '', scoreStringSide2: '' },
        },
      }).error,
    ).toBeUndefined();
    expect(read()).toMatchObject({ matchUpStatus: 'TO_BE_PLAYED' });
    expect(read().score?.sets?.length ?? 0).toBe(0);
  },
);

it('uses signed and fractional outcome points without changing rally totals or existing win/loss notation', () => {
  const { match } = setup();
  let result: any = getParticipantResults({
    matchUps: [match('p0', 'p1', [17, 15], 1), match('p0', 'p2', [16, 16])],
    tallyPolicy: { outcomePoints: { win: 2.5, draw: 0.5, loss: -1 } },
  });
  expect(result.participantResults.p0).toMatchObject({
    standingsPoints: 3,
    result: '1/0',
    pointsWon: 33,
    matchUpsDrawn: 1,
  });
  expect(result.participantResults.p1.standingsPoints).toBe(-1);
});
