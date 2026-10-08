import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import { BYE, COMPLETED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { RANKING } from '@Constants/scaleConstants';

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
        tieFormatName: 'DOMINANT_DUO',
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

  // the WALKOVER is corrected to a scored win: the round 2 loss is no longer a first match
  playDual(walkoverDual.matchUpId, 1);
  expect(matchUps().find((m) => m.matchUpId === walkoverDual.matchUpId).matchUpStatus).toEqual(COMPLETED);

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
