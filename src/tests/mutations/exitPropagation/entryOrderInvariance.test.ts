import { producedExitStatus } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import {
  FIRST_ROUND_LOSER_CONSOLATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  SINGLE_ELIMINATION,
  DOUBLE_ELIMINATION,
  COMPASS,
} from '@Constants/drawDefinitionConstants';
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * Entering the same two double exits in either order must produce the same record.
 *
 * `doubleExitAdvancement` derived the converged status from the ARRIVING source alone — at
 * `handleEmptyExitLoser` and at `conditionallyAdvanceDrawPosition` — so the stored `matchUpStatus`
 * was a function of tournament state PLUS the order the operator entered the two results. Measured
 * before the fix across 8 draw-type/size combinations x 4 status pairs: **28 of 32 differed**. A
 * director entering the same two walkovers in the other order got a different record.
 *
 * Both sites now derive it with `collapseDoubleExitStatus` from BOTH origins, the second of which is
 * the exit the first arrival already produced on the target.
 *
 * WHAT THIS ASSERTS. Three properties, each on its own assertion so a failure says which:
 *
 *  1. STATUS — the converged `matchUpStatus` and `winningSide`, across every structure the pair
 *     touches. This is what a tournament director sees.
 *  2. PER-SIDE RECORD — `sideExitProvenance` and its projection `matchUpStatusCodes`, per side.
 *     Measured before the projection landed: **24 of these same 32 cells differed** on this
 *     property while passing property 1. On the consolation convergence path the native provenance
 *     was correct but SINGLE-SIDED, holding only the FIRST arrival's origin, because the second
 *     arrival (`handleEmptyExitLoser`) wrote the legacy array and no provenance at all. Which side
 *     survived was therefore a function of entry order.
 *  3. SELF-CONSISTENCY — within any one record, `matchUpStatus` must be what `previousMatchUpStatus`
 *     produces. The same site hand-built `{ matchUpStatus: <the arriving exit>,
 *     previousMatchUpStatus: <the target's CONVERGED status> }`, which in the mixed pair stored a
 *     walkover origin producing a default. That is not a fact about either side, and it is
 *     order-dependent in its own right: the other entry order stored the opposite.
 *
 * Properties 2 and 3 are gated here rather than in `doubleExitStatusParity`, which cannot see this
 * class twice over: `asWalkoverVocabulary` renames DOUBLE_DEFAULT to DOUBLE_WALKOVER and DEFAULTED
 * to WALKOVER before comparing, and its driver applies a single `exitOutcome` per run, so the
 * in-suite matrix cannot construct a mixed pair at all.
 *
 * Generated ids are excluded: each run builds a fresh tournament, so any id differs by construction.
 * An earlier version of this measurement compared `sourceMatchUpId` and reported 32 of 32 differing
 * — including uniform pairs, which cannot differ by flavour — and that impossible result is how the
 * flaw in the measurement surfaced.
 */

// provenance is keyed by sideNumber; the legacy codes array is positional. Both are rendered per
// side so a difference names the side rather than an index.
function sideRecord(matchUp: any): string {
  const codes = matchUp.matchUpStatusCodes ?? [];
  return [1, 2]
    .map((sideNumber) => {
      const entry = matchUp.sideExitProvenance?.[sideNumber];
      const code = codes[sideNumber - 1];
      const provenance = entry ? `${entry.previousMatchUpStatus}>${entry.matchUpStatus}` : '-';
      const projected =
        code && typeof code === 'object' ? `${code.previousMatchUpStatus ?? '-'}>${code.matchUpStatus ?? '-'}` : '-';
      return `s${sideNumber}(${provenance}|${projected})`;
    })
    .join(' ');
}

// an origin and what it produced are a PAIR; a record where they disagree describes no side
function inconsistentPairs(matchUp: any): string[] {
  const entries = [1, 2].flatMap((sideNumber) => {
    const provenance = matchUp.sideExitProvenance?.[sideNumber];
    const code = matchUp.matchUpStatusCodes?.[sideNumber - 1];
    return [
      ...(provenance ? [{ label: `provenance s${sideNumber}`, ...provenance }] : []),
      ...(code && typeof code === 'object' && code.previousMatchUpStatus
        ? [{ label: `code s${sideNumber}`, ...code }]
        : []),
    ];
  });

  return entries
    .filter((entry: any) => entry.matchUpStatus !== producedExitStatus(entry.previousMatchUpStatus))
    .map(
      (entry: any) =>
        `${matchUp.structureName}|r${matchUp.roundNumber}p${matchUp.roundPosition}|${entry.label}|` +
        `${entry.previousMatchUpStatus} produced ${entry.matchUpStatus}`,
    );
}

