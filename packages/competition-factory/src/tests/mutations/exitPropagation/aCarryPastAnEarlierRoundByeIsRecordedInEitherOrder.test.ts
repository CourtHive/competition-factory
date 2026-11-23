import { getDrawDefinition, getDrawMatchUps, projectDraw } from '@Tests/testHarness/exitPropagation/transitions';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { BYE, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A CARRY PAST A BYE IS RECORDED BESIDE THE BYE IN AN EARLIER ROUND TOO, WHICHEVER ENTRY CAME FIRST (F2, census A1).
 *
 * COMPASS 8/8. `East|1|1` is a double walkover, which places a BYE on side 1 of `West|1|1`; `East|1|2` is a walkover
 * won by side 1, whose loser carries the WALKOVER into side 2 of `West|1|1`, goes through the BYE and carries it on
 * into `West|2|1`. `West|1|1` is not the West structure's last round.
 *
 * Carrier first, the loser is seated with their entry before the BYE arrives, and the entry stays on the BYE matchUp.
 * BYE first, the carry went through RULE 1, which recorded it beside the BYE only in a structure's last round, so the
 * same two results left two draws (census A1 cases 11 and 17, COMPASS 32: `Southwest|1|2` and `Southeast|1|1`). The
 * carry is now recorded beside the BYE in every round, and the two orders leave one draw. Falsified before the change:
 * BYE first, `West|1|1` held only the BYE claim.
 */
const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const DOUBLE_EXIT: [string, any] = ['East|1|1', { matchUpStatus: DOUBLE_WALKOVER }];
const CARRIER: [string, any] = ['East|1|2', { matchUpStatus: WALKOVER, winningSide: 1 }];

it('the BYE first and the carrier first leave one draw, the carry recorded beside the BYE', () => {
  setSubscriptions({});
  const drawId = 'carry-past-an-earlier-round-bye';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawType: COMPASS, drawSize: 8, participantsCount: 8 }],
  });

  const play = (steps: [string, any][]) => {
    tournamentEngine.setState(structuredClone(tournamentRecord));
    for (const [coordinates, outcome] of steps) {
      const target = getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === coordinates);
      const result: any = tournamentEngine.setMatchUpStatus({
        propagateExitStatus: true,
        matchUpId: target.matchUpId,
        outcome,
        drawId,
      });
      expect(result.error, coordinates).toBeUndefined();
    }
    const matchUps = getDrawMatchUps(drawId);
    return { matchUps, projection: projectDraw(getDrawDefinition(drawId)) };
  };

  const byeFirst = play([DOUBLE_EXIT, CARRIER]);
  const carrierFirst = play([CARRIER, DOUBLE_EXIT]);

  // CONTROL: the BYE-held matchUp is in an earlier round than the West final, and the carrier passed through it
  const find = (matchUps: any[], coordinates: string) => matchUps.find((matchUp: any) => key(matchUp) === coordinates);
  const westRounds = byeFirst.matchUps
    .filter((matchUp: any) => matchUp.structureName === 'West')
    .map((matchUp: any) => matchUp.roundNumber);
  expect(Math.max(...westRounds)).toBeGreaterThan(1);
  const eastLoser = find(byeFirst.matchUps, 'East|1|2').sides.find((side: any) => side.sideNumber === 2).participantId;
  const westFinal = find(byeFirst.matchUps, 'West|2|1');
  expect(westFinal.sides.some((side: any) => side.participantId === eastLoser)).toBe(true);

  // the carry is recorded beside the BYE, in both orders
  const eastMatchUpId = find(byeFirst.matchUps, 'East|1|2').matchUpId;
  for (const { matchUps } of [byeFirst, carrierFirst]) {
    const holder = find(matchUps, 'West|1|1');
    expect(holder.matchUpStatus).toEqual(BYE);
    expect(holder.sideExitProvenance?.[2]).toEqual({
      matchUpStatus: WALKOVER,
      previousMatchUpStatus: WALKOVER,
      sourceMatchUpId: eastMatchUpId,
    });
  }

  // and the two orders leave one draw
  expect(byeFirst.projection).toEqual(carrierFirst.projection);
});
