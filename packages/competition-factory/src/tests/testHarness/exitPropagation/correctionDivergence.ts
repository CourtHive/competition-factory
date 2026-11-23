import type { FieldDivergence, FieldName, FieldProjection } from '@Tests/testHarness/exitPropagation/fieldProjections';
import { projectFields, diffFields, exercised } from '@Tests/testHarness/exitPropagation/fieldProjections';
import { nextPlayable } from '@Tests/testHarness/exitPropagation/driver';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { isAnyExit } from '@Validators/isExit';

import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

/**
 * An intermediate result that is later CORRECTED must leave no trace.
 *
 * This is CA's re-score invariant generalised past a single matchUp: *how you got here must not
 * change where you are*. Score a double exit, score a second one, then correct the first — and the
 * draw must be indistinguishable from one that reached the same two final outcomes directly,
 * without the intermediate state ever existing.
 *
 * ## Why a harness rather than a seed
 *
 * The double-exit unwind defect (2026-09-19) was shrunk onto a single seed, `nonRandom: 9000230`.
 * Six fix attempts were made against it. On 2026-09-21 that seed was found to reach identical states
 * on both paths — fixed by unrelated work — **while the class was still alive on other draws**. A
 * single seed cannot tell you that; a sweep can. Trap #3 of
 * `Mentat/planning/DOUBLE_EXIT_UNWIND_REDERIVE_SESSION_PROMPT.md` warned about exactly this, and
 * then it happened.
 *
 * ## What the signature deliberately excludes
 *
 * `matchUpId` and `sourceMatchUpId` are regenerated per run and differ between two builds of the
 * SAME config — measured. Keying on them reports every comparison as divergent. Everything is
 * therefore addressed by COORDINATE (`structureName|roundNumber|roundPosition`), and provenance is
 * compared by which side carries what transition, never by which matchUp produced it.
 */

export type DivergenceConfig = {
  participantsCount: number;
  /** undefined leaves the engine's own default in force, which is ON */
  doubleExitPropagateBye?: boolean;
  propagateExitStatus?: boolean;
  drawType: string;
  drawSize: number;
  seed: number;
};

export type Step = {
  structureName: string;
  roundNumber: number;
  roundPosition: number;
  outcome: any;
};

export type Divergence = {
  /** `structureName|roundNumber|roundPosition` */
  coordinate: string;
  direct: string;
  corrected: string;
};

export type PathResult = {
  signature: Map<string, string>;
  /** steps the engine declined, with the code it declined them under */
  refusals: { coordinate: string; code?: string }[];
  /** the fields the signature cannot see (G14) — entries, seedAssignments, extensions, lineUp */
  fields: FieldProjection;
};

const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

/**
 * Everything a correction could plausibly damage, per matchUp, and nothing that varies per run.
 *
 * `drawPositions` is included because a hole is load-bearing and a lost advancement is invisible in
 * `matchUpStatus` alone — the 2026-09-21 clear/BYE defect was exactly that shape. Provenance is
 * rendered as `side:previous->produced` so a STALE entry (the unwind's signature residue) shows up
 * as a difference rather than hiding inside an object comparison.
 */
