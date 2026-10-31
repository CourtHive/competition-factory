import { validateTieFormat } from '@Validators/validateTieFormat';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { INVALID_SCORE, INVALID_TIE_FORMAT, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';
import { DOUBLES, SINGLES, TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

/**
 * USTA League "points per position" (TennisLink): 2 singles + 3 doubles, singles worth 5,4 and doubles 5,4,3.
 * The 21-point total is odd, so a completed tie cannot be level, and weighting the top lines deters stacking.
 * Every line is valued individually through `collectionValueProfiles`, and the values sum ACROSS collections.
 */

const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };
const matchUpFormat = 'SET3-S:6/TB7-F:TB10';

const SINGLES_PROFILES = [
  { collectionPosition: 1, matchUpValue: 5 },
  { collectionPosition: 2, matchUpValue: 4 },
];
const DOUBLES_PROFILES = [
  { collectionPosition: 1, matchUpValue: 5 },
  { collectionPosition: 2, matchUpValue: 4 },
  { collectionPosition: 3, matchUpValue: 3 },
];

function pointsPerPosition({ winCriteria, singles = {}, doubles = {} }: any = {}) {
  return {
    ...(winCriteria && { winCriteria }),
    collectionDefinitions: [
      {
        collectionValueProfiles: SINGLES_PROFILES,
        collectionName: 'Singles',
        matchUpType: SINGLES,
        collectionId: 'S',
        matchUpCount: 2,
        matchUpFormat,
        ...singles,
      },
      {
        collectionValueProfiles: DOUBLES_PROFILES,
        collectionName: 'Doubles',
        matchUpType: DOUBLES,
        collectionId: 'D',
        matchUpCount: 3,
        matchUpFormat,
        ...doubles,
      },
    ],
  };
}

function generate(tieFormat: any) {
  return mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2, eventType: TEAM_EVENT, tieFormat }],
    policyDefinitions,
  });
}

function getTieMatchUp() {
  return tournamentEngine.allTournamentMatchUps({ matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] } }).matchUps[0];
}

/** winners keyed `${collectionId}-${collectionPosition}`; unlisted lines stay unplayed */
function playLines(winners: Record<string, number>) {
  const lines = tournamentEngine.allTournamentMatchUps().matchUps.filter((m) => m.matchUpType !== TEAM_MATCHUP);
  for (const line of lines) {
    const winningSide = winners[`${line.collectionId}-${line.collectionPosition}`];
    if (!winningSide) continue;
    const [side1Score, side2Score] = winningSide === 1 ? [6, 1] : [1, 6];
    const sets = [1, 2].map((setNumber) => ({ setNumber, side1Score, side2Score, winningSide }));
    const result = tournamentEngine.setMatchUpStatus({
      outcome: { winningSide, score: { sets } },
      matchUpId: line.matchUpId,
      drawId: line.drawId,
    });
    expect(result.success).toEqual(true);
  }
  return getTieMatchUp();
}

// side 2 takes the two 5-point lines (10), side 1 takes the three smaller lines (4 + 4 + 3 = 11)
const SMALL_LINES_BEAT_BIG_LINES = { 'S-1': 2, 'D-1': 2, 'S-2': 1, 'D-2': 1, 'D-3': 1 };

