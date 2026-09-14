import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants and fixtures
import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import POLICY_SCORING_USTA from '@Fixtures/policies/POLICY_SCORING_USTA';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { ADD_MATCHUPS } from '@Constants/topicConstants';
import {
  ANACHRONISM,
  EVENT_NOT_FOUND,
  MISSING_EVENT,
  MISSING_TOURNAMENT_RECORD,
} from '@Constants/errorConditionConstants';

const SHORT4TB10 = 'SET1-S:4/TB10';
const matchUpAddNotices: number[] = [];

const subscriptions = {
  [ADD_MATCHUPS]: (payload) => {
    if (Array.isArray(payload)) {
      payload.forEach(({ matchUps }) => {
        matchUpAddNotices.push(matchUps.length);
      });
    }
  },
};

setSubscriptions({ subscriptions });

test('tournamentEngine can addDrawDefinitions', () => {
  const drawSize = 32;
  const secondDrawSize = 16;
  const totalExpectedMatchUps = drawSize - 1 + secondDrawSize - 1;

  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize }],
  });
  const { tournamentId } = tournamentRecord;
  tournamentEngine.setState(tournamentRecord);

  let { matchUps } = tournamentEngine.allCompetitionMatchUps();
  expect(matchUps.length).toEqual(31);

  let result = tournamentEngine.generateDrawDefinition({
    drawSize: secondDrawSize,
    eventId,
  });

  const { drawDefinition } = result;

  result = tournamentEngine.addDrawDefinition({
    drawDefinition,
    tournamentId,
  });
  expect(result.error).toEqual(MISSING_EVENT);
  result = tournamentEngine.addDrawDefinition({
    tournamentId: 'bogusId',
    drawDefinition,
    eventId,
  });
  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  result = tournamentEngine.addDrawDefinition({
    eventId: 'bogusId',
    drawDefinition,
    tournamentId,
  });
  expect(result.error).toEqual(EVENT_NOT_FOUND);
  result = tournamentEngine.addDrawDefinition({
    drawDefinition,
    tournamentId,
    eventId,
  });
  expect(result.success).toEqual(true);
  ({ matchUps } = tournamentEngine.allCompetitionMatchUps());
  expect(matchUps.length).toEqual(totalExpectedMatchUps);
  expect(matchUpAddNotices).toEqual([31, 15]);
});

test('tournamentEngine can setMatchUpStatus', () => {
  const drawProfiles = [{ drawSize: 32 }];
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);
  const { startDate } = tournamentEngine.devContext(true).getCompetitionDateRange();

  let { upcomingMatchUps } = tournamentEngine.getCompetitionMatchUps();

  const { matchUpId, drawId, tournamentId } = upcomingMatchUps[0];
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '6-2 5-7 7-6(3)',
    winningSide: 2,
  });

  let result = tournamentEngine.setMatchUpStatus({
    schedule: { scheduledDate: startDate },
    tournamentId,
    matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  let { completedMatchUps } = tournamentEngine.getCompetitionMatchUps();
  expect(completedMatchUps.length).toEqual(1);

  expect(completedMatchUps[0].score.scoreStringSide1).toEqual(outcome.score.scoreStringSide1);

  ({ upcomingMatchUps } = tournamentEngine.getCompetitionMatchUps());

  const outcomes = upcomingMatchUps.map((matchUp) => {
    const { matchUpId, drawId, eventId, tournamentId } = matchUp;
    return {
      schedule: {
        scheduledDate: startDate,
      },
      score: outcome.score,
      winningSide: 2,
      tournamentId,
      matchUpId,
      eventId,
      drawId,
    };
  });

  result = tournamentEngine.bulkMatchUpStatusUpdate({ outcomes });
  expect(result.success).toEqual(true);

  ({ completedMatchUps } = tournamentEngine.getCompetitionMatchUps());
  expect(completedMatchUps.length).toEqual(16);
  completedMatchUps.forEach(({ score, schedule }) => {
    expect(score.scoreStringSide1).toEqual(outcome.score.scoreStringSide1);
    expect(schedule.scheduledDate).toEqual(startDate);
  });
});

