import { getDrawDefinition, getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { getDownstreamStructureIds } from '@Query/matchUps/getDownstreamStructureIds';
import { prepareDraw, type Step } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, test } from 'vitest';
import fs from 'fs';

/**
 * A winner flip is a RELABEL of paths. INERT unless `SWAP_PATH=1` (run with ALLOW_CHANGE_PROPAGATION=1).
 *
 * CA, 2026-09-17: every downstream outcome — within the structure and through linked structures — is
 * experienced after a flip by whoever now occupies the path, exactly as the previous occupant
 * experienced it. With A and B the flipped matchUp's two participants and σ exchanging them, every
 * OTHER matchUp decided before the flip must, after it, have winner σ(winner), loser σ(loser), the
 * same status, and the same score as seen from the winner. Every matchUp NOT downstream of it — earlier
 * rounds, and the structures the pair came from except the rounds they re-enter — must be unchanged.
 */
const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;

function outcomes(drawId: string) {
  const byId = new Map<string, any>();
  for (const m of getDrawMatchUps(drawId)) {
    if (!m.winningSide) continue;
    const winner = m.sides?.find((s: any) => s.sideNumber === m.winningSide);
    const loser = m.sides?.find((s: any) => s.sideNumber !== m.winningSide);
    byId.set(m.matchUpId, {
      structureId: m.structureId,
      roundNumber: m.roundNumber,
      key: key(m),
      winnerId: winner?.participantId,
      loserId: loser?.participantId,
      status: m.matchUpStatus,
      score: m.winningSide === 1 ? m.score?.scoreStringSide1 : m.score?.scoreStringSide2,
    });
  }
  return byId;
}

/**
 * DOWNSTREAM of a flipped matchUp: later rounds of its structure, and the structures it feeds.
 *
 * A structure the flipped pair was SENT FROM by a LOSER link is their origin: only the rounds they
 * RE-ENTER by a WINNER link are downstream there (DOUBLE_ELIMINATION's Main, reached back from the
 * Backdraw). Counting all of Main blessed a relabel of the pair's entry positions.
 */
function downstreamOf(drawId: string, target: any) {
  const drawDefinition = getDrawDefinition(drawId);
  const links = drawDefinition.links ?? [];
  const downstreamStructureIds = getDownstreamStructureIds({
    inContextDrawMatchUps: getDrawMatchUps(drawId),
    excludeStructureId: target.structureId,
    matchUpId: target.matchUpId,
    drawDefinition,
  }).structureIds;
  const originReEntryRound = (structureId: string) => {
    const isOrigin = links.some(
      (link: any) =>
        link.linkType === 'LOSER' &&
        link.source.structureId === structureId &&
        link.target.structureId === target.structureId,
    );
    if (!isOrigin) return undefined;
    const rounds = links
      .filter((link: any) => link.linkType === 'WINNER' && link.target.structureId === structureId)
      .map((link: any) => link.target.roundNumber);
    return rounds.length ? Math.min(...rounds) : Infinity;
  };
  return (m: any) => {
    if (m.structureId === target.structureId) return m.roundNumber > target.roundNumber;
    if (!downstreamStructureIds.includes(m.structureId)) return false;
    const reEntryRound = originReEntryRound(m.structureId);
    return reEntryRound === undefined || m.roundNumber >= reEntryRound;
  };
}

