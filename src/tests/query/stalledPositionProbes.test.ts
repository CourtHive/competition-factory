import { nextPlayable, playForward, step } from '@Tests/testHarness/exitPropagation/driver';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { DOUBLE_WALKOVER, DEFAULTED } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * Three targeted probes behind the `STALLED_POSITION` adjudication. All INERT unless
 * `STALLED_PROBES=1`. They print rather than assert: each one is the reproduction for a claim made
 * in the adjudication, kept so the claim can be re-measured rather than re-argued.
 *
 *   STALLED_PROBES=1 TZ=UTC npx vitest run src/tests/query/stalledPositionProbes.test.ts
 *
 * The bulk instrument is `stalledPositionAdjudication.test.ts`; this file holds the three cases
 * that carry the argument.
 */

const enabled = process.env.STALLED_PROBES === '1';

const occupantsOf = (matchUp: any) => (matchUp?.sides ?? []).filter((s: any) => s?.participantId && !s?.bye);

const playableCount = (drawId: string) =>
  tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId })
    .matchUps.filter(
      (m: any) =>
        !m.winningSide && (!m.matchUpStatus || m.matchUpStatus === 'TO_BE_PLAYED') && occupantsOf(m).length === 2,
    ).length;

const generate = (drawId: string, drawSize: number, participantsCount: number, nonRandom: number) => {
  setSubscriptions({});
  const { drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawType: DOUBLE_ELIMINATION, drawSize, participantsCount }],
    nonRandom,
    setState: true,
  });
  expect(drawIds).toContain(drawId);
};

/**
 * PROBE 1 — the DOUBLE_ELIMINATION Decider is NOT a legitimately-unplayed matchUp.
 *
 * The handoff records it as a known-good `STALLED_POSITION` false positive, reasoning that the
 * Decider goes unplayed when the main-bracket winner wins both brackets. Measured on the same draw,
 * that is not what this implementation does: with no exits the Decider COMPLETES with two
 * occupants, under an all-side-1 schedule AND under its opposite. An all-side-1 schedule alone
 * would be a biased fixture — if the Decider were conditional on WHICH finalist wins, it would sit
 * in one branch every time and its silence would prove nothing.
 */
test.skipIf(!enabled)('probe 1 — DE Decider completes in normal play, both win schedules', () => {
  const report = (drawId: string, labelText: string) => {
    const decider = getDrawDefinition(drawId).structures?.find((s: any) => s.structureName === 'Decider');
    const { matchUps } = tournamentEngine.allDrawMatchUps({ inContext: true, drawId });
    const deciderMatchUps = matchUps.filter((m: any) => m.structureId === decider?.structureId);
    process.stdout.write(
      `\n${labelText}\n` +
        deciderMatchUps
          .map(
            (m: any) =>
              `  Decider ${m.roundNumber}|${m.roundPosition} status=${m.matchUpStatus} ` +
              `ws=${m.winningSide ?? '-'} occupants=${occupantsOf(m).length}`,
          )
          .join('\n') +
        '\n',
    );
    return deciderMatchUps;
  };

  generate('probe-decider-side1', 16, 16, 97);
  playForward({ propagateExitStatus: false, exitOutcome: undefined, drawId: 'probe-decider-side1' });
  report('probe-decider-side1', 'CONTROL A — no exits, side 1 always wins');

  // exitPeriod 1 makes the driver use this outcome on every step
  generate('probe-decider-side2', 16, 16, 97);
  playForward({
    propagateExitStatus: false,
    exitOutcome: { winningSide: 2 },
    exitPeriod: 1,
    drawId: 'probe-decider-side2',
  });
  report('probe-decider-side2', 'CONTROL B — no exits, side 2 always wins');

  generate('probe-decider-cascade', 16, 16, 97);
  const cascadeOutcome = { matchUpStatus: DOUBLE_WALKOVER };
  const first = nextPlayable('probe-decider-cascade');
  step({
    propagateExitStatus: false,
    matchUpId: first.matchUpId,
    drawId: 'probe-decider-cascade',
    outcome: cascadeOutcome,
  });
  playForward({ propagateExitStatus: false, exitOutcome: cascadeOutcome, drawId: 'probe-decider-cascade' });
  const cascade = report('probe-decider-cascade', 'CASCADE — DOUBLE_WALKOVER schedule');

  expect(cascade.length).toBeGreaterThan(0);
});

/**
 * PROBE 2 — the stall chain, on the smallest failing cell.
 *
 * `DOUBLE_ELIMINATION 8/7`, matrix seed 78. One `DOUBLE_WALKOVER` schedule strands TWO real
 * participants, and they are one cause rather than two findings: `Backdraw|3|1` never receives the
 * loser a double exit does not produce, so the Backdraw final cannot be played, so `Main|4|1` never
 * receives the Backdraw winner.
 */
