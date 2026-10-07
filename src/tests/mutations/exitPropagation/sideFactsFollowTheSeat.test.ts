import { carriedExitStatus } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { DEFAULTED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import {
  FIRST_MATCH_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  FEED_IN_CHAMPIONSHIP,
  DOUBLE_ELIMINATION,
  CURTIS_CONSOLATION,
} from '@Constants/drawDefinitionConstants';

/**
 * A FACT KEYED BY SIDE FOLLOWS THE PARTICIPANT WHEN THEIR SIDE CHANGES (CA, 2026-10-05: option R, and reason-code
 * badges follow too).
 *
 * A lone position sits on its bracket side; two positions sort ascending. In every paired round of a feed-in
 * structure those disagree, so the participant already in a matchUp can change side when the other seat fills or
 * empties (`Mentat/planning/EXIT_CASCADE_DE_GRAND_FINAL_AND_SIDE_KEY_DESIGN.md` § 1). `winningSide` was re-keyed on
 * arrival; `sideExitProvenance` and `sideStatusCodes` were not, so they went on naming a side that now held the
 * other participant. The census found eight such keys in 1,800 seeds. In each case below, shrunk from the census, a
 * relabel at the exit's SOURCE did not reach the carry and a re-score to a played win did not withdraw it; with the
 * key fresh, both worked.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (coordinate: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = coordinate.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const won = (winningSide: number) => ({ winningSide });
const exit = (matchUpStatus: string, winningSide: number) => ({ matchUpStatus, winningSide });
const clear = { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } };

type Case = { name: string; config: any; carriedTo: string; source: string; steps: Step[] };
const draw = (drawType: string, drawSize: number, participantsCount: number, seed: number) => ({
  propagateExitStatus: true,
  participantsCount,
  drawType,
  drawSize,
  seed,
});

// the census passes the flag on every call, so the reproductions do too: without it no exit is carried at all
const propagateExitStatus = true;

const CASES: Case[] = [
  {
    name: 'FMLC 8/5 w1 9000341: the carrier moves to side 1 when the second seat fills',
    config: draw(FIRST_MATCH_LOSER_CONSOLATION, 8, 5, 9000341),
    carriedTo: 'Consolation|3|1',
    source: 'Main|2|2',
    steps: [at('Main|2|2', exit(WALKOVER, 2)), at('Main|1|2', won(2)), at('Main|2|1', exit(WALKOVER, 2))],
  },
  {
    name: 'FIC 8/5 w2 9100491',
    config: draw(FEED_IN_CHAMPIONSHIP, 8, 5, 9100491),
    carriedTo: 'Consolation|3|1',
    source: 'Main|2|1',
    steps: [
      at('Main|1|2', won(1)),
      at('Main|2|1', exit(DEFAULTED, 1)),
      at('Main|2|2', { matchUpStatus: 'DOUBLE_WALKOVER' }),
    ],
  },
  {
    name: 'FICSF 8/5 w1 9000452',
    config: draw(FEED_IN_CHAMPIONSHIP_TO_SF, 8, 5, 9000452),
    carriedTo: 'Consolation|3|1',
    source: 'Main|2|1',
    steps: [
      at('Main|2|2', won(1)),
      at('Main|1|2', won(2)),
      at('Main|2|1', exit(WALKOVER, 2)),
      at('Consolation|2|1', won(2)),
    ],
  },
  {
    name: 'FICSF 8/5 w2 9100478: the carrier moves back when the other seat EMPTIES',
    config: draw(FEED_IN_CHAMPIONSHIP_TO_SF, 8, 5, 9100478),
    carriedTo: 'Consolation|3|1',
    source: 'Main|2|1',
    steps: [
      at('Main|2|2', won(2)),
      at('Main|1|2', won(1)),
      at('Consolation|2|1', won(2)),
      at('Main|2|1', exit(WALKOVER, 2)),
      at('Consolation|2|1', clear),
    ],
  },
  {
    name: 'CURTIS 16/11 w1 9000056',
    config: draw(CURTIS_CONSOLATION, 16, 11, 9000056),
    carriedTo: 'Consolation 1|3|2',
    source: 'Main|2|1',
    steps: [
      at('Main|1|2', won(2)),
      at('Main|2|1', exit(WALKOVER, 2)),
      at('Main|1|5', won(1)),
      at('Main|1|4', exit(WALKOVER, 2)),
      at('Main|2|2', won(2)),
      at('Consolation 1|2|3', won(2)),
    ],
  },
  {
    name: 'DE 8/5 de 9304690',
    config: draw(DOUBLE_ELIMINATION, 8, 5, 9304690),
    carriedTo: 'Backdraw|3|1',
    source: 'Main|2|2',
    steps: [
      at('Main|1|3', won(2)),
      at('Main|2|2', exit(WALKOVER, 1)),
      at('Main|2|1', { matchUpStatus: 'DOUBLE_WALKOVER' }),
    ],
  },
  {
    name: 'DE 16/11 de 9304337',
    config: draw(DOUBLE_ELIMINATION, 16, 11, 9304337),
    carriedTo: 'Backdraw|3|1',
    source: 'Main|1|7',
    steps: [
      at('Main|1|2', won(2)),
      at('Main|1|5', exit(WALKOVER, 1)),
      at('Main|2|1', { matchUpStatus: 'DOUBLE_WALKOVER' }),
      at('Main|1|7', exit(DEFAULTED, 1)),
      at('Main|2|2', won(2)),
    ],
  },
];

const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

function play({ config, steps }: Case, drawId: string) {
  setSubscriptions({});
  prepareDraw(config, drawId);
  const find = (coordinate: string) => getDrawMatchUps(drawId).find((matchUp) => key(matchUp) === coordinate);
  // the census's own rule: a step whose matchUp does not hold two participants is skipped
  for (const step of steps) {
    const target = find(key(step));
    if ((target?.sides ?? []).filter((side: any) => side?.participantId).length !== 2) continue;
    tournamentEngine.setMatchUpStatus({
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      propagateExitStatus,
      drawId,
    });
  }
  return find;
}

/** the side the source's LOSER (the carrier) now sits on, and the side its carried entry is keyed on */
function sides(find: (coordinate: string) => any, { carriedTo, source }: Case) {
  const origin = find(source);
  const target = find(carriedTo);
  const carrier = origin.sides.find((side: any) => side.sideNumber === 3 - origin.winningSide).participantId;
  const carrierSide = target.sides.find((side: any) => side.participantId === carrier)?.sideNumber;
  const keyedSide = Object.entries(target.sideExitProvenance ?? {})
    .filter(([, entry]: [string, any]) => carriedExitStatus(entry) && entry.sourceMatchUpId === origin.matchUpId)
    .map(([sideNumber]) => Number(sideNumber))[0];
  return { origin, target, carrierSide, keyedSide };
}

describe('the carried exit is keyed to the side its carrier sits on', () => {
  it.each(CASES)('$name', (testCase) => {
    const find = play(testCase, 'seat-key');
    const { carrierSide, keyedSide } = sides(find, testCase);
    // CONTROL: the shape is reached, a carry the source delivered and a carrier standing in the target
    expect(carrierSide).toBeDefined();
    expect(keyedSide).toEqual(carrierSide);
  });
});

describe('a relabel at the source reaches the carry', () => {
  it.each(CASES)('$name', (testCase) => {
    const find = play(testCase, 'seat-relabel');
    const { origin } = sides(find, testCase);
    const relabelled = origin.matchUpStatus === WALKOVER ? DEFAULTED : WALKOVER;
    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: exit(relabelled, origin.winningSide),
      matchUpId: origin.matchUpId,
      propagateExitStatus,
      drawId: 'seat-relabel',
    });
    expect(result.success).toEqual(true);
    expect(find(testCase.carriedTo).matchUpStatus).toEqual(relabelled);
  });
});

