import { UNCOLLAPSED_CONVERGENCE } from '@Query/drawDefinition/getStructureInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * A flip never rewrites the entry positions of the structure its participants came FROM.
 *
 * DOUBLE_ELIMINATION is a cycle — Main feeds the Backdraw, the Backdraw final feeds Main's final — so
 * the link walk from a Backdraw matchUp reaches Main. `swapWinnerLoser` then relabelled Main's
 * positionAssignments by identity, exchanging which Main draw position each flipped participant holds
 * and with it every Main result they had played. Nothing reported it: the next re-score of Main r1p3
 * was refused ERR_EXISTING_POSITION_ASSIGNMENT over a changed draw. Census DE window 9300175, shrunk.
 */
it('flipping a Backdraw result leaves Main positionAssignments untouched', () => {
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

  expect(submit('Main|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }).error).toBeUndefined();
  expect(submit('Main|1|3', { winningSide: 2 }).error).toBeUndefined();

  const before = mainAssignments();
  expect(find('Backdraw|1|3').winningSide).toEqual(1); // control: a decided Backdraw result to flip
  expect(submit('Backdraw|1|3', { matchUpStatus: WALKOVER, winningSide: 2 }).error).toBeUndefined();
  expect(mainAssignments()).toEqual(before);

  expect(submit('Main|1|4', { matchUpStatus: DOUBLE_DEFAULT }).error).toBeUndefined();
  expect(submit('Main|1|3', { matchUpStatus: DOUBLE_WALKOVER }).error).toBeUndefined();
  /**
   * THE ORACLE STAYS CLEAN OF ERRORS, and the one WARNING it reports is named.
   *
   * **P37.** This read `toEqual([])`. The draw reaches an `UNCOLLAPSED_CONVERGENCE` — provenance
   * records an exit delivered into BOTH sides of one consolation matchUp while its status is a single
   * `WALKOVER` — and that is **pre-existing**, measured identical on clean `dev` at the same
   * coordinates. It was invisible until the exit tenant left `matchUpStatusCodes`, because the
   * projection overwrote the array with objects that `codeString` ignores; before that it surfaced,
   * wrongly named, as `EXIT_CODE_ON_WINNER_SIDE` at severity `error`.
   *
   * Asserted as two separate claims rather than one list so neither can hide the other: NO error, and
   * NO finding other than the one known warning. A second defect appearing here still fails.
   */
  const result: any = tournamentEngine.getDrawInconsistencies({ drawId });
  const found = result.inconsistencies ?? [];
  expect(found.filter((issue: any) => issue.severity === 'error')).toEqual([]);
  expect(found.map((issue: any) => issue.issueType)).toEqual([UNCOLLAPSED_CONVERGENCE]);
  expect(result.valid).toEqual(true);
});
