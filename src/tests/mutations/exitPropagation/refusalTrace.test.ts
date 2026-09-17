import { getDrawDefinition, getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { getInvariantViolations } from '@Tests/testHarness/exitPropagation/invariants';
import { prepareDraw, type Step } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, test } from 'vitest';
import fs from 'fs';

/**
 * Full-state dump around ONE step of ONE census seed. INERT unless `TRACE=1`.
 *
 *   TRACE=1 SEED=9000402 STEP=27 OUT=/tmp/trace.txt \
 *     SCHEDULES_IN=../Mentat/fixtures/exit-propagation-census/sched-w1.jsonl \
 *     npx vitest run src/tests/mutations/exitPropagation/refusalTrace.test.ts
 *
 * Writes to `OUT`, because the vitest config swallows console output. Before and after `STEP` it
 * dumps every structure's positionAssignments (`BYE*` = `byeFromPropagation`), every matchUp with its
 * sides, the harness invariants and `getDrawInconsistencies`. Optional:
 *
 * - `WATCH=Main|4|1,Backdraw|4|1,PA:Decider` — after EVERY step, those matchUps (and structures'
 *   assignments), so the step that CREATED a bad state can be found rather than the one that tripped
 *   over it. On 2026-09-17 every refusal traced was created 1–9 steps before it was reported.
 * - `INTEGRITY=1` — `getDrawInconsistencies` after every step. The census checks it only at the END,
 *   and an end-state check misses states that later steps happen to repair.
 * - `ALL_STEPS=1`, `STEP=99` — trace the whole schedule.
 * - `ALLOW_CHANGE_PROPAGATION=1` — the flag-ON arm, read by the harness as for the census.
 */

const enabled = process.env.TRACE === '1';
const wanted = Number(process.env.SEED);
const failingStep = Number(process.env.STEP);
const schedulesIn = process.env.SCHEDULES_IN as string;

const trace: string[] = [];
const out = (...parts: any[]) => trace.push(parts.join(' '));

const assignmentLabel = (a: any, short: (pid?: string) => string | undefined) => {
  if (a.bye) return a.byeFromPropagation ? 'BYE*' : 'BYE';
  return short(a.participantId);
};

const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;

function dump(drawId: string, label: string, pids: Map<string, string>) {
  const short = (pid?: string) => {
    if (!pid) return '-';
    if (!pids.has(pid)) pids.set(pid, `P${pids.size + 1}`);
    return pids.get(pid);
  };
  const drawDefinition = getDrawDefinition(drawId);
  const lines: string[] = [`===== ${label}`];
  const names = new Map(drawDefinition.structures.map((s: any) => [s.structureId, s.structureName]));
  for (const link of drawDefinition.links ?? []) {
    lines.push(
      `link ${link.linkType} ${names.get(link.source.structureId)} r${link.source.roundNumber} -> ${names.get(link.target.structureId)} r${link.target.roundNumber} ${link.target.feedProfile} ${link.linkCondition ?? ''}`,
    );
  }
  for (const structure of drawDefinition.structures) {
    const pa = (structure.positionAssignments ?? [])
      .map((a: any) => `${a.drawPosition}:${assignmentLabel(a, short)}${a.qualifier ? 'Q' : ''}`)
      .join(' ');
    lines.push(`-- ${structure.structureName} PA ${pa}`);
  }
  for (const m of getDrawMatchUps(drawId).sort((a: any, b: any) => (key(a) < key(b) ? -1 : 1))) {
    const sides = (m.sides ?? [])
      .map((s: any) => `${s.sideNumber}:${s.drawPosition ?? '_'}=${s.bye ? 'BYE' : short(s.participantId)}`)
      .join(' ');
    lines.push(
      `${key(m).padEnd(16)} ${String(m.matchUpStatus).padEnd(15)} ws=${m.winningSide ?? '-'} dp=${JSON.stringify(m.drawPositions)} ${sides} ${m.feedRound ? 'FEED' : ''} codes=${JSON.stringify(m.matchUpStatusCodes ?? [])}`,
    );
  }
  const violations = getInvariantViolations({ matchUps: getDrawMatchUps(drawId), drawDefinition });
  lines.push(`invariants: ${JSON.stringify(violations)}`);
  const inconsistencies: any = getDrawInconsistencies({ drawDefinition, drawId });
  lines.push(`inconsistencies: ${JSON.stringify(inconsistencies?.issues ?? inconsistencies)}`);
  out(lines.join('\n'));
}

test.skipIf(!enabled)('trace one failing step', () => {
  const scenario = fs
    .readFileSync(schedulesIn, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .find((row: any) => row.seed === wanted);
  expect(scenario).toBeTruthy();

  setSubscriptions({});
  const drawId = `trace-${wanted}`;
  prepareDraw(scenario.config, drawId);
  const pids = new Map<string, string>();
  out('config', JSON.stringify(scenario.config));

  let stepNumber = 0;
  for (const step of scenario.steps as Step[]) {
    stepNumber++;
    const target = getDrawMatchUps(drawId).find((m: any) => key(m) === key(step));
    if (stepNumber >= failingStep - 3 || process.env.ALL_STEPS) {
      out(`step ${stepNumber} ${key(step)} ${JSON.stringify(step.outcome)} target=${!!target}`);
    }
    if (stepNumber === failingStep) dump(drawId, `BEFORE step ${stepNumber}`, pids);
    if (!target) continue;
    const observation = observeMutation({
      propagateExitStatus: scenario.config.propagateExitStatus,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    if (process.env.INTEGRITY) {
      const inc: any = getDrawInconsistencies({ drawDefinition: getDrawDefinition(drawId), drawId });
      const issues = (inc?.inconsistencies ?? []).map((i: any) => i.issueType);
      if (issues.length) out(`  INTEGRITY after step ${stepNumber}: ${issues.join(',')}`);
    }
    const watch = (process.env.WATCH ?? '').split(',').filter(Boolean);
    if (watch.length) {
      out(
        `  step ${stepNumber} ${key(step)} ${JSON.stringify(step.outcome)} -> ${JSON.stringify(observation.error ?? 'ok')}`,
      );
      for (const st of getDrawDefinition(drawId).structures.filter((x: any) =>
        watch.includes(`PA:${x.structureName}`),
      )) {
        const assignments = (st.positionAssignments ?? [])
          .map((a: any) => a.drawPosition + ':' + (a.bye ? 'BYE' : (a.participantId?.slice(0, 4) ?? '-')))
          .join(' ');
        out(`     PA ${st.structureName}: ${assignments}`);
      }
      for (const m of getDrawMatchUps(drawId).filter((m: any) => watch.includes(key(m)))) {
        out(
          `     ${key(m).padEnd(16)} ${String(m.matchUpStatus).padEnd(15)} ws=${m.winningSide ?? '-'} dp=${JSON.stringify(m.drawPositions)} codes=${JSON.stringify(m.matchUpStatusCodes ?? [])}`,
        );
      }
    }
    if (stepNumber === failingStep) {
      out('RESULT', JSON.stringify(observation.error ?? observation.thrown ?? 'ok'), observation.result?.stack);
      dump(drawId, `AFTER step ${stepNumber}`, pids);
      break;
    }
  }
  fs.writeFileSync(process.env.OUT ?? '/tmp/trace.txt', trace.join('\n') + '\n');
});
