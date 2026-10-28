import { describe, expect, test } from 'vitest';

import { setSubscriptions } from '@Global/state/globalState';
import * as governors from '@Assemblies/governors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants
import { INVALID_GENDER, PARTICIPANT_NOT_FOUND } from '@Constants/errorConditionConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { FEMALE, MALE, MIXED } from '@Constants/genderConstants';
import { MODIFY_PARTICIPANTS } from '@Constants/topicConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';

/**
 * An integrator's list of the governor methods it calls (2026-10-28, 178 methods on 7.23.0) named 14 that the
 * 2026-10-15 engine-reach run found never driven through any engine: 6 of the 8.0.0 removal candidates and 8 that a
 * CourtHive consumer names. The integrator calls them through the engine and through the governors index, and no test
 * did either. This suite does both, so the reach run counts each as dispatched and a method that leaves its governor
 * fails here rather than in an integrator's build.
 */
const SURFACE: [string, string][] = [
  ['drawsGovernor', 'allPlayoffPositionsFilled'],
  ['drawsGovernor', 'getSeedingThresholds'],
  ['eventGovernor', 'categoryCanContain'],
  ['matchUpGovernor', 'getMatchUpContextIds'],
  ['scheduleGovernor', 'getMatchUpsToSchedule'],
  ['tieFormatGovernor', 'tieFormatGenderValidityCheck'],
  ['tournamentGovernor', 'addParticipantExtension'],
  ['matchUpGovernor', 'calculateWinCriteria'],
  ['scoreGovernor', 'checkScoreHasValue'],
  ['scoreGovernor', 'checkSetIsComplete'],
  ['scoreGovernor', 'generateScoreString'],
  ['scoreGovernor', 'getSetComplement'],
  ['scoreGovernor', 'getTiebreakComplement'],
  ['scoreGovernor', 'keyValueScore'],
];

describe('integrator-used methods are reachable on the package surface', () => {
  test.each(SURFACE)('%s.%s is exported from the governors index and on the engine', (governor, method) => {
    expect(typeof governors[governor][method]).toEqual('function');
    expect(typeof tournamentEngine[method]).toEqual('function');
  });
});