/**
 * Render `drawPositions` with TRAILING holes dropped — and leading and interior holes KEPT.
 *
 * A hole is load-bearing only BESIDE a survivor: `[undefined, 5]` puts 5 on side 2 and `[5]` puts it
 * on side 1, so collapsing a LEADING hole would hide a side-derivation defect, which is the class
 * this harness exists to catch. A TRAILING hole holds no side open — the survivors keep their
 * indices either way — and `draw-positions.md` §5 says that spelling is not information.
 *
 * Measured before changing it: of 108 divergent coordinates across the 56 severe cells, **8 were
 * trailing-hole spellings alone** (`dp=4._` vs `dp=4`, FIRST_MATCH_LOSER_CONSOLATION 8/8
 * `Consolation|3|1`, all four flavour/flag combinations) and were the ONLY divergence in their
 * cells. The harness was reporting a representation difference as a defect, and the seventh unwind
 * attempt scored itself against that number — taking the sweep from 56 to 48 while breaking five
 * test files. It was paying product code for a measurement artifact.
 *
 * `drawPositionsRepresentationIndependence.test.ts` already pins the equivalence this relies on.
 *
 * ## A LONE position is rendered without its holes, wherever they sit — 2026-09-29
 *
 * The paragraph above says a LEADING hole is load-bearing — that `[undefined, 5]` puts 5 on side 2
 * and `[5]` puts it on side 1. For a lone position that is not so, and it was measured rather than
 * argued: `Consolation|3|1` of MODIFIED_FEED_IN_CHAMPIONSHIP and FIRST_MATCH_LOSER_CONSOLATION 8/5 is
 * stored `[2, null]` by generation and `[null, 2]` after a corrected double exit, and in context
 * BOTH resolve position 2 to SIDE 2, play out to the same results, and pass `getDrawInconsistencies`.
 * The side of a lone position comes from the round profile, not from its index — which is
 * `draw-positions.md`'s own rule, *a hole is not a drawPosition; never branch on array shape*.
 *
 * So a hole is rendered only BETWEEN or BEFORE two held positions, where the order is the sides.
 * Reporting the lone spelling as a divergence cost this sweep eight `severe` cells that were the same
 * draw, the same way the trailing hole once cost it eight.
 *
 * ## A BYE's drawPosition is rendered `BYE`, not as its number — CA, 2026-09-29
 *
 * When two BYEs meet, a BYE advances, and WHICH of the two seats it is depends on the order they
 * were placed in. That is not information. Both seats hold nobody and render identically; the draw
 * generator itself has no convention (measured over 2,106 generated BYE-meets-BYE matchUps: the
 * lower seat advanced 1,144 times, the higher 962); and the moment a participant takes either seat
 * the engine re-derives the advancement from who is there, so the earlier choice cannot outlive the
 * state in which nobody could observe it. Measured on SINGLE_ELIMINATION 8/3: a participant replacing
 * the BYE that had NOT advanced and one replacing the BYE that HAD both end with their own position
 * downstream, and participant -> BYE -> the same participant returns the draw byte-identical.
 *
 * A canonical seat was the alternative and was declined: it would have to be enforced and then
 * overridden every time a participant replaced a BYE, a second rule on top of one that works.
 *
 * WHERE the BYE sits is still rendered — `BYE.3` and `3.BYE` are different sides, and that IS
 * information — and so is every position that holds, or is waiting for, somebody.
 */
function renderDrawPositions(drawPositions: any[] | undefined, byePositions: Set<number> = new Set()): string {
  const rendered = (drawPositions ?? []).map((drawPosition: any) => {
    if (byePositions.has(drawPosition)) return 'BYE';
    return drawPosition ?? '_';
  });
  // A LONE position carries no side in its index — see the docblock above. Its holes are dropped
  // wherever they sit; two positions keep theirs, because there the order IS the sides.
  const held = rendered.filter((position) => position !== '_');
  if (held.length < 2) return held.join('.');
  while (rendered.length && rendered[rendered.length - 1] === '_') rendered.pop();
  return rendered.join('.');
}

function matchUpSignature(matchUp: any): string {
  const provenance = Object.entries(matchUp.sideExitProvenance ?? {})
    .map(
      ([sideNumber, entry]: [string, any]) => `${sideNumber}:${entry?.previousMatchUpStatus}->${entry?.matchUpStatus}`,
    )
    .sort((a, b) => a.localeCompare(b))
    .join(',');
  const byePositions = new Set<number>(
    (matchUp.sides ?? []).filter((side: any) => side?.bye && side?.drawPosition).map((side: any) => side.drawPosition),
  );
  const positions = renderDrawPositions(matchUp.drawPositions, byePositions);
  return [
    matchUp.matchUpStatus ?? '-',
    `ws=${matchUp.winningSide ?? '-'}`,
    `dp=${positions || '-'}`,
    `prov=${provenance || '-'}`,
  ].join(' ');
}

/** Build the draw, apply the steps, and return the coordinate-keyed signature. */
export function runPath(
  config: DivergenceConfig,
  steps: Step[],
  drawId: string,
  /** FALSIFICATION ONLY: a write applied after the steps, before the path is read */
  plant?: (drawId: string) => void,
): PathResult {
  const { drawType, drawSize, participantsCount, seed, propagateExitStatus = true, doubleExitPropagateBye } = config;
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType, drawSize, participantsCount, drawId }],
    policyDefinitions: {
      [POLICY_TYPE_PROGRESSION]: {
        ...(doubleExitPropagateBye === undefined ? {} : { doubleExitPropagateBye }),
        propagateExitStatus,
      },
    },
    nonRandom: seed,
  });
  tournamentEngine.setState(tournamentRecord);

  const allMatchUps = () => tournamentEngine.allTournamentMatchUps().matchUps ?? [];
  const refusals: PathResult['refusals'] = [];

  for (const step of steps) {
    const target = allMatchUps().find(
      (matchUp: any) =>
        matchUp.structureName === step.structureName &&
        matchUp.roundNumber === step.roundNumber &&
        matchUp.roundPosition === step.roundPosition,
    );
    // a coordinate that does not exist in this draw is a CONFIG error, not a divergence — say so
    // loudly rather than silently comparing two draws that never ran the same steps
    if (!target) {
      refusals.push({
        coordinate: `${step.structureName}|${step.roundNumber}|${step.roundPosition}`,
        code: 'NO_SUCH_MATCHUP',
      });
      continue;
    }
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: target.matchUpId,
      drawId,
      outcome: step.outcome,
    });
    if (!result?.success) refusals.push({ coordinate: coordinate(target), code: result?.error?.code });
  }

  plant?.(drawId);
  const signature = new Map<string, string>();
  for (const matchUp of allMatchUps()) signature.set(coordinate(matchUp), matchUpSignature(matchUp));
  return { signature, refusals, fields: projectFields(drawId) };
}

