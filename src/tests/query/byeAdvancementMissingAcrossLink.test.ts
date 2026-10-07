import { BYE_ADVANCEMENT_MISSING_ACROSS_LINK } from '@Query/drawDefinition/getStructureInconsistencies';
import { getTournamentRecords, setSubscriptions } from '@Global/state/globalState';
import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * `BYE_ADVANCEMENT_MISSING` stops at the structure: a participant beside a BYE at the source round of a cross-structure
 * WINNER link, who was never advanced into the link's target, scored clean. Census w2 9100389 (DOUBLE_ELIMINATION 8/8):
 * on `dev` before #5269 the Main dp5 loser won the Backdraw, a Main double walkover placed a propagated BYE beside them at
 * the Backdraw final, and they stood there while the Main final waited; `getDrawInconsistencies` said `valid`.
 *
 * The engine now makes that crossing (`crossLinksThroughByes`), and the check shares its predicate (`getByeCrossing`),
 * so what is reported is exactly a crossing the engine owes and has not made. The draw is broken BY HAND here, so the
 * check is exercised whatever the engine does, and the control is the same draw unbroken.
 */
const drawId = 'bye-advancement-across-link';
const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
const find = (k: string) => getDrawMatchUps(drawId).find((m: any) => key(m) === k);

function score(k: string, outcome: any) {
  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: find(k).matchUpId,
    propagateExitStatus: true,
    outcome,
    drawId,
  });
  expect(result.error, k).toBeUndefined();
}

function playToTheCrossing() {
  setSubscriptions({});
  const config = {
    drawType: DOUBLE_ELIMINATION,
    propagateExitStatus: true,
    participantsCount: 8,
    seed: 9100389,
    drawSize: 8,
  };
  expect(prepareDraw(config as any, drawId)).toEqual(true);
  score('Main|1|2', { winningSide: 2 });
  score('Main|1|4', { matchUpStatus: DOUBLE_WALKOVER });
  score('Main|1|4', { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' });
  score('Main|1|3', { matchUpStatus: DEFAULTED, winningSide: 1 });
  score('Main|1|2', { matchUpStatus: WALKOVER, winningSide: 1 });
  score('Main|1|4', { matchUpStatus: DOUBLE_WALKOVER });
  score('Main|1|1', { winningSide: 2 });
  score('Main|1|2', { winningSide: 2 });
  score('Main|1|4', { matchUpStatus: DOUBLE_DEFAULT });
  score('Main|1|3', { winningSide: 2 });
  score('Backdraw|1|2', { matchUpStatus: DOUBLE_DEFAULT });
  score('Main|2|1', { matchUpStatus: DOUBLE_WALKOVER });

  const backdrawFinal = find('Backdraw|4|1');
  const champion = backdrawFinal.sides.find((side: any) => side.participantId)?.participantId;
  expect(backdrawFinal.sides.some((side: any) => side.bye)).toEqual(true);
  expect(champion).toBeDefined();
  return { backdrawFinal, champion };
}

/** the matchUp as STORED in the live tournament record (the harness's reads return copies) */
function storedMatchUp(matchUpId: string): any {
  const records: any = getTournamentRecords();
  return Object.values(records)
    .flatMap((tournament: any) => tournament.events ?? [])
    .flatMap((event: any) => event.drawDefinitions ?? [])
    .filter((drawDefinition: any) => drawDefinition.drawId === drawId)
    .flatMap((drawDefinition: any) => drawDefinition.structures ?? [])
    .flatMap((structure: any) => structure.matchUps ?? [])
    .find((m: any) => m.matchUpId === matchUpId);
}

const issues = () =>
  ((tournamentEngine.getDrawInconsistencies({ drawId }) as any).inconsistencies ?? []).filter(
    (issue: any) => issue.issueType === BYE_ADVANCEMENT_MISSING_ACROSS_LINK,
  );

it('the control: the Backdraw champion beside a propagated BYE stands in the Main final, and nothing is reported', () => {
  const { champion } = playToTheCrossing();
  const final = find('Main|4|1');
  expect(final.sides.some((side: any) => side.participantId === champion)).toEqual(true);
  expect(issues()).toEqual([]);
  expect((tournamentEngine.getDrawInconsistencies({ drawId }) as any).valid).toEqual(true);
});

it('a champion left beside the BYE while the final waits is reported against the Backdraw final', () => {
  const { backdrawFinal, champion } = playToTheCrossing();
  const final = find('Main|4|1');
  const championPosition = final.sides.find((side: any) => side.participantId === champion)?.drawPosition;
  expect(championPosition).toBeDefined();

  // break the draw by hand: take the champion's position back out of the final, as the stranded state on `dev` had it
  const stored = storedMatchUp(final.matchUpId);
  stored.drawPositions = stored.drawPositions.filter((position: number) => position !== championPosition);

  const found = issues();
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({
    matchUpId: backdrawFinal.matchUpId,
    structureId: backdrawFinal.structureId,
    winnerMatchUpId: final.matchUpId,
    participantId: champion,
    severity: 'error',
  });
  expect((tournamentEngine.getDrawInconsistencies({ drawId }) as any).valid).toEqual(false);
});

it('a decided target is left alone: nothing is reported once the final has a result', () => {
  const { champion } = playToTheCrossing();
  const final = find('Main|4|1');
  const championPosition = final.sides.find((side: any) => side.participantId === champion)?.drawPosition;
  const stored = storedMatchUp(final.matchUpId);
  stored.drawPositions = stored.drawPositions.filter((position: number) => position !== championPosition);
  stored.winningSide = 1;
  expect(issues()).toEqual([]);
});