describe('the 8.0.0 removal candidates an integrator uses, driven through the engine', () => {
  test('allPlayoffPositionsFilled: false until the first round feeds the consolation, then true', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8 }],
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;

    let result: any = tournamentEngine.allPlayoffPositionsFilled({ drawId, structureId });
    expect(result).toEqual(false);

    const firstRound = tournamentEngine
      .allTournamentMatchUps({ matchUpFilters: { structureIds: [structureId], roundNumbers: [1] } })
      .matchUps.filter(({ drawPositions }) => drawPositions?.filter(Boolean).length === 2);
    expect(firstRound.length).toEqual(4);

    const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
    for (const { matchUpId } of firstRound) {
      result = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome });
      expect(result.success).toEqual(true);
    }

    result = tournamentEngine.allPlayoffPositionsFilled({ drawId, structureId });
    expect(result).toEqual(true);
  });

  test('getSeedingThresholds: seed blocks for an elimination draw and refuses an impossible group count', () => {
    let result: any = tournamentEngine.getSeedingThresholds({ participantsCount: 32 });
    expect(result.success).toEqual(true);
    expect(result.seedingThresholds).toEqual([1, 2, 3, 5, 9, 17]);

    result = tournamentEngine.getSeedingThresholds({ participantsCount: 16, roundRobinGroupsCount: 4 });
    expect(result.success).toEqual(true);
    expect(result.seedingThresholds).toEqual([1, 5, 9, 13]);

    result = tournamentEngine.getSeedingThresholds({ participantsCount: 16, roundRobinGroupsCount: 7 });
    expect(result.error).toBeDefined();
  });

  test('categoryCanContain: an U16 fits inside an U18, not the other way round', () => {
    let result: any = tournamentEngine.categoryCanContain({
      childCategory: { ageCategoryCode: 'U16' },
      category: { ageCategoryCode: 'U18' },
    });
    expect(result.valid).toEqual(true);

    result = tournamentEngine.categoryCanContain({
      childCategory: { ageCategoryCode: 'U18' },
      category: { ageCategoryCode: 'U16' },
      withDetails: true,
    });
    // the result omits every false attribute (`definedAttributes`, ignoreFalse): a refusal has no `valid` key at all
    expect(result.valid).toBeUndefined();
    expect(result.invalidAgeMax).toEqual(true);
    expect(result.categoryDetails).toBeDefined();
  });

  test('getMatchUpContextIds: the ids that locate a matchUp, from inContext matchUps', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }], setState: true });

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const { matchUpId, structureId } = matchUps[0];

    let result: any = tournamentEngine.getMatchUpContextIds({ matchUps, matchUpId });
    expect(result).toEqual({
      tournamentId: tournamentRecord.tournamentId,
      structureId,
      matchUpId,
      eventId,
      drawId,
    });

    result = tournamentEngine.getMatchUpContextIds({ matchUps: 'not matchUps', matchUpId });
    expect(result.error).toBeDefined();
  });

  test('getMatchUpsToSchedule: keeps the given order and leaves out a completed or already-timed matchUp', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }], setState: true });

    const firstRound = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps;
    expect(firstRound.length).toEqual(4);
    const [completed, timed, ...rest] = firstRound.map(({ matchUpId }) => matchUpId);

    const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
    expect(tournamentEngine.setMatchUpStatus({ drawId, matchUpId: completed, outcome }).success).toEqual(true);

    const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } });
    const orderedMatchUpIds = [...rest].reverse().concat([timed, completed]);

    let result: any = tournamentEngine.getMatchUpsToSchedule({
      matchUpScheduleTimes: { [timed]: '09:00' },
      orderedMatchUpIds,
      matchUps,
    });
    expect(result.matchUpsToSchedule.map(({ matchUpId }) => matchUpId)).toEqual([...rest].reverse());

    result = tournamentEngine.getMatchUpsToSchedule({ orderedMatchUpIds });
    expect(result.error).toBeDefined();
  });

  test('tieFormatGenderValidityCheck: a collection must agree with its event gender', () => {
    let result: any = tournamentEngine.tieFormatGenderValidityCheck({ referenceGender: MALE, gender: MALE });
    expect(result.valid).toEqual(true);

    result = tournamentEngine.tieFormatGenderValidityCheck({ referenceGender: MALE, gender: FEMALE });
    expect(result.valid).toEqual(false);
    expect(result.error).toEqual(INVALID_GENDER);

    // MIXED is a doubles-only collection gender
    result = tournamentEngine.tieFormatGenderValidityCheck({
      referenceGender: MIXED,
      matchUpType: DOUBLES,
      gender: MIXED,
    });
    expect(result.valid).toEqual(true);
    result = tournamentEngine.tieFormatGenderValidityCheck({
      referenceGender: MIXED,
      matchUpType: SINGLES,
      gender: MIXED,
    });
    expect(result.error).toEqual(INVALID_GENDER);
  });
});

