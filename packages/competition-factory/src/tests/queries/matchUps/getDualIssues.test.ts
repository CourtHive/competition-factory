import { getDualIssues } from '@Query/matchUp/getDualIssues';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, test } from 'vitest';

// constants
import {
  DUAL_DECIDED,
  DUPLICATE_IN_COLLECTION,
  INELIGIBLE_CATEGORY,
  INELIGIBLE_GENDER,
  LINEUP_INCOMPLETE,
  MANUAL_SCORE,
  MANUAL_SCORE_DIVERGES,
  MISSING_REASON,
  SCORE_INCOMPLETE,
} from '@Constants/dualIssueConstants';
import { INVALID_VALUES, MISSING_MATCHUP, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { RETIRED } from '@Constants/matchUpStatusConstants';
import { FEMALE, MALE, MIXED } from '@Constants/genderConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { TEAM } from '@Constants/eventConstants';

const FORMAT = 'SET3-S:6/TB7';
const SCHEDULED_DATE = '2026-06-01';

// three MALE singles and two doubles: the first team to 3 wins the dual
function setup({ category, doublesGender }: { category?: any; doublesGender?: string } = {}) {
  const tieFormat = {
    collectionDefinitions: [
      {
        collectionId: 'S',
        collectionName: 'Singles',
        matchUpType: SINGLES,
        matchUpFormat: FORMAT,
        matchUpCount: 3,
        matchUpValue: 1,
        gender: MALE,
        category,
      },
      {
        collectionId: 'D',
        collectionName: 'Doubles',
        matchUpType: DOUBLES,
        matchUpFormat: FORMAT,
        matchUpCount: 2,
        matchUpValue: 1,
        gender: doublesGender,
      },
    ],
    winCriteria: { valueGoal: 3 },
  };
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormat }] });

  // every member MALE and adult, so that only what a test changes is an issue
  for (const participant of tournamentRecord.participants) {
    if (participant.person) Object.assign(participant.person, { sex: MALE, birthDate: '1990-01-01' });
  }
  tournamentEngine.setState(tournamentRecord);

  const dual = getDual(drawId);
  const members = dual.sides.map((side) => side.participant.individualParticipantIds);
  const lines = (collectionId) =>
    dual.tieMatchUps
      .filter((line) => line.collectionId === collectionId)
      .sort((a, b) => a.collectionPosition - b.collectionPosition)
      .map((line) => line.matchUpId);
  return { drawId, dualId: dual.matchUpId, members, singles: lines('S'), doubles: lines('D') };
}

function getDual(drawId) {
  return tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { drawIds: [drawId], matchUpTypes: [TEAM] },
  }).matchUps[0];
}

function assign(drawId, tieMatchUpId, participantId) {
  const result = tournamentEngine.assignTieMatchUpParticipantId({ drawId, tieMatchUpId, participantId });
  expect(result.success).toEqual(true);
}

// singles: member i of each team on line i; doubles: members 0+1 and 2+3
function assignAll({ drawId, members, singles, doubles }) {
  for (const sideMembers of members) {
    singles.forEach((tieMatchUpId, i) => assign(drawId, tieMatchUpId, sideMembers[i]));
    assign(drawId, doubles[0], sideMembers[0]);
    assign(drawId, doubles[0], sideMembers[1]);
    assign(drawId, doubles[1], sideMembers[2]);
    assign(drawId, doubles[1], sideMembers[3]);
  }
}

function score(drawId, matchUpId, outcome) {
  const result = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome });
  expect(result.success).toEqual(true);
}

const WIN_SIDE_1 = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome;

const issuesOf = (drawId, matchUpId, extra = {}) => {
  const result = tournamentEngine.getDualIssues({ drawId, matchUpId, ...extra });
  expect(result.success).toEqual(true);
  return result.issues;
};
const codesOf = (issues) => issues.map(({ code }) => code);