/** Compare every matchUp decided before a flip with its state after: relabelled downstream, unchanged elsewhere. */
function compareOutcomes({ before, after, isDownstream, target, a, b }) {
  /**
   * sigma EXCHANGES THE FLIPPED MATCHUP'S TWO PARTICIPANTS, and an ABSENT participant is not one of
   * them.
   *
   * Without the nullish guard, a flipped matchUp with an EMPTY side gives `b === undefined`, and
   * `id === b` is then true for every absent participant — so sigma maps "nobody" to `a` and
   * `expected` is manufactured out of nothing. Measured 2026-09-19 on census seed 9304686
   * (DOUBLE_ELIMINATION 8/8, `sched-de`): flipping `Main|2|1`, a `DEFAULTED` awarded to its only
   * occupied side, produced two reported violations whose `expected.loserId` came from a `was` that
   * carried no `loserId` key at all — and for `Backdraw|1|2` the before and after rows were
   * BYTE-IDENTICAL. A detector that fires on an unchanged matchUp is reporting on itself.
   *
   * This does not weaken the property; it makes sigma total. `sigma(a) === undefined` when the
   * opposite side is empty is CORRECT and still enforced: `a` no longer wins the flipped matchUp, so
   * they leave the path, and any downstream matchUp that still names them is a violation.
   */
  const sigma = (id?: string) => {
    if (id === undefined || id === null) return id;
    if (id === a) return b;
    if (id === b) return a;
    return id;
  };
  const identity = (id?: string) => id;
  let compared = 0;
  const violations: any[] = [];
  for (const [matchUpId, was] of before) {
    if (matchUpId === target.matchUpId) continue;
    compared++;
    const now = after.get(matchUpId);
    // downstream: the path's outcome passes to whoever now occupies it; elsewhere: untouched
    const downstream = isDownstream(was);
    const relabel = downstream ? sigma : identity;
    const expected = {
      winnerId: relabel(was.winnerId),
      loserId: relabel(was.loserId),
      status: was.status,
      score: was.score,
    };
    const actual = now && { winnerId: now.winnerId, loserId: now.loserId, status: now.status, score: now.score };
    if (JSON.stringify(expected) === JSON.stringify(actual)) continue;
    violations.push({
      flipped: key(target),
      matchUp: was.key,
      downstream,
      involvesSwapped: [was.winnerId, was.loserId].some((id) => id !== undefined && (id === a || id === b)),
      expected,
      actual: actual ?? 'NO LONGER DECIDED',
    });
  }
  return { compared, violations };
}

test.skipIf(process.env.SWAP_PATH !== '1')(
  'a flip relabels paths',
  () => {
    const out = process.env.OUT as string;
    fs.writeFileSync(out, '');
    const scenarios = fs
      .readFileSync(process.env.SCHEDULES_IN as string, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    let flips = 0;
    let compared = 0;
    let violations = 0;
    for (const scenario of scenarios) {
      setSubscriptions({});
      const drawId = `swap-path-${scenario.seed}`;
      prepareDraw(scenario.config, drawId);
      let stepNumber = 0;
      for (const step of (scenario.steps ?? []) as Step[]) {
        stepNumber++;
        const target = getDrawMatchUps(drawId).find((m: any) => key(m) === key(step));
        if (!target) continue;
        const ws = step.outcome?.winningSide;
        const isFlip = !!target.winningSide && !!ws && ws !== target.winningSide;
        const before = isFlip ? outcomes(drawId) : undefined;
        const isDownstream = isFlip ? downstreamOf(drawId, target) : () => false;
        const a = target.sides?.find((s: any) => s.sideNumber === target.winningSide)?.participantId;
        const b = target.sides?.find((s: any) => s.sideNumber !== target.winningSide)?.participantId;
        const observation = observeMutation({
          propagateExitStatus: scenario.config.propagateExitStatus,
          matchUpId: target.matchUpId,
          outcome: step.outcome,
          drawId,
        });
        if (!before || observation.error || observation.thrown) continue;
        flips++;
        const rows = compareOutcomes({ before, after: outcomes(drawId), isDownstream, target, a, b });
        compared += rows.compared;
        violations += rows.violations.length;
        for (const violation of rows.violations) {
          const row = { seed: scenario.seed, drawType: scenario.config.drawType, step: stepNumber, ...violation };
          fs.appendFileSync(out, JSON.stringify(row) + '\n');
        }
      }
    }
    fs.appendFileSync(out, JSON.stringify({ kind: 'SUMMARY', flips, compared, violations }) + '\n');
    expect(flips).toBeGreaterThan(0);
  },
  3600000,
);