describe('points per position: per-line values with collectionValueProfiles', () => {
  it('derives valueGoal from the profile values summed across collections', () => {
    let result: any = tournamentEngine.calculateWinCriteria({
      collectionDefinitions: pointsPerPosition().collectionDefinitions,
    });
    expect(result.valueGoal).toEqual(11); // floor(21 / 2) + 1
    expect(result.aggregateValue).toBeUndefined();
  });

  it('scores by line value, not by lines won: three small lines beat two big ones 11-10', () => {
    let result: any = generate(pointsPerPosition({ winCriteria: { valueGoal: 11 } }));
    expect(result.success).toEqual(true);
    tournamentEngine.setState(result.tournamentRecord);

    const tieMatchUp = playLines(SMALL_LINES_BEAT_BIG_LINES);
    expect(tieMatchUp.score.scoreStringSide1).toEqual('11-10');
    expect(tieMatchUp.matchUpStatus).toEqual(COMPLETED);
    expect(tieMatchUp.winningSide).toEqual(1);
  });

  it('valueGoal decides the tie as soon as one side reaches it, with lines still unplayed', () => {
    let result: any = generate(pointsPerPosition({ winCriteria: { valueGoal: 11 } }));
    tournamentEngine.setState(result.tournamentRecord);

    // S1 + D1 + S2 = 5 + 5 + 4 = 14; D2 and D3 are never played
    const tieMatchUp = playLines({ 'S-1': 1, 'D-1': 1, 'S-2': 1 });
    expect(tieMatchUp.score.scoreStringSide1).toEqual('14-0');
    expect(tieMatchUp.matchUpStatus).toEqual(COMPLETED);
    expect(tieMatchUp.winningSide).toEqual(1);
  });

  it('aggregateValue waits for every line, then the higher total wins', () => {
    let result: any = generate(pointsPerPosition({ winCriteria: { aggregateValue: true } }));
    tournamentEngine.setState(result.tournamentRecord);

    let tieMatchUp = playLines({ 'S-1': 1, 'D-1': 1, 'S-2': 1 });
    expect(tieMatchUp.score.scoreStringSide1).toEqual('14-0');
    expect(tieMatchUp.matchUpStatus).toEqual(IN_PROGRESS);
    expect(tieMatchUp.winningSide).toBeUndefined();

    result = generate(pointsPerPosition({ winCriteria: { aggregateValue: true } }));
    tournamentEngine.setState(result.tournamentRecord);
    tieMatchUp = playLines(SMALL_LINES_BEAT_BIG_LINES);
    expect(tieMatchUp.score.scoreStringSide1).toEqual('11-10');
    expect(tieMatchUp.matchUpStatus).toEqual(COMPLETED);
    expect(tieMatchUp.winningSide).toEqual(1);
  });

  it('requires winCriteria: an omitted winCriteria is refused, not derived', () => {
    let result: any = generate(pointsPerPosition());
    expect(result.error).toEqual(INVALID_TIE_FORMAT);
  });
});

describe('points per position: what validation refuses and what it lets through', () => {
  const singlesProfiles = (collectionValueProfiles: any[]) =>
    pointsPerPosition({ winCriteria: { valueGoal: 11 }, singles: { collectionValueProfiles } });

  const refused: [string, any, string][] = [
    [
      'one profile per line is required',
      singlesProfiles([{ collectionPosition: 1, matchUpValue: 5 }]),
      'collectionValueProfiles do not align with matchUpsCount',
    ],
    [
      'positions must be unique',
      singlesProfiles([
        { collectionPosition: 1, matchUpValue: 5 },
        { collectionPosition: 1, matchUpValue: 4 },
      ]),
      'collectionPositions are not unique',
    ],
    [
      'positions cannot exceed matchUpCount',
      singlesProfiles([
        { collectionPosition: 1, matchUpValue: 5 },
        { collectionPosition: 3, matchUpValue: 4 },
      ]),
      'Invalid value profile',
    ],
    [
      'positions start at 1',
      singlesProfiles([
        { collectionPosition: 0, matchUpValue: 5 },
        { collectionPosition: 1, matchUpValue: 4 },
      ]),
      'Invalid value profile',
    ],
    [
      'values must be numbers',
      singlesProfiles([
        { collectionPosition: 1, matchUpValue: '5' },
        { collectionPosition: 2, matchUpValue: 4 },
      ]),
      'Invalid value profile',
    ],
    [
      'profiles cannot be combined with matchUpValue',
      pointsPerPosition({ winCriteria: { valueGoal: 11 }, singles: { matchUpValue: 1 } }),
      'Conflicting value definitions for matchUps, only one is allowed: collectionValueProfiles, matchUpValue',
    ],
    [
      'profiles cannot be combined with collectionValue',
      pointsPerPosition({ winCriteria: { valueGoal: 11 }, singles: { collectionValue: 1 } }),
      'Conflicting value definitions for matchUps, only one is allowed: collectionValueProfiles, collectionValue',
    ],
    ['an empty profile array is no value definition', singlesProfiles([]), 'Missing value definition for matchUps'],
  ];

  it.each(refused)('%s', (_, tieFormat, message) => {
    let result: any = validateTieFormat({ tieFormat, checkCollectionIds: false });
    expect(result.error).toEqual(INVALID_TIE_FORMAT);
    // decorateResult carries the collection's messages under context
    expect(result.context.errors.some((error: string) => error.includes(message))).toEqual(true);

    // the same tieFormat is refused at generation, before any record exists
    result = generate(tieFormat);
    expect(result.error).toEqual(INVALID_TIE_FORMAT);
  });

  // Current behaviour, pinned so that tightening it is a deliberate, visible change.
  it('GAP: a negative line value is accepted', () => {
    const tieFormat = singlesProfiles([
      { collectionPosition: 1, matchUpValue: -5 },
      { collectionPosition: 2, matchUpValue: 4 },
    ]);
    let result: any = validateTieFormat({ tieFormat, checkCollectionIds: false });
    expect(result.error).toBeUndefined();
    expect(generate(tieFormat).success).toEqual(true);
  });

  it('GAP: a valueGoal above the 21 available points is accepted, so the tie can never be won', () => {
    const tieFormat = pointsPerPosition({ winCriteria: { valueGoal: 30 } });
    let result: any = validateTieFormat({ tieFormat, checkCollectionIds: false });
    expect(result.error).toBeUndefined();

    result = generate(tieFormat);
    expect(result.success).toEqual(true);
    tournamentEngine.setState(result.tournamentRecord);
    const tieMatchUp = playLines({ 'S-1': 1, 'S-2': 1, 'D-1': 1, 'D-2': 1, 'D-3': 1 });
    expect(tieMatchUp.score.scoreStringSide1).toEqual('21-0');
    expect(tieMatchUp.winningSide).toBeUndefined();
    expect(tieMatchUp.matchUpStatus).not.toEqual(COMPLETED);
  });

  it('a conflicting tieFormat stored in a record blocks line scoring, reported as INVALID_SCORE', () => {
    let result: any = generate(pointsPerPosition({ winCriteria: { valueGoal: 11 } }));
    const { tournamentRecord } = result;
    // corrupt the stored tieFormat after generation, as a hand-edited or legacy record would be
    tournamentRecord.events[0].tieFormat.collectionDefinitions[0].matchUpValue = 1;
    tournamentEngine.setState(tournamentRecord);

    const line = tournamentEngine
      .allTournamentMatchUps()
      .matchUps.find((m) => m.collectionId === 'S' && m.collectionPosition === 1);
    result = tournamentEngine.setMatchUpStatus({
      outcome: { winningSide: 1, score: { sets: [{ setNumber: 1, side1Score: 6, side2Score: 1, winningSide: 1 }] } },
      matchUpId: line.matchUpId,
      drawId: line.drawId,
    });
    expect(result.error).toEqual(INVALID_SCORE);
    expect(getTieMatchUp().score?.scoreStringSide1).toBeUndefined();
  });
});

