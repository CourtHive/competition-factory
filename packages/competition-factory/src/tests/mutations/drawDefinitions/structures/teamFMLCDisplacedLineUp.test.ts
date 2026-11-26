import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import { CANNOT_CHANGE_FEED_ELIGIBILITY } from '@Constants/errorConditionConstants';
import { BYE, COMPLETED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { RANKING } from '@Constants/scaleConstants';

// Fixtures
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';

// A TEAM FIRST_MATCH_LOSER_CONSOLATION draw of 8 with DOMINANT_DUO (two singles and a doubles; two rubbers win
// the dual). A round 1 WALKOVER is not a win, so its winner losing round 2 is fed into the consolation with its
// lineUp. Correcting that WALKOVER to a scored win makes the round 2 loss no longer a first match: the loser
// is withheld and a BYE takes the fed slot. Nothing of the withheld team may stay on that BYE.
it('a TEAM withheld from the consolation leaves no lineUp on the BYE that replaces it', () => {
  const {
    drawIds: [drawId],
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        tieFormatName: DOMINANT_DUO,
        eventType: TEAM_EVENT,
        drawSize: 8,
      },
    ],
    setState: true,
  });
  let result: any = tournamentEngine.generateLineUps({
    scaleAccessor: { scaleType: RANKING, scaleName: 'U18' },
    useDefaultEventRanking: true,
    attach: true,
    eventId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const matchUps = () => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
  const duals = (stage: string, roundNumber: number) =>
    matchUps().filter((m) => m.matchUpType === TEAM_MATCHUP && m.stage === stage && m.roundNumber === roundNumber);
  const playDual = (matchUpId: string, winningSide: number) => {
    for (const rubber of matchUps().filter((m) => m.matchUpTieId === matchUpId)) {
      const scoreString = rubber.matchUpFormat.startsWith('SET3') ? '6-1 6-1' : '8-1';
      const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString, winningSide });
      const result = tournamentEngine.setMatchUpStatus({ matchUpId: rubber.matchUpId, outcome, drawId });
      expect(result.success).toEqual(true);
    }
  };

  // round 1: side 1 of the first dual wins by WALKOVER; the other duals are scored
  const [walkoverDual, ...scoredDuals] = duals(MAIN, 1);
  result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
    matchUpId: walkoverDual.matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);
  for (const dual of scoredDuals) playDual(dual.matchUpId, 1);

  // round 2: the WALKOVER winner loses its first scored dual and is fed
  const walkoverDrawPosition = walkoverDual.drawPositions[0];
  const roundTwoDual = duals(MAIN, 2).find((m) => m.drawPositions?.includes(walkoverDrawPosition));
  const walkoverSide = roundTwoDual.sides.find((side) => side.drawPosition === walkoverDrawPosition);
  playDual(roundTwoDual.matchUpId, 3 - walkoverSide.sideNumber);

  const fedDual = () =>
    duals(CONSOLATION, 2).find((m) => m.sides.some((side) => side.participantId === walkoverSide.participantId));
  const { matchUpId: fedMatchUpId } = fedDual();
  const storedSides = () => {
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const consolation = drawDefinition.structures.find(({ stage }) => stage === CONSOLATION);
    return consolation.matchUps.find(({ matchUpId }) => matchUpId === fedMatchUpId).sides;
  };
  expect(storedSides().some((side) => side.lineUp?.length)).toEqual(true);

  // Class 4: the WALKOVER dual keeps its winner while its lines project none, so its first line leaves
  // the round 2 dual and the fed loser as they stand. The line that would complete the tally relabels the dual to a scored
  // win with its loser already fed, and is refused as the dual's own call is (row 12). Before this rule the first line
  // un-decided the dual and reset round 2, which is how the correction used to reach the withheld loser.
  const [firstLine, secondLine] = matchUps().filter((m) => m.matchUpTieId === walkoverDual.matchUpId);
  const lineOutcome = (rubber: any, winningSide: number) =>
    mocksEngine.generateOutcomeFromScoreString({
      scoreString: rubber.matchUpFormat.startsWith('SET3') ? '6-1 6-1' : '8-1',
      winningSide,
    }).outcome;
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: firstLine.matchUpId,
    outcome: lineOutcome(firstLine, 1),
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(matchUps().find((m) => m.matchUpId === walkoverDual.matchUpId).matchUpStatus).toEqual(WALKOVER);
  expect(fedDual()?.matchUpId).toEqual(fedMatchUpId);
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: secondLine.matchUpId,
    outcome: lineOutcome(secondLine, 1),
    drawId,
  });
  expect(result.error).toEqual(CANNOT_CHANGE_FEED_ELIGIBILITY);

  // round 2 is cleared (its loser taken back out of the consolation), the WALKOVER corrected to a scored win, and
  // round 2 played again: the loss is no longer a first match
  for (const rubber of matchUps().filter((m) => m.matchUpTieId === roundTwoDual.matchUpId)) {
    result = tournamentEngine.setMatchUpStatus({ matchUpId: rubber.matchUpId, outcome: toBePlayed, drawId });
    expect(result.success).toEqual(true);
  }
  playDual(walkoverDual.matchUpId, 1);
  expect(matchUps().find((m) => m.matchUpId === walkoverDual.matchUpId).matchUpStatus).toEqual(COMPLETED);
  playDual(roundTwoDual.matchUpId, 3 - walkoverSide.sideNumber);

  expect(fedDual()).toBeUndefined();
  const byeDual = matchUps().find((m) => m.matchUpId === fedMatchUpId);
  expect(byeDual.matchUpStatus).toEqual(BYE);

  // the side the BYE holds carries no lineUp, so its tieMatchUps hydrate no players there
  const byeSideNumbers = byeDual.sides.filter((side) => side.bye).map((side) => side.sideNumber);
  expect(byeSideNumbers.length).toEqual(1);
  expect(storedSides().find((side) => byeSideNumbers.includes(side.sideNumber))?.lineUp ?? []).toEqual([]);
  const rubbers = matchUps().filter((m) => m.matchUpTieId === fedMatchUpId);
  for (const rubber of rubbers) {
    const byeSide = rubber.sides.find((side) => byeSideNumbers.includes(side.sideNumber));
    expect(byeSide?.participantId).toBeUndefined();
  }
});