/**
 * Compare a DIRECT sequence against one that reaches the same outcomes through a correction.
 *
 * A difference in REFUSALS is reported as its own divergence rather than ignored: if one path is
 * declined and the other is not, the two draws did not run the same experiment, and comparing their
 * signatures would manufacture a verdict. That is trap #1 of the unwind prompt — *"a play-out that
 * stalls manufactures false verdicts"*.
 */
export function compareCorrection({
  config,
  direct,
  corrected,
  plant,
}: {
  config: DivergenceConfig;
  direct: Step[];
  corrected: Step[];
  /** FALSIFICATION ONLY: a write applied to one path after its steps */
  plant?: { path: 'direct' | 'corrected'; apply: (drawId: string) => void };
}): {
  divergences: Divergence[];
  /** differences in the fields the signature cannot see, reported apart so a ratchet can hold them */
  fieldDivergences: FieldDivergence[];
  /** which fields the direct path populated at all: a field that is never populated compares as zero */
  exercisedFields: Record<FieldName, boolean>;
  refusalMismatch?: string;
  directRefusals: string;
  correctedRefusals: string;
} {
  const a = runPath(config, direct, 'divergence-direct', plant?.path === 'direct' ? plant.apply : undefined);
  const b = runPath(config, corrected, 'divergence-corrected', plant?.path === 'corrected' ? plant.apply : undefined);

  const renderRefusals = (result: PathResult) =>
    result.refusals.map((refusal) => `${refusal.coordinate}:${refusal.code ?? 'REFUSED'}`).join(',') || 'none';
  const directRefusals = renderRefusals(a);
  const correctedRefusals = renderRefusals(b);

  const divergences: Divergence[] = [];
  for (const [key, value] of a.signature) {
    const other = b.signature.get(key);
    if (other !== value) divergences.push({ coordinate: key, direct: value, corrected: other ?? 'ABSENT' });
  }
  for (const key of b.signature.keys()) {
    if (!a.signature.has(key)) {
      divergences.push({ coordinate: key, direct: 'ABSENT', corrected: b.signature.get(key) as string });
    }
  }
  divergences.sort((x, y) => x.coordinate.localeCompare(y.coordinate));

  // the refusals are returned as rendered, so a caller that needs them does not run both paths again
  return {
    fieldDivergences: diffFields(a.fields, b.fields),
    exercisedFields: exercised(a.fields),
    divergences,
    directRefusals,
    correctedRefusals,
    ...(directRefusals !== correctedRefusals
      ? { refusalMismatch: `direct[${directRefusals}] corrected[${correctedRefusals}]` }
      : {}),
  };
}

/**
 * Which structure holds round 1 in this draw type?
 *
 * Hardcoding `'Main'` is wrong for COMPASS and OLYMPIC, whose first round is `East`. The harness
 * caught it rather than comparing two draws that had silently run no steps at all — 240
 * `NO_SUCH_MATCHUP` refusals across 48 cells — which is the whole reason refusals are compared
 * instead of ignored.
 */
export function resolveFirstRoundStructure(config: DivergenceConfig): string | undefined {
  const { signature } = runPath(config, [], 'divergence-probe');
  const roundOne = [...signature.keys()]
    .map((key) => key.split('|'))
    .filter(([, roundNumber]) => roundNumber === '1')
    .map(([structureName]) => structureName);
  // the structure holding the MOST round-1 matchUps is the draw's entry point; a consolation or
  // backdraw also has a "round 1" but holds fewer of them
  const counts = new Map<string, number>();
  for (const name of roundOne) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
}

/**
 * The standard shape: two first-round matchUps, one of which is scored as a double exit and then
 * CORRECTED to a single exit with a winner.
 *
 * `first` ends as the single exit; `second` stays the double exit. The direct path never makes
 * `first` a double exit at all.
 */
export function correctionScenario({
  doubleExitStatus,
  singleExitStatus,
  structureName = 'Main',
  first = 2,
  second = 1,
}: {
  doubleExitStatus: string;
  singleExitStatus: string;
  structureName?: string;
  first?: number;
  second?: number;
}): { direct: Step[]; corrected: Step[] } {
  const at = (roundPosition: number, outcome: any): Step => ({
    structureName,
    roundNumber: 1,
    roundPosition,
    outcome,
  });
  const asDouble = { matchUpStatus: doubleExitStatus };
  const asSingle = { matchUpStatus: singleExitStatus, winningSide: 1 };
  return {
    direct: [at(second, asDouble), at(first, asSingle)],
    corrected: [at(first, asDouble), at(second, asDouble), at(first, asSingle)],
  };
}

