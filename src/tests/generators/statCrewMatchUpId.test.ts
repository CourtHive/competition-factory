import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { INVALID_MATCHUP, MATCHUP_NOT_FOUND } from '@Constants/errorConditionConstants';
import { COLLEGE_D3 } from '@Constants/tieFormatConstants';
import { SINGLES, TEAM } from '@Constants/matchUpTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';

/**
 * Two duals between the SAME two teams, in two TEAM events: the first completed, the second not yet played. Without
 * `matchUpId` the export writes both and nothing in a <tngame> says which dual it reports; `games` carries the
 * matchUpId of each, and `matchUpId` limits the export to that one dual.
 */
function setup() {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: 'firstDraw', drawSize: 2, eventType: TEAM_EVENT, tieFormatName: COLLEGE_D3 }],
    completeAllMatchUps: true,
    setState: true,
  });
  const firstDual = teamMatchUps()[0];
  const teamIds = firstDual.sides.map((side) => side.participantId);

  let result: any = tournamentEngine.addEvent({
    event: { eventName: 'Rematch', eventType: TEAM_EVENT, tieFormatName: COLLEGE_D3 },
  });
  expect(result.success).toEqual(true);
  const eventId = result.event.eventId;
  result = tournamentEngine.addEventEntries({ eventId, participantIds: teamIds });
  expect(result.success).toEqual(true);
  result = tournamentEngine.generateDrawDefinition({ eventId, drawId: 'secondDraw', drawSize: 2 });
  expect(result.success).toEqual(true);
  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition: result.drawDefinition });
  expect(result.success).toEqual(true);

  const secondDual = teamMatchUps().find((matchUp) => matchUp.drawId === 'secondDraw');
  expect(secondDual.sides.map((side) => side.participantId).toSorted()).toEqual(teamIds.toSorted());

  return { firstDual, secondDual };
}

function teamMatchUps() {
  return tournamentEngine.allTournamentMatchUps({ matchUpFilters: { matchUpTypes: [TEAM] } }).matchUps;
}

function teamScores(game) {
  return game.childArray.filter((child) => child.team).map(({ team }) => team.score);
}

describe('generateStatCrew matchUpId', () => {
  it('stamps each game with the matchUp it reports, index-aligned with xml and json', () => {
    const { firstDual, secondDual } = setup();
    let result: any = tournamentEngine.generateStatCrew();
    expect(result.success).toEqual(true);
    expect(result.xml).toHaveLength(2);
    expect(result.games.map((game) => game.matchUpId).toSorted()).toEqual(
      [firstDual.matchUpId, secondDual.matchUpId].toSorted(),
    );
    result.games.forEach((game, index) => {
      expect(game.xml).toEqual(result.xml[index]);
      expect(game.json).toEqual(result.json[index]);
    });
    const first = result.games.find((game) => game.matchUpId === firstDual.matchUpId);
    expect(first.drawId).toEqual('firstDraw');
    expect(first.eventId).toEqual(firstDual.eventId);
  });

  it('matchUpId selects that dual alone, even between the same two teams', () => {
    const { firstDual, secondDual } = setup();

    let result: any = tournamentEngine.generateStatCrew({ matchUpId: firstDual.matchUpId });
    expect(result.success).toEqual(true);
    expect(result.xml).toHaveLength(1);
    expect(result.games[0].matchUpId).toEqual(firstDual.matchUpId);
    // the completed dual: all nine tieMatchUps are won by one side or the other
    expect(teamScores(result.json[0]).reduce((a, b) => a + b, 0)).toEqual(9);

    result = tournamentEngine.generateStatCrew({ matchUpId: secondDual.matchUpId });
    expect(result.success).toEqual(true);
    expect(result.xml).toHaveLength(1);
    expect(result.games[0].matchUpId).toEqual(secondDual.matchUpId);
    expect(result.games[0].drawId).toEqual('secondDraw');
    // the rematch is not yet played
    expect(teamScores(result.json[0])).toEqual([0, 0]);
  });

  it('drawId limits the export to that draw', () => {
    const { secondDual } = setup();
    let result: any = tournamentEngine.generateStatCrew({ drawId: 'secondDraw' });
    expect(result.success).toEqual(true);
    expect(result.games.map((game) => game.matchUpId)).toEqual([secondDual.matchUpId]);
  });

  it('refuses a matchUpId that is not a TEAM matchUp of the tournament, or not in the given draw', () => {
    const { firstDual } = setup();
    let result: any = tournamentEngine.generateStatCrew({ matchUpId: 'unknownMatchUpId' });
    expect(result.error).toEqual(MATCHUP_NOT_FOUND);

    result = tournamentEngine.generateStatCrew({ matchUpId: firstDual.matchUpId, drawId: 'secondDraw' });
    expect(result.error).toEqual(MATCHUP_NOT_FOUND);

    const singlesMatchUpId = firstDual.tieMatchUps.find((matchUp) => matchUp.matchUpType === SINGLES).matchUpId;
    result = tournamentEngine.generateStatCrew({ matchUpId: singlesMatchUpId });
    expect(result.error).toEqual(INVALID_MATCHUP);
  });

  it("a game in a multi-dual record is a tournament game and carries the tournament's name", () => {
    const { firstDual } = setup();
    let result: any = tournamentEngine.generateStatCrew({ matchUpId: firstDual.matchUpId });
    const { tournamentName } = tournamentEngine.getTournament().tournamentRecord;
    expect(result.json[0].venue.tournament).toEqual('Y');
    expect(result.json[0].venue.tournamentname).toEqual(tournamentName);
  });

  it('a stand-alone dual is not a tournament game and carries no tournament name', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM_EVENT, tieFormatName: COLLEGE_D3 }],
      completeAllMatchUps: true,
      setState: true,
    });
    let result: any = tournamentEngine.generateStatCrew();
    expect(result.json[0].venue.tournament).toEqual('N');
    expect(result.json[0].venue.tournamentname).toBeUndefined();
    expect(result.xml[0]).not.toContain('tournamentname=');
  });
});