test.skipIf(!enabled)('probe 2 — the stall chain on DOUBLE_ELIMINATION 8/7 seed 78', () => {
  const drawId = 'probe-stall-chain';
  generate(drawId, 8, 7, 78);

  const outcome = { matchUpStatus: DOUBLE_WALKOVER };
  const target = nextPlayable(drawId);
  step({ propagateExitStatus: false, matchUpId: target.matchUpId, drawId, outcome });
  playForward({ propagateExitStatus: false, exitOutcome: outcome, drawId });

  const { matchUps } = tournamentEngine.allDrawMatchUps({ inContext: true, drawId });
  const ordered = [...matchUps].sort(
    (a: any, b: any) =>
      String(a.structureName).localeCompare(String(b.structureName)) ||
      (a.roundNumber ?? 0) - (b.roundNumber ?? 0) ||
      (a.roundPosition ?? 0) - (b.roundPosition ?? 0),
  );

  process.stdout.write('\n--- terminal state ---\n');
  for (const m of ordered as any[]) {
    const occ = occupantsOf(m).map((s: any) => `s${s.sideNumber}@dp${s.drawPosition}`);
    const byes = (m.sides ?? []).filter((s: any) => s?.bye).length;
    process.stdout.write(
      `${String(m.structureName).padEnd(9)} ${m.roundNumber}|${m.roundPosition}  ` +
        `${String(m.matchUpStatus).padEnd(15)} ws=${m.winningSide ?? '-'}  ` +
        `dps=${JSON.stringify(m.drawPositions)} byes=${byes} occ=[${occ.join(' ')}]\n`,
    );
  }

  const integrity: any = tournamentEngine.getDrawInconsistencies({ drawId, drawDefinition: getDrawDefinition(drawId) });
  process.stdout.write(
    `\nplayable=${playableCount(drawId)} valid=${integrity?.valid} ` +
      `inconsistencies=${(integrity?.inconsistencies ?? []).length}\n`,
  );

  expect(matchUps.length).toBeGreaterThan(0);
});

/**
 * PROBE 3 — the one TRANSIENT stall, and the reason the single `crossStructureWinnerPositions`
 * failure is a different class from the other 93.
 *
 * That test asserts integrity after EVERY step, not at the end. Census 9100555 stalls at step 5 and
 * step 6 re-scores the matchUp that stalled it, so the finding clears. `STALLED_POSITION` is
 * therefore reporting a draw that genuinely cannot progress **by play** while a director is midway
 * through a correction — which is a question about what the rule should mean, not a defect in the
 * measurement.
 */
test.skipIf(!enabled)('probe 3 — census 9100555, a stall that a later correction clears', () => {
  const drawId = 'probe-correction-window';
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: DOUBLE_ELIMINATION, drawSize: 8, participantsCount: 6, drawId }],
    nonRandom: 9100555,
    setState: true,
  });

  const submissions: [string, number, number, any][] = [
    ['Main', 1, 2, { winningSide: 2 }],
    ['Main', 2, 2, { matchUpStatus: 'DOUBLE_DEFAULT' }],
    ['Main', 2, 1, { matchUpStatus: DEFAULTED, winningSide: 1 }],
    ['Backdraw', 3, 1, { matchUpStatus: DOUBLE_WALKOVER }],
    ['Main', 1, 3, { matchUpStatus: 'WALKOVER', winningSide: 2 }],
    ['Backdraw', 3, 1, { winningSide: 1 }],
  ];

  process.stdout.write('\n');
  for (const [index, [structureName, roundNumber, roundPosition, outcome]] of submissions.entries()) {
    const { matchUps } = tournamentEngine.allDrawMatchUps({ inContext: true, drawId });
    const matchUp: any = matchUps.find(
      (m: any) =>
        m.structureName === structureName && m.roundNumber === roundNumber && m.roundPosition === roundPosition,
    );
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      propagateExitStatus: true,
      outcome,
      drawId,
    });
    const integrity: any = tournamentEngine.getDrawInconsistencies({
      drawDefinition: getDrawDefinition(drawId),
      drawId,
    });
    const issues = (integrity?.inconsistencies ?? []).map((i: any) => `${i.issueType}(side ${i.sideNumber})`);
    const errorNote = result?.error ? ` ERROR=${result.error.code}` : '';
    process.stdout.write(
      `step ${index + 1} ${structureName}|${roundNumber}|${roundPosition}${errorNote}` +
        `  playable=${playableCount(drawId)}  issues=[${issues.join(', ')}]\n`,
    );
  }

  expect(submissions.length).toBe(6);
});