describe('a source re-scored as a played win withdraws the carry', () => {
  it.each(CASES)('$name', (testCase) => {
    const find = play(testCase, 'seat-played');
    const { origin } = sides(find, testCase);
    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: won(origin.winningSide),
      matchUpId: origin.matchUpId,
      propagateExitStatus,
      drawId: 'seat-played',
    });
    expect(result.success).toEqual(true);
    // the exit is gone from the source, so the matchUp it was carried to is undecided again (the 2026-10-02 ruling)
    const target = find(testCase.carriedTo);
    expect(target.matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(target.winningSide).toBeUndefined();
  });
});

it('a reason code carried with the exit follows its carrier to the other side (the badge)', () => {
  const [fmlc] = CASES;
  const drawId = 'seat-reason';
  setSubscriptions({});
  prepareDraw(fmlc.config, drawId);
  const find = (coordinate: string) => getDrawMatchUps(drawId).find((matchUp) => key(matchUp) === coordinate);
  const submit = (coordinate: string, outcome: any) =>
    tournamentEngine.setMatchUpStatus({ matchUpId: find(coordinate).matchUpId, propagateExitStatus, drawId, outcome });

  expect(submit('Main|2|2', { ...exit(DEFAULTED, 2), matchUpStatusCodes: ['DM'] }).success).toEqual(true);
  const carrier = find('Main|2|2').sides.find((side: any) => side.sideNumber === 1).participantId;
  const reasonSide = () => Number(Object.keys(find(fmlc.carriedTo).sideStatusCodes ?? {})[0]);
  const carrierSide = () => find(fmlc.carriedTo).sides.find((side: any) => side.participantId === carrier)?.sideNumber;
  // CONTROL: alone in the matchUp, the carrier and its reason share a side
  expect(reasonSide()).toEqual(carrierSide());

  expect(submit('Main|1|2', won(2)).success).toEqual(true);
  expect(submit('Main|2|1', exit(WALKOVER, 2)).success).toEqual(true);
  // the second seat filled and moved the carrier; the reason moved with them
  expect(carrierSide()).toEqual(1);
  expect(find(fmlc.carriedTo).sideStatusCodes).toEqual({ 1: 'DM' });
});

