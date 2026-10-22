import { getDrawDefinition, getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { checkLoserSeatsDerived } from '@Tests/testHarness/exitPropagation/properties';
import { byeSeatsOwedTo, feederSendsNobody } from '@Mutate/matchUps/matchUpStatus/feederSendsNobody';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { COMPASS, FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A LOSER SEAT HOLDS WHAT ITS FEEDER SENDS (Mentat P58, CA 2026-10-21: retire the `byeClaims` ledger).
 *
 * `feederSendsNobody` reads, from the draw as it stands, whether the matchUp feeding a loser seat will ever send anyone
 * across the link, and why not. Every replay step holds the draw to it (`LOSER_SEAT_DERIVED`): a propagated BYE on a
 * loser seat has a feeder that sends nobody, and a participant there has a feeder that sends somebody. Measured before
 * it was asserted: 2,493,487 seat observations in the census gate inputs and 118,803 in this suite, no contradiction.
 */

const played = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome;
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

function reasonFor(drawId: string, key: string, withdrawn?: Set<string>) {
  const drawDefinition = getDrawDefinition(drawId);
  const inContextDrawMatchUps = getDrawMatchUps(drawId);
  const feeder = inContextDrawMatchUps.find((matchUp: any) => coordinate(matchUp) === key);
  const loserTargetLink = positionTargets({ matchUpId: feeder.matchUpId, inContextDrawMatchUps, drawDefinition })
    ?.targetLinks?.loserTargetLink;
  return feederSendsNobody({ inContextDrawMatchUps, loserTargetLink, drawDefinition, withdrawn, feeder });
}

function draw(drawId: string, config: any, steps: [string, any][] = []) {
  setSubscriptions({});
  expect(prepareDraw({ propagateExitStatus: true, seed: 1, ...config }, drawId)).toEqual(true);
  for (const [key, outcome] of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
    expect(
      observeMutation({ propagateExitStatus: true, matchUpId: target.matchUpId, outcome, drawId }).error,
    ).toBeUndefined();
  }
}

describe('feederSendsNobody reads the feeder as it stands', () => {
  it('a BYE matchUp, a double exit, and an undecided matchUp that sends somebody', () => {
    draw('derived-bye-and-double', { drawType: COMPASS, drawSize: 16, participantsCount: 14 }, [
      ['East|1|2', { matchUpStatus: DOUBLE_WALKOVER }],
    ]);
    const byeMatchUp = getDrawMatchUps('derived-bye-and-double').find(
      (matchUp: any) =>
        matchUp.structureName === 'East' && matchUp.roundNumber === 1 && matchUp.matchUpStatus === 'BYE',
    );
    expect(reasonFor('derived-bye-and-double', coordinate(byeMatchUp))).toEqual('FEEDER_HOLDS_BYE');
    expect(reasonFor('derived-bye-and-double', 'East|1|2')).toEqual('DOUBLE_EXIT');
    expect(reasonFor('derived-bye-and-double', 'East|1|3')).toBeUndefined();
  });

  it('a matchUp awaiting the winner beside a carried exit, and the same matchUp won against it', () => {
    draw('derived-pending', { drawType: COMPASS, drawSize: 16, participantsCount: 16 }, [
      ['East|1|1', { matchUpStatus: DOUBLE_WALKOVER }],
    ]);
    // the double walkover's produced exit stands in East|2|1, which waits for East|1|2's winner
    expect(reasonFor('derived-pending', 'East|2|1')).toEqual('EXIT_PENDING');
    draw('derived-won', { drawType: COMPASS, drawSize: 16, participantsCount: 16 }, [
      ['East|1|1', { matchUpStatus: DOUBLE_WALKOVER }],
      ['East|1|2', { winningSide: 1 }],
    ]);
    const won = getDrawMatchUps('derived-won').find((matchUp: any) => coordinate(matchUp) === 'East|2|1');
    expect(won.matchUpStatus).toEqual(WALKOVER);
    expect(reasonFor('derived-won', 'East|2|1')).toEqual('NOBODY_LOST');
  });

  it('a first-match-loser link that carries none of the matchUp’s possible losers', () => {
    draw('derived-link', { drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8, participantsCount: 8 }, [
      ['Main|1|1', played],
      ['Main|1|2', played],
    ]);
    // both of Main|2|1's participants have a scored win, so its loser never crosses to the consolation
    expect(reasonFor('derived-link', 'Main|2|1')).toEqual('LINK_EXCLUDES');
    expect(reasonFor('derived-link', 'Main|1|3')).toBeUndefined();
  });

  it('a feeder being unwound is judged as it will stand', () => {
    draw('derived-unwound', { drawType: COMPASS, drawSize: 16, participantsCount: 16 }, [
      ['East|1|1', { matchUpStatus: DOUBLE_WALKOVER }],
    ]);
    const doubleExit = getDrawMatchUps('derived-unwound').find((matchUp: any) => coordinate(matchUp) === 'East|1|1');
    // its own result no longer counts, and neither does the exit it sent on
    expect(reasonFor('derived-unwound', 'East|1|1', new Set([doubleExit.matchUpId]))).toBeUndefined();
    expect(reasonFor('derived-unwound', 'East|2|1', new Set([doubleExit.matchUpId]))).toBeUndefined();
  });
});

describe('byeSeatsOwedTo reads the BYEs a matchUp is the reason for', () => {
  it('the seats a double exit feeds, and every seat a BYE it caused leaves nobody to fill', () => {
    const drawId = 'derived-owed';
    draw(drawId, { drawType: COMPASS, drawSize: 16, participantsCount: 16 }, [
      ['East|1|1', { matchUpStatus: DOUBLE_WALKOVER }],
    ]);
    const inContextDrawMatchUps = getDrawMatchUps(drawId);
    const doubleExit = inContextDrawMatchUps.find((matchUp: any) => coordinate(matchUp) === 'East|1|1');
    const owed = byeSeatsOwedTo({
      inContextDrawMatchUps,
      drawDefinition: getDrawDefinition(drawId),
      matchUpId: doubleExit.matchUpId,
    });
    // West|1|1 and North|1|1 directly; each becomes a BYE matchUp, so the seats their loser links feed follow, and so on
    expect(owed.map(coordinate).sort()).toEqual([
      'Northwest|1|1',
      'North|1|1',
      'Southeast|1|1',
      'South|1|1',
      'West|1|1',
    ]);
    const unplayed = inContextDrawMatchUps.find((matchUp: any) => coordinate(matchUp) === 'East|1|3');
    expect(
      byeSeatsOwedTo({
        inContextDrawMatchUps,
        drawDefinition: getDrawDefinition(drawId),
        matchUpId: unplayed.matchUpId,
      }),
    ).toEqual([]);
  });
});

describe('LOSER_SEAT_DERIVED', () => {
  it('passes a draw the engine left, and fails a propagated BYE whose feeder sends somebody', () => {
    const drawId = 'derived-check';
    draw(drawId, { drawType: COMPASS, drawSize: 16, participantsCount: 16 }, [
      ['East|1|1', { matchUpStatus: DOUBLE_WALKOVER }],
    ]);
    expect(checkLoserSeatsDerived(drawId)).toEqual([]);

    // plant a propagated BYE on the seat East|1|3's loser takes, though East|1|3 is still to be played
    const feeder = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === 'East|1|3');
    expect(feeder.matchUpStatus).toEqual(TO_BE_PLAYED);
    const drawDefinition = getDrawDefinition(drawId);
    const { loserMatchUp, loserTargetDrawPosition } =
      positionTargets({ matchUpId: feeder.matchUpId, inContextDrawMatchUps: getDrawMatchUps(drawId), drawDefinition })
        ?.targetMatchUps ?? {};
    expect(loserMatchUp && loserTargetDrawPosition).toBeTruthy();
    const { tournamentRecord } = tournamentEngine.getTournament();
    const structure = tournamentRecord.events[0].drawDefinitions[0].structures.find(
      (candidate: any) => candidate.structureId === loserMatchUp?.structureId,
    );
    const assignment = structure.positionAssignments.find(
      (candidate: any) => candidate.drawPosition === loserTargetDrawPosition,
    );
    Object.assign(assignment, { bye: true, byeFromPropagation: true });
    tournamentEngine.setState(tournamentRecord);

    const failures = checkLoserSeatsDerived(drawId);
    expect(failures.map((failure) => failure.property)).toEqual(['LOSER_SEAT_DERIVED']);
    expect(failures[0].detail).toContain('fed by East|1|3');
    expect(failures[0].detail).toContain('feeder sends somebody');
  });
});