test('tournamentEngine can bulkScheduleMatchUps', () => {
  const drawProfiles = [{ drawSize: 32 }];
  const venueProfiles = [{ courtsCount: 3 }];
  const {
    venueIds: [venueId],
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    venueProfiles,
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);
  const { startDate } = tournamentEngine.getCompetitionDateRange();

  let { upcomingMatchUps } = tournamentEngine.getCompetitionMatchUps();

  let matchUpContextIds = upcomingMatchUps.map(({ tournamentId, drawId, matchUpId }) => ({
    tournamentId,
    matchUpId,
    drawId,
  }));

  let schedule = {
    scheduledDate: startDate,
    scheduledTime: '08:00',
    venueId,
  };
  let result = tournamentEngine.bulkScheduleMatchUps({
    matchUpContextIds,
    schedule,
  });
  expect(result.success).toEqual(true);

  matchUpContextIds.forEach((contextIds) => {
    const { validActions } = tournamentEngine.matchUpActions(contextIds);
    expect(validActions.length).toBeGreaterThan(0);
  });

  ({ upcomingMatchUps } = tournamentEngine.getCompetitionMatchUps());

  upcomingMatchUps.forEach(({ schedule, roundNumber }) => {
    expect(schedule.scheduledDate).toEqual(startDate);
    expect(roundNumber).toEqual(1);
  });

  const matchUps = tournamentEngine.allCompetitionMatchUps({
    matchUpFilters: { drawIds: [drawId], roundNumbers: [2] },
  }).matchUps;

  matchUpContextIds = matchUps.map(({ tournamentId, drawId, matchUpId }) => ({
    tournamentId,
    matchUpId,
    drawId,
  }));

  schedule = {
    scheduledDate: startDate,
    scheduledTime: '08:00',
    venueId,
  };
  result = tournamentEngine.bulkScheduleMatchUps({
    errorOnAnachronism: true,
    matchUpContextIds,
    schedule,
  });
  expect(result.error).toEqual(ANACHRONISM);

  schedule = {
    scheduledDate: startDate,
    scheduledTime: '08:00',
    venueId,
  };
  result = tournamentEngine.bulkScheduleMatchUps({
    errorOnAnachronism: false,
    matchUpContextIds,
    schedule,
  });
  expect(result.warnings.length).toEqual(8);
  expect(result.warnings[0]).toEqual(ANACHRONISM);
  expect(result.success).toEqual(true);

  schedule = {
    scheduledDate: startDate,
    scheduledTime: '09:00',
    venueId,
  };
  result = tournamentEngine.bulkScheduleMatchUps({
    errorOnAnachronism: true,
    matchUpContextIds,
    schedule,
  });
  expect(result.success).toEqual(true);
});