/**
 * A WINNER'S OWN ORIGIN IS NOT AN EXIT, AND A MATCHUP REVERTED TO UNDECIDED ADVANCES NOBODY.
 *
 * Census w2 9100303 (DE 16/11), opened by keying side facts correctly and fixed in the same change. a3e6 won
 * `Backdraw|2|1` by DEFAULTED and arrived in `Backdraw|3|1` with an origin entry carrying that status; a produced
 * walkover from the `Backdraw|2|2` double walkover was awarded to them there, and they advanced to round 4.
 * Re-scoring `Main|2|2` as played turns the double walkover single, its winner arrives, and the produced walkover is
 * withdrawn. The re-derivation read a3e6's origin as an exit THEY carried and awarded the match to the newcomer,
 * who could not advance into a round-4 seat a3e6 still held: `ERR_EXISTING_POSITION_ASSIGNMENT` after mutating.
 * (On `dev` the stale key named the other side, so the same misreading made a3e6 the winner of a default nobody
 * committed, which nothing reported.) Nobody has exited: the matchUp is undecided, and a3e6 comes back out of
 * round 4.
 */
it('w2 9100303: an origin is not re-read as an exit, and the reverted matchUp advances nobody', () => {
  const steps = [
    at('Main|1|5', exit(WALKOVER, 2)),
    at('Main|1|7', won(2)),
    at('Main|1|2', won(2)),
    at('Main|2|1', exit(DEFAULTED, 1)),
    at('Main|2|2', exit(WALKOVER, 2)),
    at('Main|2|2', won(1)),
  ];
  const config = draw(DOUBLE_ELIMINATION, 16, 11, 9100303);
  setSubscriptions({});
  expect(replay(config, steps, 'origin-replay')).toBeNull();

  const find = play({ name: '9100303', config, carriedTo: 'Backdraw|3|1', source: 'Main|2|1', steps }, 'origin');
  const semifinal = find('Backdraw|3|1');
  expect(semifinal.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(semifinal.winningSide).toBeUndefined();
  expect(semifinal.sides.filter((side: any) => side.participantId)).toHaveLength(2);
  // neither semifinalist stands in the next round
  const semifinalists = new Set(semifinal.sides.map((side: any) => side.participantId));
  expect(find('Backdraw|4|1').sides.some((side: any) => semifinalists.has(side.participantId))).toEqual(false);
});