describe('points per position: modifying line values on an event', () => {
  function setup() {
    const result: any = generate(pointsPerPosition({ winCriteria: { valueGoal: 11 } }));
    tournamentEngine.setState(result.tournamentRecord);
    return tournamentEngine.getEvents().events[0].eventId;
  }

  it('refuses profiles that do not align with the lines', () => {
    const eventId = setup();
    let result: any = tournamentEngine.modifyCollectionDefinition({
      collectionValueProfiles: [{ collectionPosition: 1, matchUpValue: 5 }],
      collectionId: 'D',
      eventId,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('re-weights lines and recalculates valueGoal from the new total', () => {
    const eventId = setup();
    // doubles 6,5,4: total 5 + 4 + 6 + 5 + 4 = 24, so valueGoal 13
    let result: any = tournamentEngine.modifyCollectionDefinition({
      collectionValueProfiles: [
        { collectionPosition: 1, matchUpValue: 6 },
        { collectionPosition: 2, matchUpValue: 5 },
        { collectionPosition: 3, matchUpValue: 4 },
      ],
      collectionId: 'D',
      eventId,
    });
    expect(result.success).toEqual(true);
    expect(tournamentEngine.getEvents().events[0].tieFormat.winCriteria).toEqual({ valueGoal: 13 });
  });

  it('switching a collection to matchUpValue replaces its profiles and recalculates valueGoal', () => {
    const eventId = setup();
    let result: any = tournamentEngine.modifyCollectionDefinition({ collectionId: 'S', matchUpValue: 1, eventId });
    expect(result.success).toEqual(true);

    const { tieFormat } = tournamentEngine.getEvents().events[0];
    const singles = tieFormat.collectionDefinitions.find((c) => c.collectionId === 'S');
    expect(singles.matchUpValue).toEqual(1);
    expect(singles.collectionValueProfiles).toBeUndefined();
    expect(tieFormat.winCriteria).toEqual({ valueGoal: 8 }); // 1 + 1 + 5 + 4 + 3 = 14
  });
});