test('can modify event timing for matchUpFormat codes', () => {
  const {
    tournamentRecord: firstTournament,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }],
  });
  const { tournamentRecord: secondTournament } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }],
  });

  tournamentEngine.setState([firstTournament, secondTournament]);

  let result = tournamentEngine.attachPolicies({
    policyDefinitions: POLICY_SCHEDULING_DEFAULT,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.getEventMatchUpFormatTiming({
    eventId,
  });
  // even with no policy, timing is defined / falls back to defaults
  expect(result.eventMatchUpFormatTiming).toBeDefined();
  expect(result.eventMatchUpFormatTiming.length).toEqual(19);

  let { eventMatchUpFormatTiming } = result;
  expect(eventMatchUpFormatTiming).toBeDefined();

  result = tournamentEngine.modifyEventMatchUpFormatTiming({
    matchUpFormat: FORMAT_STANDARD,
    averageMinutes: 127,
  });
  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD); // because tournamentRecord is resovled from eventId

  result = tournamentEngine.modifyEventMatchUpFormatTiming({
    matchUpFormat: FORMAT_STANDARD,
    tournamentId: 'bogusId',
    averageMinutes: 127,
    eventId,
  });
  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);

  result = tournamentEngine.modifyEventMatchUpFormatTiming({
    matchUpFormat: FORMAT_STANDARD,
    averageMinutes: 127,
    eventId: 'bogusId',
  });
  expect(result.error).toEqual(EVENT_NOT_FOUND);

  result = tournamentEngine.getEventMatchUpFormatTiming({
    eventId,
  });
  expect(result.eventMatchUpFormatTiming.find((t) => t.matchUpFormat === FORMAT_STANDARD).averageMinutes).toEqual(90);

  result = tournamentEngine.modifyEventMatchUpFormatTiming({
    matchUpFormat: FORMAT_STANDARD,
    averageMinutes: 127,
    eventId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.getEventMatchUpFormatTiming({
    matchUpFormats: [FORMAT_STANDARD],
    eventId,
  });
  expect(result.eventMatchUpFormatTiming.find((t) => t.matchUpFormat === FORMAT_STANDARD).averageMinutes).toEqual(127);

  result = tournamentEngine.modifyEventMatchUpFormatTiming({
    matchUpFormat: SHORT4TB10,
    averageMinutes: 137,
    eventId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.getEventMatchUpFormatTiming({
    eventId,
  });
  expect(result.eventMatchUpFormatTiming.length).toEqual(2);
  expect(result.eventMatchUpFormatTiming.find((t) => t.matchUpFormat === SHORT4TB10).averageMinutes).toEqual(137);

  // overwriting value of 137 with 117
  result = tournamentEngine.modifyEventMatchUpFormatTiming({
    matchUpFormat: SHORT4TB10,
    averageMinutes: 117,
    eventId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.getEventMatchUpFormatTiming({
    eventId,
  });

  expect(result.eventMatchUpFormatTiming.find((t) => t.matchUpFormat === SHORT4TB10).averageMinutes).toEqual(117);

  expect(result.eventMatchUpFormatTiming.map((t) => t.averageMinutes)).toEqual([127, 117]);
  expect(result.eventMatchUpFormatTiming.map((t) => t.recoveryMinutes)).toEqual([60, 60]);

  ({ eventMatchUpFormatTiming } = tournamentEngine.getEventMatchUpFormatTiming({
    matchUpFormats: [FORMAT_STANDARD, SHORT4TB10, SHORT4TB10],
    eventId,
  }));
  // expect duplicated matchUpFormat to be filtered out
  expect(eventMatchUpFormatTiming.map((t) => t.averageMinutes)).toEqual([127, 117]);

  result = tournamentEngine.removeEventMatchUpFormatTiming({ eventId });
  expect(result.success).toEqual(true);

  ({ eventMatchUpFormatTiming } = tournamentEngine.getEventMatchUpFormatTiming({
    matchUpFormats: [FORMAT_STANDARD, SHORT4TB10],
    eventId,
  }));
  expect(eventMatchUpFormatTiming.map((t) => t.averageMinutes)).toEqual([90, 90]);

  ({ eventMatchUpFormatTiming } = tournamentEngine.getEventMatchUpFormatTiming({
    eventId,
  }));

  expect(eventMatchUpFormatTiming).toBeDefined();

  const policyDefinitions = POLICY_SCORING_USTA;
  tournamentEngine.attachPolicies({
    allowReplacement: true,
    policyDefinitions,
  });

  ({ eventMatchUpFormatTiming } = tournamentEngine.getEventMatchUpFormatTiming({
    eventId,
  }));
  expect(policyDefinitions.scoring.matchUpFormats.length).toEqual(eventMatchUpFormatTiming.length);

  result = tournamentEngine.getEventMatchUpFormatTiming({
    eventId: 'bogusId',
  });
  expect(result.error).toEqual(EVENT_NOT_FOUND);

  result = tournamentEngine.getEventMatchUpFormatTiming({
    tournamentId: 'bogusId',
    eventId,
  });
  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
});
