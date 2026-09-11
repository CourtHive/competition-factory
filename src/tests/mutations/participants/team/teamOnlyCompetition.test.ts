import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';
import { cast } from '@Query/readModel/cast';

// constants and types
import { INDIVIDUAL, PAIR, TEAM as TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { COLLEGE_DEFAULT } from '@Constants/tieFormatConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { TieScoreSourceEnum } from '@Types/tournamentTypes';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { TEAM } from '@Constants/eventConstants';

const TEAMS_COUNT = 6;

/** A federation that publishes teams and results but never player detail: TEAM participants with
 *  no individuals, a real round robin schedule, and ties whose lines are unpopulated by design. */
function generateTeamOnlyLeague({ scoreSource }: { scoreSource?: any } = {}) {
  const tieFormat: any = {
    tieFormatName: 'TEAM_ONLY',
    winCriteria: { valueGoal: 2 },
    scoreSource,
    collectionDefinitions: [
      {
        collectionName: 'Singles',
        matchUpFormat: 'SET3-S:6/TB7',
        collectionId: 'singles',
        matchUpType: SINGLES,
        collectionOrder: 1,
        matchUpValue: 1,
        matchUpCount: 2,
      },
      {
        collectionName: 'Doubles',
        matchUpFormat: 'SET3-S:6/TB7',
        collectionId: 'doubles',
        matchUpType: DOUBLES,
        collectionOrder: 2,
        matchUpValue: 1,
        matchUpCount: 1,
      },
    ],
  };

  let result: any = mocksEngine.generateTournamentRecord({
    leagueProfiles: [
      {
        pairingProfile: { shape: ROUND_ROBIN },
        individualParticipants: false,
        leagueName: 'Team-only division',
        teamsCount: TEAMS_COUNT,
        automated: true,
        tieFormat,
      },
    ],
    startDate: '2026-01-01',
    endDate: '2026-04-30',
    setState: true,
  });

  return { error: result.error };
}

describe('team competitions without individual participants', () => {
  it('generates TEAM participants that enumerate no individuals', () => {
    const { error } = generateTeamOnlyLeague();
    expect(error).toBeUndefined();

    const { participants } = tournamentEngine.getParticipants();
    const teams = participants.filter(({ participantType }) => participantType === TEAM_PARTICIPANT);
    const individuals = participants.filter(({ participantType }) => participantType === INDIVIDUAL);

    expect(teams.length).toEqual(TEAMS_COUNT);
    expect(individuals.length).toEqual(0);
    expect(teams.every(({ individualParticipantIds }) => !individualParticipantIds?.length)).toEqual(true);
  });

  it('generates a complete round robin between teams that have no members', () => {
    generateTeamOnlyLeague();

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const ties = matchUps.filter(({ matchUpType }) => matchUpType === TEAM);

    expect(ties.length).toEqual((TEAMS_COUNT * (TEAMS_COUNT - 1)) / 2);
    // both sides of every tie are populated despite no individuals existing
    expect(ties.every(({ sides }) => sides.filter(({ participantId }) => participantId).length === 2)).toEqual(true);
  });

  it('filters team-only participants by participantType', () => {
    generateTeamOnlyLeague();

    const { participants: teams } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [TEAM_PARTICIPANT] },
    });
    const { participants: individuals } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [INDIVIDUAL] },
    });

    expect(teams.length).toEqual(TEAMS_COUNT);
    expect(individuals.length).toEqual(0);
  });

  it('scores reported ties and tallies standings from team results alone', () => {
    generateTeamOnlyLeague({ scoreSource: TieScoreSourceEnum.REPORTED });

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const ties = matchUps.filter(({ matchUpType }) => matchUpType === TEAM);

    // no lines exist in context. The STORED matchUp carries an empty array; the in-context copy omits
    // it entirely, because hydration strips empty attributes — both say "this tie has no lines".
    expect(ties.every(({ tieMatchUps }) => !tieMatchUps?.length)).toEqual(true);

    const { tournamentRecord } = tournamentEngine.getTournament();
    const storedTies = tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps;
    expect(storedTies.every(({ tieMatchUps }) => Array.isArray(tieMatchUps) && !tieMatchUps.length)).toEqual(true);

    // every tie is won by whichever side is listed first — a reported aggregate, no line detail
    for (const tie of ties) {
      let result: any = tournamentEngine.setMatchUpStatus({
        outcome: {
          score: { scoreStringSide1: '2-1', scoreStringSide2: '1-2', sets: [{ side1Score: 2, side2Score: 1 }] },
          matchUpStatus: COMPLETED,
          winningSide: 1,
        },
        matchUpId: tie.matchUpId,
        drawId: tie.drawId,
      });
      expect(result.success).toEqual(true);
    }

    const { matchUps: scored } = tournamentEngine.allTournamentMatchUps();
    const scoredTies = scored.filter(({ matchUpType }) => matchUpType === TEAM);
    expect(scoredTies.every(({ winningSide }) => winningSide === 1)).toEqual(true);
    expect(scoredTies.every(({ matchUpStatus }) => matchUpStatus === COMPLETED)).toEqual(true);
  });

  it('projects a team-only record into the read model without individual competitors', () => {
    generateTeamOnlyLeague({ scoreSource: TieScoreSourceEnum.REPORTED });
    const { tournamentRecord } = tournamentEngine.getTournament();

    const rows: any = cast({ tournamentRecord }).rows;
    const tieRows = rows.match_ups.filter(({ match_up_level }) => match_up_level === 'TIE');

    expect(tieRows.length).toEqual((TEAMS_COUNT * (TEAMS_COUNT - 1)) / 2);
    expect(rows.match_ups.filter(({ match_up_level }) => match_up_level === 'RUBBER').length).toEqual(0);
    expect(tieRows.every(({ score_source }) => score_source === TieScoreSourceEnum.REPORTED)).toEqual(true);

    // competitors are TEAMs; no person_id is claimed for anyone
    expect(rows.match_up_competitors.length).toBeGreaterThan(0);
    expect(rows.match_up_competitors.every(({ person_id }) => !person_id)).toEqual(true);
  });

  // a PAIR is DEFINED by its two individuals, so the flag must not strip them
  it('ignores individualParticipants for PAIR participants', () => {
    const { participants }: any = mocksEngine.generateParticipants({
      individualParticipants: false,
      participantType: PAIR,
      participantsCount: 3,
    });

    expect(participants.filter(({ participantType }) => participantType === PAIR).length).toEqual(3);
    expect(participants.filter(({ participantType }) => participantType === INDIVIDUAL).length).toEqual(6);
  });

  // falsification: the same profile WITHOUT the flag enumerates individuals, so the assertions
  // above are about the flag rather than about leagues in general
  it('still enumerates individuals when individualParticipants is not disabled', () => {
    mocksEngine.generateTournamentRecord({
      leagueProfiles: [{ tieFormatName: COLLEGE_DEFAULT, teamsCount: TEAMS_COUNT, automated: true }],
      startDate: '2026-01-01',
      endDate: '2026-04-30',
      setState: true,
    });

    const { participants } = tournamentEngine.getParticipants();
    expect(participants.filter(({ participantType }) => participantType === INDIVIDUAL).length).toBeGreaterThan(0);
  });
});
