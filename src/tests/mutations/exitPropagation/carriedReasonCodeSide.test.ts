import { PRODUCED_EXIT_POLICY } from '@Tests/testHarness/exitPropagation/producedExitPolicy';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { ABANDONED, CANCELLED, DEFAULTED, DOUBLE_WALKOVER, INCOMPLETE } from '@Constants/matchUpStatusConstants';

/**
 * A SCORING REASON CODE BELONGS TO A SIDE, and it must reach the carried exit whichever side exited.
 *
 * CA asked what the mechanism is for a client to tell which reason code goes with which side once the
 * exit tenant has left `matchUpStatusCodes` — *"for instance when a participant's WALKOVER progresses with
 * them through a connected structure"*. This is that question as a test.
 *
 * ## The defect it was written against
 *
 * `progressExitStatus` read the source's reason as `sourceMatchUpStatusCodes?.[0]` — INDEX 0, not the
 * exiting side. Measured 2026-09-28, the same scenario twice with the reason recorded against whichever
 * side actually exited:
 *
 * | | source | consolation | reason carried |
 * |---|---|---|---|
 * | side 1 exits, reason at index 0 | `['DM']` ws=2 | `['WO','DM']` | yes |
 * | side 2 exits, reason at index 1 | `['','DM']` ws=1 | `['WO','']` | **NO** |
 *
 * `sideExitProvenance` was byte-identical across both runs — the engine knew which side had exited and
 * from where; only the reason failed to travel. So this is not a provenance gap, it is an index-0 read.
 *
 * ## Why both surfaces are asserted, separately
 *
 * The reason now lives on the provenance entry as `matchUpStatusCode`, side-keyed, and is projected back
 * into the positional array by `deriveStatusCodes` for the display contract. Asserting only the array would
 * pass on a projection built from the wrong side; asserting only provenance would pass while the surface
 * clients actually render stayed empty. Each side of the pair can regress alone, so each is pinned alone.
 */

const CASES = [
  { label: 'side 1 exits — reason recorded at index 0', winningSide: 2, codes: ['DM'], exitingSide: 1 },
  { label: 'side 2 exits — reason recorded at index 1', winningSide: 1, codes: ['', 'DM'], exitingSide: 2 },
] as const;

it.each(CASES)('carries the reason code when $label', ({ winningSide, codes }) => {
  const drawId = `reason-side-${winningSide}`;
  mocksEngine.generateTournamentRecord({
    policyDefinitions: PRODUCED_EXIT_POLICY,
    drawProfiles: [{ drawId, drawSize: 32, drawType: FIRST_MATCH_LOSER_CONSOLATION, idPrefix: 'matchUp' }],
    setState: true,
  });

  // an upstream double walkover already occupies one side of the consolation matchUp
  let result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER, matchUpStatusCodes: ['WOWO', 'WOWO'] },
    matchUpId: 'matchUp-1-1',
    drawId,
  });
  expect(result.success).toEqual(true);

  // the exit under test: a DEFAULTED whose reason is recorded against the side that actually exited
  result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DEFAULTED, winningSide, matchUpStatusCodes: [...codes] },
    propagateExitStatus: true,
    matchUpId: 'matchUp-1-2',
    drawId,
  });
  expect(result.success).toEqual(true);

  const matchUps: any[] = tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
  const source = matchUps.find((matchUp: any) => matchUp.matchUpId === 'matchUp-1-2');
  const consolation = matchUps.find((matchUp: any) => matchUp.matchUpId === source?.loserMatchUpId);

  // CONTROL: the arrangement under test actually happened — the source recorded the reason where the
  // case says, and the consolation is the convergence rather than an untouched matchUp.
  expect(source?.matchUpStatusCodes, 'source keeps the reason as submitted').toEqual([...codes]);
  expect(consolation?.matchUpStatus).toEqual(DOUBLE_WALKOVER);

  // CONTROL: the SOURCE recorded its own reason side-keyed, from a positionally-submitted array. Without
  // this the carry could pass by reading the array and the keyed field could be empty everywhere.
  expect(source?.sideStatusCodes, 'the source keys its own reason by side').toEqual({ [3 - winningSide]: 'DM' });

  // 1. THE SIDE-KEYED SURFACE. Whichever side arrived carrying the exit holds the reason, and a client
  //    reads it by that side's key rather than by an array index.
  const arrivingSide = Object.entries(consolation?.sideExitProvenance ?? {}).find(
    ([, entry]: any) => entry?.sourceMatchUpId === 'matchUp-1-2',
  );
  expect(arrivingSide, 'the arriving exit is attributed to a side').toBeDefined();
  const [arrivingSideNumber]: any = arrivingSide as any;
  expect(consolation?.sideStatusCodes?.[Number(arrivingSideNumber)], 'the reason rides with the side').toEqual('DM');

  // 2. THE DISPLAY CONTRACT. The positional array still carries it, at that same side's index.
  expect(consolation?.matchUpStatusCodes?.[Number(arrivingSideNumber) - 1]).toEqual('DM');
});

/**
 * A MATCH-LEVEL REASON ATTRIBUTES TO NOBODY, and must not be filed against a side.
 *
 * `ABANDONED` / `CANCELLED` / `INCOMPLETE` are `nonDirectingMatchUpStatuses` — nobody won, so nobody is
 * attributed. The positional array could only park such a code at index 0, where the index means side 1,
 * so a reader could not tell "the match was abandoned" from "side 1 did something". These now have their
 * own home and the side-keyed field stays empty.
 */
it.each([
  { status: ABANDONED, code: 'OA' },
  { status: CANCELLED, code: 'OC' },
  { status: INCOMPLETE, code: 'OI' },
])('files a $status reason against the MATCH, not a side', ({ status, code }) => {
  const drawId = `match-level-${code}`;
  mocksEngine.generateTournamentRecord({
    policyDefinitions: PRODUCED_EXIT_POLICY,
    drawProfiles: [{ drawId, drawSize: 8, idPrefix: 'mL' }],
    setState: true,
  });
  const target: any = tournamentEngine
    .allDrawMatchUps({ drawId, inContext: true })
    .matchUps?.find((matchUp: any) => matchUp.roundNumber === 1 && matchUp.roundPosition === 1);

  const result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: status, matchUpStatusCodes: [code] },
    matchUpId: target.matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const scored: any = tournamentEngine
    .allDrawMatchUps({ drawId, inContext: true })
    .matchUps?.find((matchUp: any) => matchUp.matchUpId === target.matchUpId);

  expect(scored.matchUpStatus, 'the arrangement under test happened').toEqual(status);
  expect(scored.matchUpStatusCode, 'the reason belongs to the match').toEqual(code);
  expect(scored.sideStatusCodes, 'and to no side').toBeUndefined();
});