function playInOrder({ drawType, drawSize, statuses, order }: any) {
  const drawId = `order-${drawType}-${drawSize}-${statuses.join('')}-${order.join('')}`;
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize, drawType, participantsCount: drawSize }],
    nonRandom: 1,
    setState: true,
  });

  const roundOne = () =>
    tournamentEngine
      .allDrawMatchUps({ inContext: true, drawId })
      .matchUps.filter((matchUp: any) => matchUp.roundNumber === 1 && matchUp.stage === 'MAIN')
      .sort((a: any, b: any) => a.roundPosition - b.roundPosition);

  for (const index of order) {
    const target = roundOne().find((matchUp: any) => matchUp.roundPosition === index + 1);
    expect(target?.matchUpId).toBeDefined();
    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: statuses[index] },
      matchUpId: target.matchUpId,
      propagateExitStatus: true,
      drawId,
    });
    expect(result.error).toBeUndefined();
  }

  const matchUps = tournamentEngine.allDrawMatchUps({ inContext: true, drawId }).matchUps;

  return {
    status: matchUps
      .filter((matchUp: any) => matchUp.matchUpStatus && matchUp.matchUpStatus !== 'TO_BE_PLAYED')
      .map(
        (matchUp: any) =>
          `${matchUp.structureName}|r${matchUp.roundNumber}p${matchUp.roundPosition}|${matchUp.matchUpStatus}|ws=${matchUp.winningSide}`,
      )
      .sort((a: string, b: string) => a.localeCompare(b)),
    perSide: matchUps
      .filter((matchUp: any) => matchUp.sideExitProvenance || matchUp.matchUpStatusCodes?.length)
      .map(
        (matchUp: any) =>
          `${matchUp.structureName}|r${matchUp.roundNumber}p${matchUp.roundPosition}|${sideRecord(matchUp)}`,
      )
      .sort((a: string, b: string) => a.localeCompare(b)),
    inconsistent: matchUps.flatMap(inconsistentPairs).sort((a: string, b: string) => a.localeCompare(b)),
  };
}

it.each([
  { drawType: SINGLE_ELIMINATION, drawSize: 8 },
  { drawType: SINGLE_ELIMINATION, drawSize: 16 },
  { drawType: FIRST_ROUND_LOSER_CONSOLATION, drawSize: 8 },
  { drawType: FIRST_ROUND_LOSER_CONSOLATION, drawSize: 16 },
  { drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8 },
  { drawType: FEED_IN_CHAMPIONSHIP, drawSize: 8 },
  { drawType: DOUBLE_ELIMINATION, drawSize: 8 },
  { drawType: COMPASS, drawSize: 8 },
])('$drawType of $drawSize records two double exits the same way in either order', ({ drawType, drawSize }) => {
  // uniform pairs and both mixed orderings; the mixed pair is where the flavour collapse matters
  for (const statuses of [
    [DOUBLE_WALKOVER, DOUBLE_WALKOVER],
    [DOUBLE_DEFAULT, DOUBLE_DEFAULT],
    [DOUBLE_WALKOVER, DOUBLE_DEFAULT],
    [DOUBLE_DEFAULT, DOUBLE_WALKOVER],
  ]) {
    const forward = playInOrder({ drawType, drawSize, statuses, order: [0, 1] });
    const reversed = playInOrder({ drawType, drawSize, statuses, order: [1, 0] });
    const cell = `${drawType}/${drawSize} ${statuses.join('+')}`;

    // the control: the pair must actually have produced propagated state, or this passes vacuously
    expect(forward.status.length, `${statuses.join('+')} produced no decided matchUps`).toBeGreaterThan(0);
    expect(reversed.status, `${cell} status depends on entry order`).toEqual(forward.status);
    expect(reversed.perSide, `${cell} per-side record depends on entry order`).toEqual(forward.perSide);
    expect(forward.inconsistent, `${cell} forward: an origin producing a status it does not`).toEqual([]);
    expect(reversed.inconsistent, `${cell} reversed: an origin producing a status it does not`).toEqual([]);
  }
});