describe('the consumer-named methods an integrator uses, driven through the engine', () => {
  test('addParticipantExtension and removeParticipantExtension: the record changes, and the change is announced', () => {
    // Until this suite drove them through the engine, both wrote to `findParticipant`'s deep copy and reported
    // success with the record unchanged: deep copy is on by default, so neither ever persisted on an engine
    mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 4 }, setState: true });

    const modified: string[] = [];
    setSubscriptions({
      subscriptions: {
        [MODIFY_PARTICIPANTS]: (notices) =>
          notices.forEach(({ participants }) =>
            participants.forEach(({ participantId }) => modified.push(participantId)),
          ),
      },
    });

    const { participantId } = tournamentEngine.getParticipants().participants[0];
    const extension = { name: 'integratorKey', value: { externalId: 'abc-123' } };
    const storedExtension = () =>
      tournamentEngine
        .findParticipant({ participantId })
        .participant.extensions?.find(({ name }) => name === extension.name);

    let result: any = tournamentEngine.addParticipantExtension({ participantId, extension });
    expect(result.success).toEqual(true);
    expect(storedExtension()?.value).toEqual(extension.value);
    expect(modified).toEqual([participantId]);

    result = tournamentEngine.removeParticipantExtension({ participantId, name: extension.name });
    expect(result.success).toEqual(true);
    expect(storedExtension()).toBeUndefined();
    expect(modified).toEqual([participantId, participantId]);

    result = tournamentEngine.addParticipantExtension({ participantId: 'nobody', extension });
    expect(result.error).toEqual(PARTICIPANT_NOT_FOUND);
    expect(modified.length).toEqual(2);

    setSubscriptions({ subscriptions: {} });
  });

  test('calculateWinCriteria: a majority of the matchUp values in a dual', () => {
    const result: any = tournamentEngine.calculateWinCriteria({
      collectionDefinitions: [
        { collectionId: 'singles', matchUpType: SINGLES, matchUpCount: 6, matchUpValue: 1 },
        { collectionId: 'doubles', matchUpType: DOUBLES, matchUpCount: 3, matchUpValue: 1 },
      ],
    });
    expect(result.success).toEqual(true);
    expect(result.valueGoal).toEqual(5);
  });

  test('checkScoreHasValue: a scored first set has a value, an empty one does not', () => {
    expect(tournamentEngine.checkScoreHasValue({ score: { sets: [{ side1Score: 6, side2Score: 3 }] } })).toEqual(true);
    expect(tournamentEngine.checkScoreHasValue({ score: { sets: [{ setNumber: 1 }] } })).toEqual(false);
  });

  test('checkSetIsComplete: 6-3 completes a set to 6, 5-3 does not', () => {
    const matchUpFormat = 'SET3-S:6/TB7';
    expect(tournamentEngine.checkSetIsComplete({ matchUpFormat, set: { side1Score: 6, side2Score: 3 } })).toEqual(true);
    expect(tournamentEngine.checkSetIsComplete({ matchUpFormat, set: { side1Score: 5, side2Score: 3 } })).toEqual(
      false,
    );
  });

  test('generateScoreString: sets to a score string, winner first', () => {
    const sets = [
      { setNumber: 1, side1Score: 3, side2Score: 6, winningSide: 2 },
      { setNumber: 2, side1Score: 4, side2Score: 6, winningSide: 2 },
    ];
    expect(tournamentEngine.generateScoreString({ sets, winningSide: 2, winnerFirst: true })).toEqual('6-3 6-4');
    expect(tournamentEngine.generateScoreString({ sets, winningSide: 2, winnerFirst: false })).toEqual('3-6 4-6');
  });

  test('getSetComplement and getTiebreakComplement: the winning value for a losing one', () => {
    expect(tournamentEngine.getSetComplement({ lowValue: 3, setTo: 6, tiebreakAt: 6, isSide1: true })).toEqual([3, 6]);
    expect(tournamentEngine.getSetComplement({ lowValue: 5, setTo: 6, tiebreakAt: 6, isSide1: false })).toEqual([7, 5]);
    expect(tournamentEngine.getTiebreakComplement({ lowValue: 3, tiebreakTo: 7, isSide1: true })).toEqual([3, 7]);
    expect(tournamentEngine.getTiebreakComplement({ lowValue: 8, tiebreakTo: 7, isSide1: false })).toEqual([10, 8]);
  });

  test('keyValueScore: key presses build a score', () => {
    const matchUpFormat = 'SET3-S:6/TB7';
    let result: any = tournamentEngine.keyValueScore({ matchUpFormat, scoreString: '', sets: [], value: '3' });
    expect(result.updated).toEqual(true);
    result = tournamentEngine.keyValueScore({
      scoreString: result.scoreString,
      sets: result.sets,
      matchUpFormat,
      value: '4',
    });
    expect(result.updated).toEqual(true);
    expect(result.sets.length).toEqual(2);
    // `lowSide` defaults to 1: each key is side 1's (losing) games, completed to a won set for side 2
    expect(result.scoreString.trim()).toEqual('3-6 4-6');

    result = tournamentEngine.keyValueScore({ matchUpFormat, scoreString: '', sets: [], value: 'q' });
    expect(result.updated).toEqual(false);
  });
});
