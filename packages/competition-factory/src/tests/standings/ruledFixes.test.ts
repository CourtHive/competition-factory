import { tallyParticipantResults as tallyParticipantResultsV1 } from './v1Reference/tallyParticipantResults';
import { tallyParticipantResults } from '@Query/matchUps/roundRobinTally/tallyParticipantResults';
import { validateTallyPolicy } from '@Validators/validateTallyPolicy';
import { validateSeason } from '@Validators/validateSeason';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants and fixtures
import { POLICY_ROUND_ROBIN_TALLY_DEFAULT } from '@Fixtures/policies/POLICY_ROUND_ROBIN_TALLY_DEFAULT';
import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { WALKOVER } from '@Constants/matchUpStatusConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';

/**
 * The ruled changes of S3a (Mentat `planning/STANDINGS_ENGINE_SPEC.md` § 5.8, § 5.10): K10 fixed, K8 implemented, and
 * the tally policy validated where it is saved. K1 is pinned in the corpus (`v1Corpus.ts`).
 */

describe('K10: a TEAM tie in progress credits each line to the right team', () => {
  it('the line winner gets a line won, the line loser a line lost (v1 credited the winner with both)', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 3, drawType: ROUND_ROBIN, eventType: TEAM_EVENT, tieFormatName: 'DOMINANT_DUO' }],
      completeAllMatchUps: true,
      setState: false,
    });
    tournamentEngine.setState(tournamentRecord);
    const teamMatchUps = () =>
      tournamentEngine
        .allDrawMatchUps({ drawId, inContext: true })
        .matchUps.filter(({ matchUpType }) => matchUpType === TEAM_MATCHUP);

    // clear two of the three lines of one tie: one decided line remains and the tie has no winner
    const { matchUpId, tieMatchUps } = teamMatchUps()[0];
    for (const line of tieMatchUps.slice(1)) {
      let result: any = tournamentEngine.setMatchUpStatus({ drawId, matchUpId: line.matchUpId, outcome: toBePlayed });
      expect(result.success).toBe(true);
    }
    const matchUps = teamMatchUps();
    const team = matchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
    expect(team.winningSide).toBeUndefined();
    const decided = team.tieMatchUps.find(({ winningSide }) => winningSide);
    const winner = team.sides.find(({ sideNumber }) => sideNumber === decided.winningSide).participantId;
    const loser = team.sides.find(({ sideNumber }) => sideNumber !== decided.winningSide).participantId;

    // the tie in progress alone, so its lines are the only ones counted
    const live = tallyParticipantResults({ matchUps: structuredClone([team]) }).participantResults;
    expect(live[winner]).toMatchObject({ tieMatchUpsWon: 1, tieMatchUpsLost: 0 });
    expect(live[loser]).toMatchObject({ tieMatchUpsWon: 0, tieMatchUpsLost: 1 });

    const v1 = tallyParticipantResultsV1({ matchUps: structuredClone([team]) as any }).participantResults;
    expect(v1[winner]).toMatchObject({ tieMatchUpsWon: 1, tieMatchUpsLost: 1 });
    expect(v1[loser]).toMatchObject({ tieMatchUpsWon: 0, tieMatchUpsLost: 0 });
  });
});

describe('K8: disqualification, through the engine', () => {
  it('a participant who conceded a walkover is placed below everyone who did not, under the default policy', () => {
    // A beats everyone; D concedes a walkover to A but beats B and C (2 wins); B beats C
    const outcomes = [
      { drawPositions: [1, 2], scoreString: '6-1 6-1', winningSide: 1 },
      { drawPositions: [1, 3], scoreString: '6-1 6-1', winningSide: 1 },
      { drawPositions: [1, 4], matchUpStatus: WALKOVER, winningSide: 1 },
      { drawPositions: [2, 3], scoreString: '6-1 6-1', winningSide: 1 },
      { drawPositions: [2, 4], scoreString: '6-1 6-1', winningSide: 2 },
      { drawPositions: [3, 4], scoreString: '6-1 6-1', winningSide: 2 },
    ];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, drawType: ROUND_ROBIN, outcomes }],
      policyDefinitions: POLICY_ROUND_ROBIN_TALLY_DEFAULT,
      setState: false,
    });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const assignments = drawDefinition.structures[0].structures[0].positionAssignments;
    const orderAt = (drawPosition: number) =>
      assignments.find((assignment) => assignment.drawPosition === drawPosition)?.tally?.groupOrder;
    // drawPositions 1-4 are A-D: A 1st, B 2nd, C 3rd, D (2 wins, a walkover conceded) 4th
    expect([1, 2, 3, 4].map(orderAt)).toEqual([1, 2, 3, 4]);
  });
});

describe('the tally policy is validated where it is saved', () => {
  it('refuses an unknown groupOrderKey or directive attribute (v1 silently fell back to matchUpsWon, K3)', () => {
    let result: any = validateTallyPolicy({ tallyPolicy: { groupOrderKey: 'notAMeasure' } });
    expect(result.error).toEqual(INVALID_VALUES);
    result = validateTallyPolicy({ tallyPolicy: { tallyDirectives: [{ attribute: 'gamesWonn' }] } });
    expect(result.error).toEqual(INVALID_VALUES);
    result = validateTallyPolicy({ tallyPolicy: POLICY_ROUND_ROBIN_TALLY_DEFAULT[POLICY_TYPE_ROUND_ROBIN_TALLY] });
    expect(result.error).toBeUndefined();
  });

  it('attachPolicies refuses an invalid tally policy before writing it', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, drawType: ROUND_ROBIN }],
      setState: false,
    });
    tournamentEngine.setState(tournamentRecord);
    let result: any = tournamentEngine.attachPolicies({
      policyDefinitions: { [POLICY_TYPE_ROUND_ROBIN_TALLY]: { groupOrderKey: 'notAMeasure' } },
      drawId,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it("validateSeason checks the season's and each tier's policy, and a calculation can opt out", () => {
    const season: any = {
      seasonId: 'S',
      seriesId: 'SERIES',
      name: 'Season',
      startDate: '2026-01-01',
      status: 'ACTIVE',
      tallyPolicy: { groupOrderKey: 'valueWon' },
      tiers: [{ tierId: 'T', tier: { system: 'MOCK', value: 'T' }, tallyPolicy: { groupOrderKey: 'notAMeasure' } }],
      periods: [{ periodId: 'P1', periodNumber: 1, includeInStandings: true, competitions: [] }],
    };
    let result: any = validateSeason({ season });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.errors).toEqual(['tier T tallyPolicy: unknown groupOrderKey: notAMeasure']);
    result = validateSeason({ season, checkPolicies: false });
    expect(result.valid).toBe(true);
  });
});
