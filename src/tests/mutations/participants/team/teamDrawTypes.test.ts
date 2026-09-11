import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { setSubscriptions } from '@Global/state/syncGlobalState';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { TALLY } from '@Constants/extensionConstants';
import { TEAM } from '@Constants/eventConstants';
import {
  COMPASS,
  FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  OLYMPIC,
  PLAY_OFF,
  ROUND_ROBIN,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

// reusable
const getMatchUp = (id, inContext?) => {
  const {
    matchUps: [matchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpIds: [id] },
    inContext,
  });
  return matchUp;
};

// generate outcome to be applied to each first round singles matchUp
const { outcome } = mocksEngine.generateOutcomeFromScoreString({
  matchUpStatus: COMPLETED,
  scoreString: '6-1 6-1',
  winningSide: 1,
});
const scenarios = [
  { drawType: SINGLE_ELIMINATION, matchUpsCount: 7 },
  { drawType: FIRST_MATCH_LOSER_CONSOLATION, matchUpsCount: 12 },
  { drawType: COMPASS, matchUpsCount: 12 },
  { drawType: OLYMPIC, matchUpsCount: 12 },
  { drawType: FEED_IN_CHAMPIONSHIP, matchUpsCount: 13 },
  { drawType: ROUND_ROBIN, matchUpsCount: 12 },
];

const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

it.each(scenarios)('can generate all drawTypes for eventType: TEAM', (scenario) => {
  const { drawType, matchUpsCount } = scenario;
  const {
    tournamentRecord,
    drawIds: [drawId],
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM, drawSize: 8, drawType }],
    policyDefinitions,
  });
  tournamentEngine.setState(tournamentRecord);
  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM] },
  });
  expect(matchUps.length).toEqual(matchUpsCount);
  matchUps.forEach((matchUp) => {
    expect(matchUp.tieFormat).not.toBeUndefined();
    expect(matchUp.tieMatchUps.length).toEqual(9);
  });

  const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
  expect(event.tieFormat).not.toBeUndefined();
  expect(drawDefinition.tieFormat).toBeUndefined();

  const valueGoal = event.tieFormat.winCriteria.valueGoal;

  const { eventData } = tournamentEngine.getEventData({ eventId });
  eventData.drawsData[0].structures[0].roundMatchUps[1].forEach((dualMatchUp) =>
    expect(dualMatchUp.tieFormat).not.toBeUndefined(),
  );

  const { matchUps: firstRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [1] },
  });

  firstRoundDualMatchUps.forEach((dualMatchUp) => expect(dualMatchUp.tieFormat).not.toBeUndefined());

  // for all first round dualMatchUps complete all singles/doubles matchUps
  firstRoundDualMatchUps.forEach((dualMatchUp) => {
    const singlesMatchUps = dualMatchUp.tieMatchUps.filter(({ matchUpType }) => matchUpType === SINGLES);
    singlesMatchUps.forEach((singlesMatchUp, i) => {
      const { matchUpId } = singlesMatchUp;
      const result = tournamentEngine.setMatchUpStatus({
        matchUpId,
        outcome,
        drawId,
      });
      expect(result.success).toEqual(true);
      const updatedDualMatchUp = getMatchUp(dualMatchUp.matchUpId);
      const { score, winningSide, matchUpStatus } = updatedDualMatchUp;
      expect(score.sets[0].side1Score).toEqual(i + 1);
      if (i + 1 >= valueGoal) {
        expect(winningSide).toEqual(1);
        expect(matchUpStatus).toEqual(COMPLETED);
      } else {
        expect(matchUpStatus).toEqual(IN_PROGRESS);
      }
    });

    const singlesMatchUpCount = singlesMatchUps.length;

    const doublesMatchUps = dualMatchUp.tieMatchUps.filter(({ matchUpType }) => matchUpType === DOUBLES);
    doublesMatchUps.forEach((doublesMatchUp, i) => {
      const { matchUpId } = doublesMatchUp;
      const result = tournamentEngine.setMatchUpStatus({
        matchUpId,
        outcome,
        drawId,
      });
      expect(result.success).toEqual(true);
      const updatedDualMatchUp = getMatchUp(dualMatchUp.matchUpId);
      const { score, winningSide, matchUpStatus } = updatedDualMatchUp;
      expect(score.sets[0].side1Score).toEqual(singlesMatchUpCount + i + 1);
      if (singlesMatchUpCount + i + 1 >= valueGoal) {
        expect(winningSide).toEqual(1);
        expect(matchUpStatus).toEqual(COMPLETED);
      } else {
        expect(matchUpStatus).toEqual(IN_PROGRESS);
      }
    });
  });
});

