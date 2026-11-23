import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { DOUBLE_ROUND_ROBIN, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { COLLEGE_DEFAULT } from '@Constants/tieFormatConstants';
import { unique } from '@Tools/arrays';

const TEAMS_COUNT = 8;
const SINGLE_ROUND_ROBIN_ROUNDS = TEAMS_COUNT - 1;
const MATCHUPS_PER_ROUND = TEAMS_COUNT / 2;

function generateLeague(roundsCount?: any) {
  const leagueProfiles = [
    {
      tieFormatName: COLLEGE_DEFAULT,
      leagueName: 'roundsCount league',
      teamsCount: TEAMS_COUNT,
      automated: true,
      roundsCount,
    },
  ];

  let result: any = mocksEngine.generateTournamentRecord({
    startDate: '2026-01-01',
    endDate: '2026-04-30',
    leagueProfiles,
    setState: true,
  });

  const matchUps = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { matchUpTypes: undefined } }).matchUps;
  // team matchUps are the league meetings; tie matchUps (lines) hang beneath them
  const teamMatchUps = matchUps.filter(({ tieMatchUps }) => tieMatchUps);
  const roundNumbers = unique(teamMatchUps.map(({ roundNumber }) => roundNumber));

  return { error: result.error, roundsGenerated: roundNumbers.length, teamMatchUpsCount: teamMatchUps.length };
}

describe('leagueProfiles roundsCount', () => {
  it('defaults to a single round robin when roundsCount is not specified', () => {
    const { error, roundsGenerated, teamMatchUpsCount } = generateLeague(undefined);
    expect(error).toBeUndefined();
    expect(roundsGenerated).toEqual(SINGLE_ROUND_ROBIN_ROUNDS);
    expect(teamMatchUpsCount).toEqual(SINGLE_ROUND_ROBIN_ROUNDS * MATCHUPS_PER_ROUND);
  });

  // regression: `(isNumeric(x) && x) ?? (x === DOUBLE_ROUND_ROBIN)` consumed a numeric roundsCount as a
  // boolean and generated (drawSize - 1) * 2 rounds, which drawMatic rejected — yielding zero matchUps
  it('honors an explicit numeric roundsCount', () => {
    const { error, roundsGenerated, teamMatchUpsCount } = generateLeague(5);
    expect(error).toBeUndefined();
    expect(roundsGenerated).toEqual(5);
    expect(teamMatchUpsCount).toEqual(5 * MATCHUPS_PER_ROUND);
  });

  it('honors an explicit roundsCount equal to a full single round robin', () => {
    const { error, roundsGenerated, teamMatchUpsCount } = generateLeague(SINGLE_ROUND_ROBIN_ROUNDS);
    expect(error).toBeUndefined();
    expect(roundsGenerated).toEqual(SINGLE_ROUND_ROBIN_ROUNDS);
    expect(teamMatchUpsCount).toEqual(SINGLE_ROUND_ROBIN_ROUNDS * MATCHUPS_PER_ROUND);
  });

  // regression: the DOUBLE_ROUND_ROBIN branch was unreachable, so this generated a SINGLE round robin
  it('generates twice the rounds for DOUBLE_ROUND_ROBIN', () => {
    const { error, roundsGenerated, teamMatchUpsCount } = generateLeague(DOUBLE_ROUND_ROBIN);
    expect(error).toBeUndefined();
    expect(roundsGenerated).toEqual(SINGLE_ROUND_ROBIN_ROUNDS * 2);
    expect(teamMatchUpsCount).toEqual(SINGLE_ROUND_ROBIN_ROUNDS * 2 * MATCHUPS_PER_ROUND);
  });
});

describe('leagueProfiles pairingProfile', () => {
  function generateShapedLeague(pairingProfile: any, roundsCount?: number) {
    const leagueProfiles = [
      {
        leagueName: 'shaped league',
        tieFormatName: COLLEGE_DEFAULT,
        teamsCount: TEAMS_COUNT,
        automated: true,
        pairingProfile,
        roundsCount,
      },
    ];

    let result: any = mocksEngine.generateTournamentRecord({
      startDate: '2026-01-01',
      endDate: '2026-04-30',
      leagueProfiles,
      setState: true,
    });

    const teamMatchUps = tournamentEngine.allTournamentMatchUps().matchUps.filter(({ tieMatchUps }) => tieMatchUps);
    const meetings = teamMatchUps.map(({ sides }) =>
      sides
        .map(({ participantId }) => participantId)
        .sort((a, b) => a.localeCompare(b))
        .join('|'),
    );

    return {
      error: result.error,
      roundsGenerated: unique(teamMatchUps.map(({ roundNumber }) => roundNumber)).length,
      teamMatchUpsCount: teamMatchUps.length,
      uniqueMeetings: new Set(meetings).size,
    };
  }

  it('generates a true round robin schedule for a league', () => {
    const { error, roundsGenerated, teamMatchUpsCount, uniqueMeetings } = generateShapedLeague({ shape: ROUND_ROBIN });

    expect(error).toBeUndefined();
    expect(roundsGenerated).toEqual(SINGLE_ROUND_ROBIN_ROUNDS);
    expect(teamMatchUpsCount).toEqual(SINGLE_ROUND_ROBIN_ROUNDS * MATCHUPS_PER_ROUND);
    // every team meets every other team exactly once
    expect(uniqueMeetings).toEqual((TEAMS_COUNT * (TEAMS_COUNT - 1)) / 2);
    expect(uniqueMeetings).toEqual(teamMatchUpsCount);
  });

  it('generates a home-and-home double round robin for a league', () => {
    const { error, roundsGenerated, teamMatchUpsCount, uniqueMeetings } = generateShapedLeague({
      shape: ROUND_ROBIN,
      encounters: 2,
    });

    expect(error).toBeUndefined();
    expect(roundsGenerated).toEqual(SINGLE_ROUND_ROBIN_ROUNDS * 2);
    expect(uniqueMeetings).toEqual(teamMatchUpsCount / 2);
  });

  it('generates a partial round robin for a league', () => {
    const { error, roundsGenerated, teamMatchUpsCount, uniqueMeetings } = generateShapedLeague(
      { shape: ROUND_ROBIN },
      3,
    );

    expect(error).toBeUndefined();
    expect(roundsGenerated).toEqual(3);
    expect(teamMatchUpsCount).toEqual(3 * MATCHUPS_PER_ROUND);
    expect(uniqueMeetings).toEqual(teamMatchUpsCount);
  });
});
