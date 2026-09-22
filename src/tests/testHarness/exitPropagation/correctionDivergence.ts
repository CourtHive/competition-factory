import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

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
 */
function renderDrawPositions(drawPositions: any[] | undefined): string {
  const rendered = (drawPositions ?? []).map((drawPosition: any) => drawPosition ?? '_');
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
  const positions = renderDrawPositions(matchUp.drawPositions);
  return [
    matchUp.matchUpStatus ?? '-',
    `ws=${matchUp.winningSide ?? '-'}`,
    `dp=${positions || '-'}`,
    `prov=${provenance || '-'}`,
  ].join(' ');
}

/** Build the draw, apply the steps, and return the coordinate-keyed signature. */
export function runPath(config: DivergenceConfig, steps: Step[], drawId: string): PathResult {
  const { drawType, drawSize, participantsCount, seed, propagateExitStatus = true } = config;
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType, drawSize, participantsCount, drawId }],
    policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { propagateExitStatus } },
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

  const signature = new Map<string, string>();
  for (const matchUp of allMatchUps()) signature.set(coordinate(matchUp), matchUpSignature(matchUp));
  return { signature, refusals };
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
}: {
  config: DivergenceConfig;
  direct: Step[];
  corrected: Step[];
}): { divergences: Divergence[]; refusalMismatch?: string } {
  const a = runPath(config, direct, 'divergence-direct');
  const b = runPath(config, corrected, 'divergence-corrected');

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

  return {
    divergences,
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