it('generates playoff structures for TEAM events and propagates tieFormat', () => {
  const allMatchUps: any[] = [];
  const matchUpAddNotices: number[] = [];

  const subscriptions = {
    addMatchUps: (payload) => {
      if (Array.isArray(payload)) {
        payload.forEach(({ matchUps }) => {
          matchUpAddNotices.push(matchUps.length);
          allMatchUps.push(...matchUps);
        });
      }
    },
  };

  setSubscriptions({ subscriptions });

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM, drawSize: 8, drawType: SINGLE_ELIMINATION }],
  });

  tournamentEngine.setState(tournamentRecord);

  const {
    drawDefinition: {
      structures: [{ structureId }],
    },
  } = tournamentEngine.getEvent({ drawId });

  const result = tournamentEngine.addPlayoffStructures({
    playoffStructureNameBase: '3-4 Playoff',
    playoffPositions: [3, 4],
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const {
    matchUps: [playoffMatchUp],
  } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { stages: [PLAY_OFF] },
    matchUpFilters: { matchUpTypes: [TEAM] },
  });
  expect(playoffMatchUp.tieFormat).not.toBeUndefined();
  expect(playoffMatchUp.tieMatchUps.length).toEqual(9);

  const { matchUp: playoffMatchUpWithContext } = tournamentEngine.findMatchUp({
    ...playoffMatchUp,
    inContext: true,
  });
  expect(playoffMatchUpWithContext.tieFormat).not.toBeUndefined();

  const {
    matchUps: [rrMatchUp],
  } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { stages: [PLAY_OFF] },
    matchUpFilters: { matchUpTypes: [TEAM] },
  });
  expect(rrMatchUp.tieFormat).not.toBeUndefined();
  expect(rrMatchUp.tieMatchUps.length).toEqual(9);

  expect(allMatchUps.length).toEqual(80);
  // 7 team matchUps with 9 tieMatchUps = 70
  // adding 3-4 playoff team matchUp adds 10
  expect(matchUpAddNotices).toEqual([70, 10]);
});

it('handles TEAM ROUND_ROBIN tallyParticipants', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM, drawSize: 8, drawType: ROUND_ROBIN }],
    policyDefinitions,
  });

  tournamentEngine.setState(tournamentRecord);

  const {
    matchUps: [dualMatchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM] },
  });
  expect(dualMatchUp.tieFormat).not.toBeUndefined();
  expect(dualMatchUp.tieMatchUps.length).toEqual(9);

  const { matchUp: teamMatchUpWithContext } = tournamentEngine.findMatchUp({
    ...dualMatchUp,
    inContext: true,
  });
  expect(teamMatchUpWithContext.tieFormat).not.toBeUndefined();

  const valueGoal = teamMatchUpWithContext.tieFormat.winCriteria.valueGoal;
  const singlesMatchUps = teamMatchUpWithContext.tieMatchUps.filter(({ matchUpType }) => matchUpType === SINGLES);
  singlesMatchUps.forEach((singlesMatchUp, i) => {
    const { matchUpId } = singlesMatchUp;
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);
    const updatedDualMatchUp = getMatchUp(teamMatchUpWithContext.matchUpId);
    const { score, winningSide, matchUpStatus } = updatedDualMatchUp;
    expect(score.sets[0].side1Score).toEqual(i + 1);
    if (i + 1 >= valueGoal) {
      expect(winningSide).toEqual(1);
      expect(matchUpStatus).toEqual(COMPLETED);
    } else {
      expect(matchUpStatus).toEqual(IN_PROGRESS);
    }
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = dualMatchUp.structureId;

  const { positionAssignments } = tournamentEngine.getPositionAssignments({
    drawDefinition,
    structureId,
  });

  const assignmentsWithTally = positionAssignments.filter((assignment) =>
    firstClassOrExtension({ element: assignment, attribute: 'tally', name: TALLY }),
  );
  expect(assignmentsWithTally.length).toEqual(4);

  assignmentsWithTally.forEach((assignment) => {
    expect(firstClassOrExtension({ element: assignment, attribute: 'tally', name: TALLY })).toBeDefined();
  });
});
