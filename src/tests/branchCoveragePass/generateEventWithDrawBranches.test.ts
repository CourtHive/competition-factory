/**
 * Branch-coverage tests for generateEventWithDraw.ts
 * Targets guard / edge / rare-mode branches not exercised by the happy paths:
 * - teamGenders override (floor) that exceeds tieFormat gender counts and teamSize (106, 111, 112)
 * - TEAM participant/team building with jersey biographicalInformation (243, 244, 245)
 * - HYBRID event (individual + pair) participant synthesis (287, 295)
 * - MIXED DOUBLES balanced-gender re-pairing
 * - qualifyingProfiles participant counting ternary (1001) + qualifying entries path
 * - tieFormatId resolution attempt (1049)
 * - missing drawProfile → checkRequiredParameters error (775)
 * - iterativeAdHoc AD_HOC roundsCount > 1 (954, 561..576 happy sides)
 * - ROUND_ROBIN_WITH_PLAYOFF with completionGoal (441)
 */
import { ROUND_ROBIN_WITH_PLAYOFF, SINGLE_ELIMINATION, AD_HOC } from '@Constants/drawDefinitionConstants';
import { generateEventWithDraw } from '@Assemblies/generators/mocks/generateEventWithDraw';
import { DOUBLES, HYBRID, TEAM } from '@Constants/eventConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import tournamentEngine from '@Engines/syncEngine';
import { FEMALE, MALE, MIXED } from '@Constants/genderConstants';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

test('missing drawProfile returns a checkRequiredParameters error (line 775)', () => {
  let result: any = generateEventWithDraw({});
  expect(result.error).toBeDefined();
});

test('TEAM event with teamGenders override exceeding defaults and teamSize (106, 111, 112, 243-245)', () => {
  let result: any = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 0, idPrefix: 'team-ovr' },
    setState: true,
    drawProfiles: [
      {
        eventType: TEAM,
        drawType: SINGLE_ELIMINATION,
        drawSize: 2,
        teamGenders: { MALE: 6, FEMALE: 6 },
      },
    ],
  });
  expect(result.tournamentRecord).toBeDefined();

  let allResult: any = tournamentEngine.getParticipants({});
  const teamParticipants = allResult.participants.filter((p) => p.participantType === TEAM);
  expect(teamParticipants.length).toBeGreaterThan(0);

  // jersey biographicalInformation was attached to team members
  const withTeamAttrs = allResult.participants.filter((p) => p.person?.biographicalInformation?.teamAttributes?.length);
  expect(withTeamAttrs.length).toBeGreaterThan(0);
});

test('HYBRID event synthesizes individuals and pairs (287, 295)', () => {
  let result: any = mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles: [
      {
        eventType: HYBRID,
        drawSize: 8,
      },
    ],
  });
  expect(result.tournamentRecord).toBeDefined();

  let all: any = tournamentEngine.getParticipants({});
  const pairs = all.participants.filter((p) => p.participantType === 'PAIR');
  expect(pairs.length).toBeGreaterThan(0);
});

test('MIXED DOUBLES re-pairs generated individuals into mixed-sex pairs', () => {
  let result: any = mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles: [
      {
        eventType: DOUBLES,
        gender: MIXED,
        drawSize: 4,
      },
    ],
  });
  expect(result.tournamentRecord).toBeDefined();

  let all: any = tournamentEngine.getParticipants({ withIndividualParticipants: true });
  const pairs = all.participants.filter((p) => p.participantType === 'PAIR');
  expect(pairs.length).toBeGreaterThan(0);
  // at least one pair should contain a MALE and a FEMALE member
  const mixedPair = pairs.find((p) => {
    const sexes = new Set((p.individualParticipants ?? []).map((ip) => ip.person?.sex));
    return sexes.has(MALE) && sexes.has(FEMALE);
  });
  expect(mixedPair).toBeDefined();
});

test('qualifyingProfiles with participantsCount and drawSize (1001, qualifying entries path)', () => {
  let result: any = mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles: [
      {
        drawSize: 16,
        qualifyingProfiles: [
          {
            roundTarget: 1,
            structureProfiles: [{ stageSequence: 1, drawSize: 16, qualifyingPositions: 4, participantsCount: 12 }],
          },
        ],
      },
    ],
  });
  expect(result.tournamentRecord).toBeDefined();

  tournamentEngine.setState(result.tournamentRecord);
  const { event } = tournamentEngine.getEvent({ eventId: result.eventIds[0] });
  const qualifyingEntries = (event.entries ?? []).filter((e) => e.entryStage === 'QUALIFYING');
  expect(qualifyingEntries.length).toBeGreaterThan(0);
});

test('qualifyingProfiles without participantsCount uses drawSize (1001 alternate)', () => {
  let result: any = mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles: [
      {
        drawSize: 16,
        qualifyingProfiles: [
          {
            roundTarget: 1,
            structureProfiles: [{ stageSequence: 1, drawSize: 8, qualifyingPositions: 2 }],
          },
        ],
      },
    ],
  });
  expect(result.tournamentRecord).toBeDefined();
});

test('drawProfile.tieFormatId with no matching event attempts lookup (1049)', () => {
  let result: any = mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles: [
      {
        eventType: TEAM,
        drawSize: 2,
        tieFormatId: 'non-existent-tieFormatId',
      },
    ],
  });
  expect(result.tournamentRecord).toBeDefined();
});

test('iterativeAdHoc AD_HOC roundsCount > 1 with completeAllMatchUps (954, 561-576)', () => {
  let result: any = mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    setState: true,
    drawProfiles: [
      {
        drawSize: 6,
        drawType: AD_HOC,
        roundsCount: 3,
        scaleName: 'WTN',
      },
    ],
  });
  expect(result.tournamentRecord).toBeDefined();

  let { matchUps }: any = tournamentEngine.allTournamentMatchUps();
  const roundNumbers = new Set(matchUps.map((m) => m.roundNumber));
  expect(roundNumbers.size).toBe(3);
});

test('ROUND_ROBIN_WITH_PLAYOFF with completionGoal and completeAllMatchUps (441)', () => {
  let result: any = mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    setState: true,
    drawProfiles: [
      {
        drawSize: 8,
        drawType: ROUND_ROBIN_WITH_PLAYOFF,
        completionGoal: 6,
      },
    ],
  });
  expect(result.tournamentRecord).toBeDefined();

  let { matchUps }: any = tournamentEngine.allTournamentMatchUps();
  const completedCount = matchUps.filter((m) => m.matchUpStatus === COMPLETED).length;
  expect(completedCount).toBeGreaterThan(0);
});

test('participantsProfile.participantsCount 0 forces per-draw participant synthesis', () => {
  let result: any = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 0 },
    setState: true,
    drawProfiles: [{ drawSize: 8, uniqueParticipants: true }],
  });
  expect(result.tournamentRecord).toBeDefined();
  let { matchUps }: any = tournamentEngine.allTournamentMatchUps();
  expect(matchUps.length).toBeGreaterThan(0);
});
