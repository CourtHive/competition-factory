import { observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';
import path from 'path';
import fs from 'fs';

/**
 * A DOUBLE EXIT DISSOLVED IN A STRUCTURE'S LAST ROUND RELEASES ITS CARRIER ACROSS THE LINK, AND LEAVES ITS BYE A BYE
 * (census run-17 baseline, DOUBLE_ELIMINATION 8/5 seeds 20622028 and 20630577 under `doubleExitPropagateBye: false`,
 * shrunk to 4 steps each, one root).
 *
 * A Main round-2 exit carries its loser into the Backdraw, where a first-round double walkover's produced exit meets
 * it: `Backdraw|2|1` becomes a double walkover and relays past a BYE in `Backdraw|3|1` into the Backdraw final, which
 * the Main final's walkover loser also reaches: `Backdraw|4|1` becomes a double walkover too, and — policy off — it
 * advances its carrier's seat across the link into `Main|4|1`. Correcting the round-2 exit to a played win dissolves
 * both: `Backdraw|4|1` re-derives to the single walkover the arriving Backdraw winner takes, and its carrier is the loser.
 *
 * Two things stood after the correction, and forward play leaves neither:
 * 1. the carrier's seat in `Main|4|1`. The release of a re-derived double exit's non-winner positions was keyed on its
 *    own structure's rounds, and from the last round the next round is across the link; the winner, sent there as
 *    forward play sends them, was refused ERR_EXISTING_POSITION_ASSIGNMENT after the correction had written.
 * 2. the BYE-status entry the convergence recorded beside `Backdraw|3|1`'s BYE, which outlived the exit it accompanied.
 *
 * A correction the rules accept ends where forward play ends: compared over the whole draw, provenance included.
 */

const FIXTURE = path.join(__dirname, '../../fixtures/exitPropagation/aDissolvedFinalReleasesAcrossTheLink.json');
const SCHEDULES: { seed: number; config: any; steps: any[] }[] = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const at = (step: any) => `${step.structureName}|${step.roundNumber}|${step.roundPosition}`;

function play(config: any, schedule: any[], drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(config, drawId, POLICY_OFF)).toBe(true);
  const matchUps = (): any[] => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
  for (const step of schedule) {
    const target = matchUps().find((matchUp) => coordinate(matchUp) === at(step));
    const observed = observeMutation({
      propagateExitStatus: config.propagateExitStatus,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(observed.error).toBeUndefined();
    // a divergence the differential pipeline throws is caught into `thrown`, not `error`
    expect(observed.thrown).toBeUndefined();
  }
  // read before the next draw is prepared: preparing replaces engine state
  const names = new Map(matchUps().map((matchUp) => [matchUp.matchUpId, coordinate(matchUp)]));
  return Object.fromEntries(
    matchUps().map((matchUp) => [
      coordinate(matchUp),
      {
        matchUpStatus: matchUp.matchUpStatus,
        winningSide: matchUp.winningSide,
        drawPositions: matchUp.drawPositions,
        participants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? 'BYE' : undefined)),
        provenance: Object.fromEntries(
          Object.entries(matchUp.sideExitProvenance ?? {}).map(([side, entry]: any) => [
            side,
            {
              ...entry,
              sourceMatchUpId: names.get(entry?.sourceMatchUpId) ?? entry?.sourceMatchUpId,
              ...(entry?.byeClaims ? { byeClaims: entry.byeClaims.map((id: string) => names.get(id) ?? id) } : {}),
            },
          ]),
        ),
      },
    ]),
  );
}

it.each(SCHEDULES)(
  'seed $seed: correcting the round-2 exit to a played win ends where forward play ends',
  ({ config, steps }) => {
    const corrected = play(config, steps, `dissolved-final-corrected-${config.seed}`);
    // forward: the round-2 result played from the first, its exit never entered
    const forward = play(config, [steps[3], steps[1], steps[2]], `dissolved-final-forward-${config.seed}`);
    expect(corrected).toEqual(forward);
  },
);
