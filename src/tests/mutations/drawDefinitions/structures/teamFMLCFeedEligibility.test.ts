import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import { BYE, COMPLETED } from '@Constants/matchUpStatusConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { RANKING } from '@Constants/scaleConstants';

// TEAM FIRST_MATCH_LOSER_CONSOLATION: 7 teams in a draw of 8, so one team has a round 1 BYE and its round 2
// dual is its first match. DOMINANT_DUO is two singles and a doubles; two rubbers win the dual.
function setup() {
  const {
    tournamentRecord,
    drawIds: [drawId],
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        tieFormatName: 'DOMINANT_DUO',
        eventType: TEAM_EVENT,
        participantsCount: 7,
        drawSize: 8,
      },
    ],
  });
  tournamentEngine.setState(tournamentRecord);
  const result = tournamentEngine.generateLineUps({
    scaleAccessor: { scaleType: RANKING, scaleName: 'U18' },
    useDefaultEventRanking: true,
    attach: true,
    eventId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const matchUps = () => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
  const teamMatchUps = (stage: string, roundNumber?: number) =>
    matchUps().filter(
      (m) => m.matchUpType === TEAM_MATCHUP && m.stage === stage && (!roundNumber || m.roundNumber === roundNumber),
    );

  // scores the rubbers in order; each entry is the winningSide of the next rubber
  const playDual = (teamMatchUp, rubberWinningSides: number[]) => {
    const rubbers = matchUps().filter((m) => m.matchUpTieId === teamMatchUp.matchUpId);
    rubberWinningSides.forEach((winningSide, i) => {
      const rubber = rubbers[i];
      const scoreString = rubber.matchUpFormat.startsWith('SET3') ? '6-1 6-1' : '8-1';
      const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString, winningSide });
      const result = tournamentEngine.setMatchUpStatus({ matchUpId: rubber.matchUpId, outcome, drawId });
      expect(result.success).toEqual(true);
    });
    const decided = matchUps().find((m) => m.matchUpId === teamMatchUp.matchUpId);
    expect(decided.matchUpStatus).toEqual(COMPLETED);
    return decided;
  };

  for (const matchUp of teamMatchUps(MAIN, 1).filter((m) => m.matchUpStatus !== BYE)) playDual(matchUp, [1, 1, 1]);

  const byeDrawPosition = teamMatchUps(MAIN, 1)
    .find((m) => m.matchUpStatus === BYE)
    .sides.find((side) => side.participantId).drawPosition;
  const [byeTeamDual, otherDual] = [true, false].map((holdsByeTeam) =>
    teamMatchUps(MAIN, 2).find((m) => m.drawPositions?.includes(byeDrawPosition) === holdsByeTeam),
  );
  const byeTeamSide = byeTeamDual.sides.find((side) => side.drawPosition === byeDrawPosition).sideNumber;

  const loserOf = (dual) => dual.sides.find((side) => side.sideNumber !== dual.winningSide).participantId;
  const inConsolation = (participantId: string) =>
    teamMatchUps(CONSOLATION).some((m) => m.sides.some((side) => side.participantId === participantId));
  const inconsistencies = () => {
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    return (getDrawInconsistencies({ drawDefinition, drawId }) as any).inconsistencies ?? [];
  };

  return { playDual, byeTeamDual, otherDual, byeTeamSide, loserOf, inConsolation, inconsistencies };
}

it('feeds a first-match loser that won a rubber BEFORE losing the dual', () => {
  const { playDual, byeTeamDual, byeTeamSide, loserOf, inConsolation, inconsistencies } = setup();
  const winner = 3 - byeTeamSide;

  // the BYE team takes the first rubber, then loses the dual 1-2
  const decided = playDual(byeTeamDual, [byeTeamSide, winner, winner]);
  expect(decided.winningSide).toEqual(winner);
  expect(inConsolation(loserOf(decided))).toEqual(true);
  expect(inconsistencies()).toEqual([]);
});

it('feeds a first-match loser that won a rubber AFTER the dual was lost', () => {
  const { playDual, byeTeamDual, byeTeamSide, loserOf, inConsolation, inconsistencies } = setup();
  const winner = 3 - byeTeamSide;

  const decided = playDual(byeTeamDual, [winner, winner, byeTeamSide]);
  expect(decided.winningSide).toEqual(winner);
  expect(inConsolation(loserOf(decided))).toEqual(true);
  expect(inconsistencies()).toEqual([]);
});

it('feeds a first-match loser that won no rubbers', () => {
  const { playDual, byeTeamDual, byeTeamSide, loserOf, inConsolation, inconsistencies } = setup();
  const winner = 3 - byeTeamSide;

  const decided = playDual(byeTeamDual, [winner, winner, winner]);
  expect(inConsolation(loserOf(decided))).toEqual(true);
  expect(inconsistencies()).toEqual([]);
});

it('does not feed a round 2 loser that won its round 1 dual, rubbers won in round 2 notwithstanding', () => {
  const { playDual, otherDual, loserOf, inConsolation, inconsistencies } = setup();

  // side 2 takes the first rubber, then loses the dual 1-2: it already won in round 1 and is not fed
  const decided = playDual(otherDual, [2, 1, 1]);
  expect(decided.winningSide).toEqual(1);
  const loser = loserOf(decided);
  // it lost nothing in round 1, so it is in no consolation matchUp at all
  expect(inConsolation(loser)).toEqual(false);
  expect(inconsistencies()).toEqual([]);
});
