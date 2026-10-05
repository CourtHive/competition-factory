import { carriedExitStatus } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { isDoubleExit } from '@Validators/isExit';
import { expect, test } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';

/**
 * A CARRIED EXIT IS KEYED TO THE SIDE ITS CARRIER SITS ON, AT EVERY STEP OF EVERY FROZEN CENSUS SCHEDULE.
 *
 * INERT unless `KEY_SCAN=1`. The detector from `Mentat/planning/EXIT_CASCADE_DE_GRAND_FINAL_AND_SIDE_KEY_DESIGN.md`
 * § 2.1: after each step, a provenance entry carrying a single exit whose SOURCE's loser sits on the OTHER side of
 * the matchUp. Measured on `dev` before `setMatchUpDrawPositions` (CA, 2026-10-05: option R): 8 first occurrences
 * over the three windows, every one in a paired round of a feed-in structure. The ratchet is zero.
 *
 *   KEY_SCAN=1 TZ=UTC SCHEDULES_DIR=../Mentat/fixtures/exit-propagation-census \
 *     npx vitest run src/tests/mutations/exitPropagation/provenanceKeyNamesSeat.test.ts
 *
 * The census's own rule applies: a step whose matchUp does not hold two participants is skipped.
 */

const enabled = process.env.KEY_SCAN === '1';
const schedulesDir = process.env.SCHEDULES_DIR ?? '../Mentat/fixtures/exit-propagation-census';
const WINDOWS = ['w1', 'w2', 'de'];
const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

function staleKeys(drawId: string): string[] {
  const matchUps = tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
  const byId = new Map(matchUps.map((matchUp: any) => [matchUp.matchUpId, matchUp]));
  const stale: string[] = [];
  for (const matchUp of matchUps as any[]) {
    for (const sideNumber of [1, 2]) {
      const entry = matchUp.sideExitProvenance?.[sideNumber];
      if (!entry || !carriedExitStatus(entry) || !entry.sourceMatchUpId) continue;
      const source: any = byId.get(entry.sourceMatchUpId);
      if (!source?.winningSide || isDoubleExit(source.matchUpStatus)) continue;
      const carrier = source.sides?.find((side: any) => side.sideNumber === 3 - source.winningSide)?.participantId;
      const keyed = matchUp.sides?.find((side: any) => side.sideNumber === sideNumber)?.participantId;
      const opposite = matchUp.sides?.find((side: any) => side.sideNumber === 3 - sideNumber)?.participantId;
      if (carrier && opposite === carrier && keyed !== carrier) stale.push(`${key(matchUp)}|${sideNumber}`);
    }
  }
  return stale;
}

test.skipIf(!enabled).for(WINDOWS)(
  'window %s: no carried exit is keyed away from its carrier',
  (window) => {
    const file = path.join(schedulesDir, `sched-${window}.jsonl`);
    const scenarios = fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const found: string[] = [];
    let steps = 0;

    for (const scenario of scenarios) {
      if (!scenario.steps) continue;
      const drawId = `key-${scenario.seed}`;
      setSubscriptions({});
      prepareDraw(scenario.config, drawId);
      const seen = new Set<string>();
      for (const step of scenario.steps) {
        const target = (tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? []).find(
          (matchUp: any) => key(matchUp) === key(step),
        );
        if ((target?.sides ?? []).filter((side: any) => side?.participantId).length !== 2) continue;
        tournamentEngine.setMatchUpStatus({
          propagateExitStatus: scenario.config.propagateExitStatus,
          matchUpId: target.matchUpId,
          outcome: step.outcome,
          drawId,
        });
        steps += 1;
        for (const stale of staleKeys(drawId)) {
          if (seen.has(stale)) continue;
          seen.add(stale);
          found.push(`${window} ${scenario.seed} ${scenario.config.drawType} ${stale}`);
        }
      }
    }

    // CONTROL: the window was read and played
    expect(scenarios.length).toBeGreaterThan(500);
    expect(steps).toBeGreaterThan(5000);
    expect(found).toEqual([]);
  },
  3_600_000,
);