describe('getDualIssues', () => {
  test('an empty line-up: each side of each line is incomplete', () => {
    const { drawId, dualId } = setup();
    const issues = issuesOf(drawId, dualId);
    expect(issues.length).toEqual(10);
    expect(issues.every(({ code }) => code === LINEUP_INCOMPLETE)).toEqual(true);
  });

  test('a full, eligible line-up has no issues', () => {
    const context = setup();
    assignAll(context);
    expect(issuesOf(context.drawId, context.dualId)).toEqual([]);
  });

  test('a doubles side with one player is incomplete', () => {
    const context = setup();
    const { drawId, dualId, members, doubles } = context;
    assignAll(context);
    tournamentEngine.removeTieMatchUpParticipantId({ drawId, tieMatchUpId: doubles[1], participantId: members[1][3] });
    expect(issuesOf(drawId, dualId)).toEqual([
      { code: LINEUP_INCOMPLETE, matchUpId: doubles[1], collectionId: 'D', sideNumber: 2 },
    ]);
  });

  test('a participant on two lines of one collection', () => {
    const context = setup();
    const { drawId, dualId, members, singles } = context;
    assignAll(context);
    // a hydrated dual read from the engine, its second singles line given side 1's first player again
    const dual = getDual(drawId);
    const first = dual.tieMatchUps.find((line) => line.matchUpId === singles[0]);
    const second = dual.tieMatchUps.find((line) => line.matchUpId === singles[1]);
    second.sides[0] = { ...first.sides[0], sideNumber: 1 };
    const { issues } = tournamentEngine.getDualIssues({ matchUp: dual });
    expect(issues).toEqual([
      {
        code: DUPLICATE_IN_COLLECTION,
        participantIds: [members[0][0]],
        matchUpIds: [singles[0], singles[1]],
        collectionId: 'S',
      },
    ]);
    // the engine's own line-up for the dual is unchanged
    expect(issuesOf(drawId, dualId)).toEqual([]);
  });

  test('a participant who does not fit the collection gender', () => {
    const context = setup();
    const { drawId, dualId, members, singles } = context;
    assignAll(context);
    // the person's sex is corrected after the line-up was set
    const record = tournamentEngine.getTournament().tournamentRecord;
    record.participants.find(({ participantId }) => participantId === members[1][2]).person.sex = FEMALE;
    tournamentEngine.setState(record);
    expect(issuesOf(drawId, dualId)).toEqual([
      {
        code: INELIGIBLE_GENDER,
        participantIds: [members[1][2]],
        matchUpId: singles[2],
        collectionId: 'S',
        sideNumber: 2,
        info: MALE,
      },
    ]);
  });

  test('a MIXED doubles pair is one of each', () => {
    const { drawId, dualId, members, doubles } = setup({ doublesGender: MIXED });
    const setSex = (participantIds, sex) => {
      const record = tournamentEngine.getTournament().tournamentRecord;
      for (const participantId of participantIds) {
        record.participants.find((participant) => participant.participantId === participantId).person.sex = sex;
      }
      tournamentEngine.setState(record);
    };
    // only the doubles are filled: members 0 and 1 MALE, 2 and 3 FEMALE, paired 0+2 and 1+3
    setSex([...members[0].slice(2), ...members[1].slice(2)], FEMALE);
    for (const sideMembers of members) {
      assign(drawId, doubles[0], sideMembers[0]);
      assign(drawId, doubles[0], sideMembers[2]);
      assign(drawId, doubles[1], sideMembers[1]);
      assign(drawId, doubles[1], sideMembers[3]);
    }
    const genderIssues = () => issuesOf(drawId, dualId).filter(({ code }) => code === INELIGIBLE_GENDER);
    expect(genderIssues()).toEqual([]);

    // side 2's first pair is corrected to two men after the line-up was set
    setSex([members[1][2]], MALE);
    expect(genderIssues()).toEqual([
      {
        code: INELIGIBLE_GENDER,
        participantIds: expect.arrayContaining([members[1][0], members[1][2]]),
        matchUpId: doubles[0],
        collectionId: 'D',
        sideNumber: 2,
        info: MIXED,
      },
    ]);
  });

  test('a participant outside the collection category, measured on the given date', () => {
    const context = setup({ category: { ageCategoryCode: 'U18' } });
    const { drawId, dualId, members, singles } = context;
    assignAll(context);
    const record = tournamentEngine.getTournament().tournamentRecord;
    for (const participant of record.participants) {
      if (participant.person) participant.person.birthDate = '2010-01-01';
    }
    record.participants.find(({ participantId }) => participantId === members[0][1]).person.birthDate = '1990-01-01';
    tournamentEngine.setState(record);

    // without a date (none given, none scheduled) ages are not checked
    expect(issuesOf(drawId, dualId)).toEqual([]);
    expect(issuesOf(drawId, dualId, { consideredDate: SCHEDULED_DATE })).toEqual([
      {
        code: INELIGIBLE_CATEGORY,
        participantIds: [members[0][1]],
        matchUpId: singles[1],
        collectionId: 'S',
        sideNumber: 1,
      },
    ]);
  });

  test('a completed line whose score does not satisfy its format', () => {
    const context = setup();
    const { drawId, singles } = context;
    assignAll(context);
    score(drawId, singles[0], WIN_SIDE_1);
    // the engine refuses to complete a line on an unfinished set; an imported record can still hold one
    const dual = getDual(drawId);
    const line = dual.tieMatchUps.find(({ matchUpId }) => matchUpId === singles[0]);
    // a second set recorded as 6-5: not a set SET3-S:6/TB7 can finish on
    Object.assign(line.score.sets[1], { side1Score: 6, side2Score: 5 });
    const { issues } = tournamentEngine.getDualIssues({ matchUp: dual });
    expect(codesOf(issues)).toEqual([SCORE_INCOMPLETE]);
    expect(issues[0]).toMatchObject({ matchUpId: singles[0], collectionId: 'S', info: expect.any(String) });
  });

  test('a retirement without a reason, and with one', () => {
    const context = setup();
    const { drawId, dualId, singles } = context;
    assignAll(context);
    const outcome = mocksEngine.generateOutcomeFromScoreString({
      matchUpStatus: RETIRED,
      scoreString: '6-1 2-1',
      winningSide: 1,
    }).outcome;
    score(drawId, singles[0], outcome);
    expect(issuesOf(drawId, dualId)).toEqual([
      { code: MISSING_REASON, matchUpId: singles[0], collectionId: 'S', info: RETIRED },
    ]);

    score(drawId, singles[0], { ...outcome, matchUpStatusCodes: ['RJ.ILL'] });
    expect(issuesOf(drawId, dualId)).toEqual([]);
  });

  test('a dual decided with lines still unplayed', () => {
    const context = setup();
    const { drawId, dualId, singles, doubles } = context;
    assignAll(context);
    score(drawId, singles[0], WIN_SIDE_1);
    score(drawId, singles[1], WIN_SIDE_1);
    expect(issuesOf(drawId, dualId)).toEqual([]);

    score(drawId, singles[2], WIN_SIDE_1);
    const issues = issuesOf(drawId, dualId);
    expect(issues).toEqual([{ code: DUAL_DECIDED, matchUpIds: expect.any(Array) }]);
    expect(issues[0].matchUpIds.sort()).toEqual([...doubles].sort());
  });

  test('a team score held by hand, whether it agrees with the lines, and its restore', () => {
    const context = setup();
    const { drawId, dualId, singles } = context;
    assignAll(context);
    score(drawId, singles[0], WIN_SIDE_1);

    // held at 3-0: the lines say 1-0
    let result = tournamentEngine.setMatchUpStatus({
      outcome: { score: { scoreStringSide1: '3-0', scoreStringSide2: '0-3' }, winningSide: 1 },
      disableAutoCalc: true,
      matchUpId: dualId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(issuesOf(drawId, dualId)).toEqual([{ code: MANUAL_SCORE }, { code: MANUAL_SCORE_DIVERGES, info: '1-0' }]);

    result = tournamentEngine.enableTieAutoCalc({ drawId, matchUpId: dualId });
    expect(result.success).toEqual(true);
    expect(issuesOf(drawId, dualId)).toEqual([]);
  });

  test('refusals', () => {
    const { drawId, singles } = setup();
    expect(tournamentEngine.getDualIssues({ drawId }).error).toEqual(MISSING_MATCHUP);
    // a line is not a dual
    expect(tournamentEngine.getDualIssues({ drawId, matchUpId: singles[0] }).error).toEqual(INVALID_VALUES);
    // called directly: without a hydrated matchUp it needs the record to find one in
    expect(getDualIssues({ matchUpId: singles[0] }).error).toEqual(MISSING_TOURNAMENT_RECORD);
  });
});