/**
 * A correction taken DEEP in a draw, with play before it and unrelated play after it.
 *
 * `correctionScenario` above corrects one of two ADJACENT FIRST-ROUND matchUps, before anything else
 * has been played. That is the shape every divergence of September 2026 was found in, and it is
 * also the only shape the oracle had — a correction in round 3, in a consolation structure, or with
 * a dozen unrelated results entered between the mistake and its correction, was never compared
 * against the direct path (coverage assessment gap G6, 2026-09-30).
 *
 * This plays the matrix's own schedule forward — the first playable matchUp each step, the cell's
 * exit on every third — for `prefixLength` steps, takes the LAST exit entered as the mistake, and
 * corrects it to `alternative` at the end. The direct path enters `alternative` at that step. Steps
 * after the mistake that lie in its CONE — the matchUps it feeds, all the way down — are dropped
 * from both paths, because they legitimately depend on which outcome was entered; every other later
 * step stays, which is what makes the correction deep rather than last.
 *
 * The prefix is generated with the SAME `generateTournamentRecord` call `runPath` makes, under the
 * same policy, so that the replay walks the same draw. Generating it any other way (measured: with
 * `propagateExitStatus` passed per call rather than as policy) refuses steps on replay that were
 * accepted on generation, and every one of those reads as a divergence.
 */
export function deepCorrectionScenario({
  config,
  cellExit,
  alternative,
  prefixLength = 12,
}: {
  config: DivergenceConfig;
  cellExit: any;
  alternative: (outcome: any) => any;
  prefixLength?: number;
}): { direct: Step[]; corrected: Step[]; mistake: Step; intervening: number } | undefined {
  const { drawType, drawSize, participantsCount, seed, propagateExitStatus = true, doubleExitPropagateBye } = config;
  const drawId = 'deep-prefix';
  const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType, drawSize, participantsCount, drawId }],
    policyDefinitions: {
      [POLICY_TYPE_PROGRESSION]: {
        ...(doubleExitPropagateBye === undefined ? {} : { doubleExitPropagateBye }),
        propagateExitStatus,
      },
    },
    nonRandom: seed,
  });
  if (!drawIds?.includes(drawId)) return undefined;
  tournamentEngine.setState(tournamentRecord);

  const played = {
    winningSide: 1,
    score: {
      sets: [
        { side1Score: 6, side2Score: 3, winningSide: 1 },
        { side1Score: 6, side2Score: 3, winningSide: 1 },
      ],
    },
  };
  const steps: Step[] = [];
  for (let taken = 0; taken < prefixLength; taken++) {
    const target = nextPlayable(drawId);
    if (!target) break;
    const outcome = taken % 3 === 2 ? cellExit : played;
    const result: any = tournamentEngine.setMatchUpStatus({ matchUpId: target.matchUpId, drawId, outcome });
    if (!result?.success) break;
    steps.push({
      structureName: String(target.structureName),
      roundNumber: target.roundNumber,
      roundPosition: target.roundPosition,
      outcome,
    });
  }

  const isExit = (outcome: any) => isAnyExit(outcome?.matchUpStatus);
  const index = steps
    .map((step, i) => (isExit(step.outcome) ? i : -1))
    .filter((i) => i >= 0)
    .at(-1);
  if (index === undefined) return undefined;
  const mistake = steps[index];
  const other = alternative(mistake.outcome);
  if (!other) return undefined;

  // the cone: the mistake's matchUp and everything it feeds, on the draw as generated
  const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
  const stepKey = (step: Step) => `${step.structureName}|${step.roundNumber}|${step.roundPosition}`;
  const all: any[] = (tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? []) as any[];
  const byId = new Map(all.map((matchUp) => [matchUp.matchUpId, matchUp]));
  const cone = new Set<string>([stepKey(mistake)]);
  const queue = all.filter((matchUp) => key(matchUp) === stepKey(mistake));
  while (queue.length) {
    const matchUp = queue.pop();
    for (const id of [matchUp.winnerMatchUpId, matchUp.loserMatchUpId]) {
      const fed = id && byId.get(id);
      if (fed && !cone.has(key(fed))) {
        cone.add(key(fed));
        queue.push(fed);
      }
    }
  }

  const kept = steps.filter((step, i) => i <= index || !cone.has(stepKey(step)));
  const at = kept.indexOf(mistake);
  return {
    direct: kept.map((step, i) => (i === at ? { ...step, outcome: other } : step)),
    corrected: [...kept, { ...mistake, outcome: other }],
    intervening: kept.length - 1 - at,
    mistake,
  };
}
