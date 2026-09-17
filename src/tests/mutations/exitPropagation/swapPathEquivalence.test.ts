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
 * same status, and the same score as seen from the winner.
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
        // DOWNSTREAM only: later rounds of the flipped structure, and the structures it feeds
        const downstreamStructureIds = isFlip
          ? getDownstreamStructureIds({
              inContextDrawMatchUps: getDrawMatchUps(drawId),
              drawDefinition: getDrawDefinition(drawId),
              excludeStructureId: target.structureId,
              matchUpId: target.matchUpId,
            }).structureIds
          : [];
        const isDownstream = (m: any) =>
          m.structureId === target.structureId
            ? m.roundNumber > target.roundNumber
            : downstreamStructureIds.includes(m.structureId);
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
        const sigma = (id?: string) => {
          if (id === a) return b;
          if (id === b) return a;
          return id;
        };
        const after = outcomes(drawId);
        for (const [matchUpId, was] of before) {
          if (matchUpId === target.matchUpId || !isDownstream(was)) continue;
          compared++;
          const now = after.get(matchUpId);
          const expected = {
            winnerId: sigma(was.winnerId),
            loserId: sigma(was.loserId),
            status: was.status,
            score: was.score,
          };
          const actual = now && { winnerId: now.winnerId, loserId: now.loserId, status: now.status, score: now.score };
          if (JSON.stringify(expected) === JSON.stringify(actual)) continue;
          violations++;
          fs.appendFileSync(
            out,
            JSON.stringify({
              seed: scenario.seed,
              drawType: scenario.config.drawType,
              step: stepNumber,
              flipped: key(target),
              matchUp: was.key,
              involvesSwapped: [was.winnerId, was.loserId].some((id) => id === a || id === b),
              expected,
              actual: actual ?? 'NO LONGER DECIDED',
              drawDefinitionStructures: getDrawDefinition(drawId).structures.length,
            }) + '\n',
          );
        }
      }
    }
    fs.appendFileSync(out, JSON.stringify({ kind: 'SUMMARY', flips, compared, violations }) + '\n');
    expect(flips).toBeGreaterThan(0);
  },
  3600000,
);
