import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { CANNOT_CHANGE_OUTCOME } from '@Constants/errorConditionConstants';

/**
 * A flip never rewrites the entry positions of the structure its participants came FROM.
 *
 * DOUBLE_ELIMINATION is a cycle — Main feeds the Backdraw, the Backdraw final feeds Main's final — so
 * the link walk from a Backdraw matchUp reaches Main. `swapWinnerLoser` then relabelled Main's
 * positionAssignments by identity, exchanging which Main draw position each flipped participant holds
 * and with it every Main result they had played. Nothing reported it: the next re-score of Main r1p3
 * was refused ERR_EXISTING_POSITION_ASSIGNMENT over a changed draw. Census DE window 9300175, shrunk.
 */
const generate = () => {
  const drawId = 'swap-origin';
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: DOUBLE_ELIMINATION, drawSize: 16, participantsCount: 14, drawId }],
    nonRandom: 9300175,
    setState: true,
  });
  const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
  const find = (k: string) =>
    tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps.find((m: any) => key(m) === k);
  const submit = (k: string, outcome: any) =>
    tournamentEngine.setMatchUpStatus({
      matchUpId: find(k).matchUpId,
      allowChangePropagation: true,
      propagateExitStatus: true,
      outcome,
      drawId,
    }) as any;
  const mainAssignments = () =>
    JSON.stringify(
      tournamentEngine
        .getEvent({ drawId })
        .drawDefinition.structures.find((structure: any) => structure.structureName === 'Main').positionAssignments,
    );

  return { find, submit, mainAssignments };
};

it('flipping a Backdraw result leaves Main positionAssignments untouched', () => {
  const { find, submit, mainAssignments } = generate();
  // a PLAYED Backdraw result: a carried walkover cannot be flipped at all (below)
  expect(submit('Main|1|4', { winningSide: 2 }).error).toBeUndefined();
  expect(submit('Main|1|3', { winningSide: 2 }).error).toBeUndefined();
  expect(submit('Backdraw|1|3', { winningSide: 1 }).error).toBeUndefined();

  const before = mainAssignments();
  expect(find('Backdraw|1|3').winningSide).toEqual(1); // control: a decided Backdraw result to flip
  expect(submit('Backdraw|1|3', { matchUpStatus: WALKOVER, winningSide: 2 }).error).toBeUndefined();
  expect(mainAssignments()).toEqual(before);
});

/**
 * The census route (DE window 9300175) reached that flip through a CARRIED walkover: `Main|1|4`'s loser
 * walked over into `Backdraw|1|3`. Flipping it re-scores a carried exit, which is refused (CA,
 * 2026-10-03), so the route now stops there, unchanged; the double exits that followed it still converge
 * with the oracle clean.
 */
it('a carried Backdraw walkover is not flipped, and the double exits after it converge cleanly', () => {
  const { find, submit } = generate();
  expect(submit('Main|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }).error).toBeUndefined();
  expect(submit('Main|1|3', { winningSide: 2 }).error).toBeUndefined();

  expect(find('Backdraw|1|3').winningSide).toEqual(1);
  const before = JSON.stringify(tournamentEngine.getEvent({ drawId: 'swap-origin' }).drawDefinition.structures);
  expect(submit('Backdraw|1|3', { matchUpStatus: WALKOVER, winningSide: 2 }).error).toEqual(CANNOT_CHANGE_OUTCOME);
  expect(JSON.stringify(tournamentEngine.getEvent({ drawId: 'swap-origin' }).drawDefinition.structures)).toEqual(
    before,
  );

  expect(submit('Main|1|4', { matchUpStatus: DOUBLE_DEFAULT }).error).toBeUndefined();
  expect(submit('Main|1|3', { matchUpStatus: DOUBLE_WALKOVER }).error).toBeUndefined();
  /**
   * THE ORACLE IS CLEAN — and it is back to asserting that, which it briefly could not.
   *
   * **P37/P42.** Evicting the exit tenant unmasked an `UNCOLLAPSED_CONVERGENCE` here: provenance
   * recording an exit delivered into BOTH sides of a consolation matchUp while its status was a single
   * `WALKOVER` with a winner. That was **pre-existing** — measured identical on clean `dev`, at the same
   * coordinates — and had been surfacing under the wrong name, `EXIT_CODE_ON_WINNER_SIDE`, because the
   * projection was overwriting the array the old rule read.
   *
   * For one commit this asserted the finding BY NAME rather than expecting none. The convergence
   * reconciliation in `doubleExitAdvancement` closes it, so the stronger form is restored. Kept as two
   * claims so a `warning` appearing here cannot hide behind an error-free list.
   */
  const result: any = tournamentEngine.getDrawInconsistencies({ drawId: 'swap-origin' });
  const found = result.inconsistencies ?? [];
  expect(found.filter((issue: any) => issue.severity === 'error')).toEqual([]);
  expect(found.map((issue: any) => issue.issueType)).toEqual([]);
  expect(result.valid).toEqual(true);
});
