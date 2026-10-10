import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, DOUBLE_DEFAULT, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FEED_IN_CHAMPIONSHIP_TO_SF } from '@Constants/drawDefinitionConstants';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';

/**
 * A CARRY WRITTEN PAST A LATE BYE NAMES THE EXIT'S ORIGIN.
 *
 * The eighth at-scale run (seed 20267598, FEED_IN_CHAMPIONSHIP_TO_SF 16/15, `propagateExitStatus`, the first stall the
 * three default arms had produced in 120,000 scenarios), shrunk to eleven steps. Beatrice loses `Main|1|6` by walkover
 * and is fed to the consolation; a BYE then lands beside her twice, each time after she is seated, and the BYE cascade
 * moves her on — `Consolation|1|3`, `2|3`, `3|2`. Evelyn comes the same way from `Main|1|8`, also by walkover; the two
 * carried exits meet in `3|2` and converge to a DOUBLE_WALKOVER, which produces a walkover into `4|2` for Marie.
 *
 * Then `Main|1|8` is re-scored from a walkover to a played result with the same loser. Evelyn's carried exit is
 * withdrawn, the convergence re-derives to Beatrice's walkover alone — `3|2` WALKOVER won by Evelyn — and the settle
 * that would advance her (`settleRederivedDoubleExit`: "a convergence that lost one origin goes where the kept origin
 * alone puts it") asked the kept entry for its origin and found `Consolation|2|3`: the BYE matchUp she had passed, which
 * `writeCarryPastLateBye` had named as the carry's source. A BYE is not an exit, so the entry read as no live exit, the
 * matchUp was never settled, and Evelyn stood won and unadvanced while `Main|3|1`'s double walkover left nothing else to
 * play: `Consolation|4|2` and `5|1` STALLED_POSITION.
 *
 * Every other hop names the origin (`progressExitStatus` RULE 1 carries the source on; `reconcileCarriesPastByes`
 * replays from the BYE matchUp's own entry), and `reconcileStaleExitOrigins` is built on it ("every hop keeps the
 * ORIGIN's id"). The late-BYE write now does too. Falsified before the change: `3|2`'s entry named `2|3`, `4|2` held
 * Marie alone, two stalls.
 */
const STEPS: [string, any][] = [
  ['Main|1|6', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ['Main|1|5', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|7', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|8', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ['Main|1|2', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|7', { matchUpStatus: DOUBLE_DEFAULT }],
  ['Main|3|2', { winningSide: 1 }],
  ['Main|1|4', { matchUpStatus: DOUBLE_DEFAULT }],
  ['Main|1|8', { winningSide: 2 }],
  ['Main|1|3', { winningSide: 1 }],
  ['Main|3|1', { matchUpStatus: DOUBLE_WALKOVER }],
];

const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

it("a carry written past a late BYE names the exit's origin, so a dissolved convergence still advances its winner", () => {
  const drawId = 'late-bye-carry-origin';
  setSubscriptions({});
  const config = {
    drawType: FEED_IN_CHAMPIONSHIP_TO_SF,
    propagateExitStatus: true,
    participantsCount: 15,
    seed: 20267598,
    drawSize: 16,
  };
  expect(prepareDraw(config, drawId)).toEqual(true);

  for (const [coordinates, outcome] of STEPS) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === coordinates);
    expect(target, coordinates).toBeDefined();
    tournamentEngine.setMatchUpStatus({ propagateExitStatus: true, matchUpId: target.matchUpId, outcome, drawId });
  }

  const matchUps = getDrawMatchUps(drawId);
  const at = (coordinates: string) => matchUps.find((matchUp: any) => key(matchUp) === coordinates);
  const names = (matchUp: any) =>
    (matchUp.sides ?? [])
      .map((side: any) => side.participant?.participantName)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

  // the carry Beatrice brought through two late BYEs names Main|1|6, where she exited — not the BYE she passed
  const origin = at('Main|1|6');
  expect(origin.matchUpStatus).toEqual(WALKOVER);
  const meeting = at('Consolation|3|2');
  const beatriceSide = meeting.sides.find(
    (side: any) => side.participant?.participantName === 'Beatrice Swift',
  ).sideNumber;
  expect(meeting.sideExitProvenance[beatriceSide].sourceMatchUpId).toEqual(origin.matchUpId);

  // the convergence dissolved to her walkover alone, won by Evelyn, who went on to meet Marie
  expect(meeting.matchUpStatus).toEqual(WALKOVER);
  expect(names(meeting)).toEqual(['Beatrice Swift', 'Evelyn Holmgren']);
  expect(
    meeting.sides.find((side: any) => side.sideNumber === meeting.winningSide).participant.participantName,
  ).toEqual('Evelyn Holmgren');
  const next = at('Consolation|4|2');
  expect(next.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(names(next)).toEqual(['Evelyn Holmgren', 'Marie Berry']);

  // nothing is stranded: Main|3|1's double walkover left nothing else to play
  expect([DOUBLE_WALKOVER, DOUBLE_DEFAULT]).toContain(at('Main|3|1').matchUpStatus);
  const integrity: any = getDrawInconsistencies({ drawDefinition: getDrawDefinition(drawId), drawId });
  const stalls = (integrity.inconsistencies ?? []).filter((issue: any) => issue.issueType === STALLED_POSITION);
  expect(
    stalls.map((issue: any) => key(matchUps.find((matchUp: any) => matchUp.matchUpId === issue.matchUpId))),
  ).toEqual([]);
  expect(integrity.valid).toEqual(true);
});
