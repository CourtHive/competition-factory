import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { nextPlayable, playForward, step } from '@Tests/testHarness/exitPropagation/driver';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';
import fs from 'fs';

// constants
import { DOUBLE_WALKOVER, DOUBLE_DEFAULT, DEFAULTED, WALKOVER, RETIRED } from '@Constants/matchUpStatusConstants';
import {
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  FEED_IN_CHAMPIONSHIP,
  DOUBLE_ELIMINATION,
  SINGLE_ELIMINATION,
  CURTIS_CONSOLATION,
  COMPASS,
  OLYMPIC,
} from '@Constants/drawDefinitionConstants';

/**
 * ORACLE SCAN for `STALLED_POSITION`. INERT unless `STALLED_ORACLE=1`.
 *
 *   STALLED_ORACLE=1 ARM=exits TZ=UTC OUT=/tmp/stalled-oracle-exits.jsonl \
 *     npx vitest run src/tests/query/stalledPositionOracle.test.ts
 *
 * ## Why this exists alongside `stalledPositionAdjudication.test.ts`
 *
 * The adjudication instrument measures what the DETECTOR reports. That number can fall for two
 * opposite reasons and the detector cannot tell them apart:
 *
 *  - a seat genuinely filled — the stall is gone;
 *  - a seat that is exactly as empty as before, in a matchUp that now carries an EXIT status, so the
 *    detector's `undecided` predicate (`!winningSide && (!matchUpStatus || TO_BE_PLAYED)`) skips it.
 *
 * That second shape is measured, not hypothetical: `West|2|1` in the COMPASS 16/12 reproduction went
 * `TO_BE_PLAYED` -> `WALKOVER` with `winningSide: undefined` and one occupant when the carry fix
 * landed, and stopped being reported while remaining stuck
 * (`statuses/2026-09-25-the-carry-fix-resolves-one-stall-and-hides-another.md`).
 *
 * So this scan counts stalls by a **status-blind** definition, which is also the widening on record
 * as the recommendation for the detector itself:
 *
 *   terminal draw AND no `winningSide` AND exactly one non-BYE occupant AND no BYE side
 *
 * with `matchUpStatus` deliberately not consulted. `visible` is the subset the current detector can
 * see; `hidden` is the subset it cannot. `hidden > 0` is a suppression, not an improvement.
 *
 * ## Controls, so that a zero means something
 *
 *  - `cellsPlayed` / `terminalCells` — asserted, because a scan that generates nothing, or that never
 *    reaches a terminal state, also reports zero stalls.
 *  - `detectorFindings` is recorded next to `visible` and the two MUST agree. They are computed by
 *    different code over the same draw, so a divergence means one of the two definitions drifted.
 *  - `ARM=control` is the falsification of the widened rule: a draw played to exhaustion with no exit
 *    at all cannot have stranded anybody, so any `oracleStalls` in that arm is a false positive by
 *    construction — of the WIDENED rule, not of the detector.
 *
 * Round-robin group structures are excluded, as the detector excludes them; no draw type in this
 * matrix generates one, so the exclusion is inert here and kept only so the definitions match.
 */

const enabled = process.env.STALLED_ORACLE === '1';
const arm = process.env.ARM ?? 'control';
const outPath = process.env.OUT ?? '/tmp/stalledPositionOracle.jsonl';
const STALLED_POSITION = 'STALLED_POSITION';
const TO_BE_PLAYED_STATUS = 'TO_BE_PLAYED';

const DRAW_TYPES = [
  SINGLE_ELIMINATION,
  DOUBLE_ELIMINATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  FEED_IN_CHAMPIONSHIP,
  CURTIS_CONSOLATION,
  COMPASS,
  OLYMPIC,
];
const DRAW_SIZES = [8, 16];
const REDUCTIONS = [0, 1, 3];
const EXIT_STATUSES = [WALKOVER, DEFAULTED, RETIRED, DOUBLE_WALKOVER, DOUBLE_DEFAULT];

const exitOutcome = (exitStatus: string) => {
  if ([DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(exitStatus)) return { matchUpStatus: exitStatus };
  if (exitStatus === RETIRED) {
    return { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } };
  }
  return { matchUpStatus: exitStatus, winningSide: 1 };
};

// composed exactly as exitPropagationMatrix.test.ts composes it, so seeds and labels correspond
const MATRIX = DRAW_TYPES.flatMap((drawType) =>
  DRAW_SIZES.flatMap((drawSize) =>
    REDUCTIONS.flatMap((reduction) =>
      EXIT_STATUSES.flatMap((exitStatus) =>
        [true, false].map((propagateExitStatus) => ({
          participantsCount: drawSize - reduction,
          propagateExitStatus,
          exitStatus,
          drawSize,
          drawType,
        })),
      ),
    ),
  ),
).map((cell, index) => ({ ...cell, seed: index + 1 }));

const label = (cell: (typeof MATRIX)[number]) =>
  `matrix ${cell.drawType} ${cell.drawSize}/${cell.participantsCount} ${cell.exitStatus} propagate=${cell.propagateExitStatus}`;

const occupantsOf = (matchUp: any) => (matchUp?.sides ?? []).filter((s: any) => s?.participantId && !s?.bye);

/** the detector's own gate, reproduced so `visible` can be compared against what it reports */
const detectorWouldSee = (matchUp: any) =>
  !matchUp.winningSide && (!matchUp.matchUpStatus || matchUp.matchUpStatus === TO_BE_PLAYED_STATUS);

/**
 * A SECOND, separate question this scan can answer for free, and it belongs to **P29**.
 *
 * A one-occupant matchUp with a `winningSide` is NOT stranded — somebody advanced out of it — so the
 * stall oracle above excludes it, correctly. But WHICH side won decides whether that is a resolution
 * or a defect:
 *
 *  - `winningSide === the occupant's sideNumber` — the participant who was there wins the produced
 *    walkover and moves on. Correct.
 *  - `winningSide !== the occupant's sideNumber` — the award went to the EMPTY seat. The player who
 *    did not appear won. That is P29's shape, stated in the punch list as *"a produced WALKOVER is
 *    awarded to the side that CARRIES the exit"*.
 *
 * Measured here because the distinction was nearly banked as a resolution: `West|2|1` in the named
 * COMPASS case reads `WALKOVER ws=2 occupants=1`, which is indistinguishable from the defect until
 * the occupant's own `sideNumber` is read.
 */
const awardedToVacantSeat = (matchUp: any): boolean => {
  if (!matchUp.winningSide) return false;
  const occupants = occupantsOf(matchUp);
  if (occupants.length !== 1) return false;
  return occupants[0].sideNumber !== matchUp.winningSide;
};

type Cell = (typeof MATRIX)[number];

type Tally = {
  cellsPlayed: number;
  terminalCells: number;
  detectorFindings: number;
  oracleStalls: number;
  hiddenStalls: number;
  awardedToOccupant: number;
  awardedToVacant: number;
  cellsWithDetector: Set<string>;
  cellsWithOracle: Set<string>;
  cellsWithHidden: Set<string>;
  cellsWithVacantAward: Set<string>;
  hiddenByStatus: Record<string, number>;
  oracleByDrawType: Record<string, number>;
  vacantAwardByStatus: Record<string, number>;
};

const emptyTally = (): Tally => ({
  cellsPlayed: 0,
  terminalCells: 0,
  detectorFindings: 0,
  oracleStalls: 0,
  hiddenStalls: 0,
  awardedToOccupant: 0,
  awardedToVacant: 0,
  cellsWithDetector: new Set<string>(),
  cellsWithOracle: new Set<string>(),
  cellsWithHidden: new Set<string>(),
  cellsWithVacantAward: new Set<string>(),
  hiddenByStatus: {},
  oracleByDrawType: {},
  vacantAwardByStatus: {},
});

const bump = (counts: Record<string, number>, key: string) => {
  counts[key] = (counts[key] ?? 0) + 1;
};

const hasBye = (matchUp: any) => (matchUp.sides ?? []).some((side: any) => side?.bye);

/** generate the cell's draw and drive it to exhaustion; false when the draw did not generate */
function playCell(cell: Cell, drawId: string): boolean {
  setSubscriptions({});
  const { drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawId, drawType: cell.drawType, drawSize: cell.drawSize, participantsCount: cell.participantsCount },
    ],
    nonRandom: cell.seed,
    setState: true,
  });
  if (!drawIds?.includes(drawId)) return false;

  const outcome = exitOutcome(cell.exitStatus);
  if (arm === 'exits') {
    const target = nextPlayable(drawId);
    if (target?.matchUpId) {
      step({ propagateExitStatus: cell.propagateExitStatus, matchUpId: target.matchUpId, drawId, outcome });
    }
    playForward({ propagateExitStatus: cell.propagateExitStatus, exitOutcome: outcome, drawId });
  } else {
    // CONTROL — ordinary results only, so no exit ever enters the draw
    playForward({ propagateExitStatus: cell.propagateExitStatus, exitOutcome: undefined, drawId });
  }
  return true;
}

function recordStalls(cell: Cell, key: string, stalls: any[], structureNameOf: (m: any) => any, tally: Tally): void {
  tally.oracleStalls += stalls.length;
  if (stalls.length) {
    tally.cellsWithOracle.add(key);
    tally.oracleByDrawType[cell.drawType] = (tally.oracleByDrawType[cell.drawType] ?? 0) + stalls.length;
  }

  const hidden = stalls.filter((m) => !detectorWouldSee(m));
  tally.hiddenStalls += hidden.length;
  if (hidden.length) tally.cellsWithHidden.add(key);
  for (const m of hidden) bump(tally.hiddenByStatus, String(m.matchUpStatus));

  for (const m of stalls) {
    const occupied = occupantsOf(m);
    fs.appendFileSync(
      outPath,
      JSON.stringify({
        arm,
        key,
        seed: cell.seed,
        drawType: cell.drawType,
        drawSize: cell.drawSize,
        participantsCount: cell.participantsCount,
        exitStatus: cell.exitStatus,
        propagateExitStatus: cell.propagateExitStatus,
        finding: 'STALL',
        structureName: structureNameOf(m),
        stage: m.stage,
        stageSequence: m.stageSequence,
        roundNumber: m.roundNumber,
        roundPosition: m.roundPosition,
        matchUpStatus: m.matchUpStatus ?? null,
        winningSide: m.winningSide ?? null,
        hidden: !detectorWouldSee(m),
        drawPositions: m.drawPositions,
        occupiedDrawPositions: occupied.map((s: any) => s.drawPosition),
        occupiedSideNumbers: occupied.map((s: any) => s.sideNumber),
      }) + '\n',
    );
  }
}

/** P29's question over the same terminal draws — see `awardedToVacantSeat` */
function recordAwards(
  cell: Cell,
  key: string,
  decidedSingles: any[],
  structureNameOf: (m: any) => any,
  tally: Tally,
): void {
  for (const m of decidedSingles) {
    if (!awardedToVacantSeat(m)) {
      tally.awardedToOccupant += 1;
      continue;
    }
    tally.awardedToVacant += 1;
    tally.cellsWithVacantAward.add(key);
    bump(tally.vacantAwardByStatus, String(m.matchUpStatus));
    fs.appendFileSync(
      outPath,
      JSON.stringify({
        arm,
        key,
        seed: cell.seed,
        drawType: cell.drawType,
        finding: 'AWARDED_TO_VACANT_SEAT',
        structureName: structureNameOf(m),
        roundNumber: m.roundNumber,
        roundPosition: m.roundPosition,
        matchUpStatus: m.matchUpStatus ?? null,
        winningSide: m.winningSide,
        occupiedSideNumbers: occupantsOf(m).map((s: any) => s.sideNumber),
        drawPositions: m.drawPositions,
      }) + '\n',
    );
  }
}

function measureCell(cell: Cell, tally: Tally): void {
  const key = label(cell);
  const drawId = `oracle-${arm}-${key.replace(/[^\w]+/g, '-')}`;
  if (!playCell(cell, drawId)) return;
  tally.cellsPlayed += 1;

  const drawDefinition = getDrawDefinition(drawId);
  const integrity: any = getDrawInconsistencies({ drawDefinition, drawId });
  const reported = (integrity?.inconsistencies ?? []).filter((i: any) => i.issueType === STALLED_POSITION);
  tally.detectorFindings += reported.length;
  if (reported.length) tally.cellsWithDetector.add(key);

  const { matchUps } = tournamentEngine.allDrawMatchUps({ inContext: true, drawId });
  const drawMatchUps = (matchUps as any[]).filter((m) => !m.collectionId);

  // not terminal: the detector is silent for a reason that says nothing about the draw, and the
  // oracle's terminal gate is the same, so neither number is meaningful for this cell
  if (drawMatchUps.some((m) => detectorWouldSee(m) && occupantsOf(m).length === 2)) return;
  tally.terminalCells += 1;

  const structureNameOf = (m: any) =>
    drawDefinition.structures?.find((s: any) => s.structureId === m.structureId)?.structureName;

  const singles = drawMatchUps.filter((m) => occupantsOf(m).length === 1 && !hasBye(m));
  const stalls = singles.filter((m) => !m.winningSide);
  const decidedSingles = singles.filter((m) => m.winningSide);

  /**
   * THE AGREEMENT CHECK, and what it means depends on which gate the detector carries.
   *
   * With the status-blind gate (the widening of 2026-09-26) the detector should report EVERY stall
   * this scan finds, so `reported` and `stalls` must be equal. With the original `TO_BE_PLAYED` gate
   * it should report only `narrowVisible`, and the gap is `hidden`. Both are printed, so a run says
   * which gate produced it rather than leaving the reader to infer it.
   */
  const narrowVisible = stalls.filter((m) => detectorWouldSee(m));
  if (reported.length !== stalls.length && reported.length !== narrowVisible.length) {
    process.stdout.write(
      `\nDIVERGENCE ${key}: reported=${reported.length} stalls=${stalls.length} ` +
        `narrowVisible=${narrowVisible.length}\n`,
    );
  }

  recordStalls(cell, key, stalls, structureNameOf, tally);
  recordAwards(cell, key, decidedSingles, structureNameOf, tally);
}

test.skipIf(!enabled)(
  'stalled-position oracle scan',
  () => {
    fs.writeFileSync(outPath, '');
    const tally = emptyTally();
    for (const cell of MATRIX) measureCell(cell, tally);

    process.stdout.write(
      `\nARM=${arm} cellsPlayed=${tally.cellsPlayed} terminalCells=${tally.terminalCells}\n` +
        `detectorFindings=${tally.detectorFindings} cellsWithDetector=${tally.cellsWithDetector.size}\n` +
        `oracleStalls=${tally.oracleStalls} cellsWithOracle=${tally.cellsWithOracle.size}\n` +
        `hiddenStalls=${tally.hiddenStalls} cellsWithHidden=${tally.cellsWithHidden.size}\n` +
        `hiddenByStatus=${JSON.stringify(tally.hiddenByStatus)}\n` +
        `oracleByDrawType=${JSON.stringify(tally.oracleByDrawType)}\n` +
        `awardedToOccupant=${tally.awardedToOccupant} awardedToVacant=${tally.awardedToVacant} ` +
        `cellsWithVacantAward=${tally.cellsWithVacantAward.size}\n` +
        `vacantAwardByStatus=${JSON.stringify(tally.vacantAwardByStatus)}\n`,
    );

    // controls, asserted rather than printed — a scan over nothing also reports zero stalls
    expect(tally.cellsPlayed).toBeGreaterThan(0);
    expect(tally.terminalCells).toBeGreaterThan(0);
  },
  900_000,
);

/**
 * The same two definitions over CA's OWN reproductions, which the matrix does not contain — it
 * generates at its own seeds, and the named COMPASS cases use `nonRandom: 20223109`.
 *
 * 16/14 is the P39 case (one participant stranded at `Southwest|1|1`); 16/12 is the one that stranded
 * THREE and whose named test now expects 3 and receives 1. Printed rather than asserted: this is the
 * measurement behind the widening recommendation, kept so it can be re-measured rather than re-argued.
 */
test.skipIf(!enabled)('oracle over the named COMPASS reproductions', () => {
  for (const participantsCount of [14, 12]) {
    setSubscriptions({});
    const drawId = `oracle-compass-${participantsCount}`;
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: COMPASS, drawSize: 16, participantsCount, drawId }],
      nonRandom: 20223109,
      setState: true,
    });

    const allMatchUps = () => tournamentEngine.allDrawMatchUps({ inContext: true, drawId }).matchUps ?? [];
    const source: any = allMatchUps().find(
      (m: any) => m.structureName === 'East' && m.roundNumber === 1 && m.roundPosition === 2,
    );
    tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: source.matchUpId,
      drawId,
    });

    // play everything playable, to exhaustion
    let played = 1;
    while (played) {
      played = 0;
      for (const matchUp of allMatchUps() as any[]) {
        if (!detectorWouldSee(matchUp)) continue;
        if (occupantsOf(matchUp).length !== 2) continue;
        const result: any = tournamentEngine.setMatchUpStatus({
          outcome: { winningSide: 1 },
          matchUpId: matchUp.matchUpId,
          drawId,
        });
        if (!result.error) played++;
      }
    }

    const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
    const integrity: any = getDrawInconsistencies({ drawDefinition, drawId });
    const reported = (integrity?.inconsistencies ?? []).filter((i: any) => i.issueType === STALLED_POSITION);
    const stalls = (allMatchUps() as any[]).filter(
      (m) =>
        !m.collectionId &&
        !m.winningSide &&
        occupantsOf(m).length === 1 &&
        !(m.sides ?? []).some((side: any) => side?.bye),
    );
    const describe = (m: any) =>
      `${m.structureName}|${m.roundNumber}|${m.roundPosition} ${m.matchUpStatus ?? 'TO_BE_PLAYED'}` +
      `${detectorWouldSee(m) ? '' : ' (HIDDEN)'}`;

    /**
     * A CONTROL on the oracle itself. "Absent from a one-occupant oracle" is not the same as "the
     * seat filled": a matchUp holding ZERO non-BYE participants is absent too, and that is a
     * different defect rather than a resolution. So the three matchUps the 2026-09-25 decomposition
     * named are reported by NAME with their occupancy, not inferred from absence.
     */
    const named = ['West|3|1', 'West|2|1', 'Southwest|1|1'];
    const namedState = (allMatchUps() as any[])
      .filter((m) => named.includes(`${m.structureName}|${m.roundNumber}|${m.roundPosition}`))
      .map(
        (m) =>
          `  ${m.structureName}|${m.roundNumber}|${m.roundPosition} ${m.matchUpStatus ?? 'TO_BE_PLAYED'} ` +
          `ws=${m.winningSide ?? 'undefined'} occupants=${occupantsOf(m).length} ` +
          `byes=${(m.sides ?? []).filter((s: any) => s?.bye).length}`,
      );

    process.stdout.write(
      `\nCOMPASS 16/${participantsCount}: detector=${reported.length} oracle=${stalls.length}\n` +
        `${stalls.map(describe).join('\n')}\n` +
        `named matchUps from the 2026-09-25 decomposition:\n${namedState.join('\n')}\n`,
    );
  }
});

/**
 * THE TRANSIENT CLASS, measured per step rather than asserted.
 *
 * `crossStructureWinnerPositions.test.ts` asserts `inconsistencies === []` after EVERY submission, so
 * a stall that exists mid-correction and clears at the next step fails it. One such case was already
 * adjudicated as the programme's single genuine false positive — census 9100555, firing at step 5 of 6
 * and cleared by step 6. Widening the rule surfaced a second, `DE window seed 9301605` at step 4 of 5,
 * and "probably the same class" is not a measurement.
 *
 * So this replays both scenarios exactly as that file does and prints the finding count after every
 * step. A count that returns to 0 by the final step is transient; one that persists is a real stall
 * the correction never repaired.
 */
test.skipIf(!enabled)('the correction-sequence stalls, per step', () => {
  const CASES = [
    {
      name: 'census 9100555 — unwinding a Backdraw double exit',
      participantsCount: 6,
      nonRandom: 9100555,
      submissions: [
        ['Main', 1, 2, { winningSide: 2 }],
        ['Main', 2, 2, { matchUpStatus: 'DOUBLE_DEFAULT' }],
        ['Main', 2, 1, { matchUpStatus: 'DEFAULTED', winningSide: 1 }],
        ['Backdraw', 3, 1, { matchUpStatus: DOUBLE_WALKOVER }],
        ['Main', 1, 3, { matchUpStatus: 'WALKOVER', winningSide: 2 }],
        ['Backdraw', 3, 1, { winningSide: 1 }],
      ],
    },
    {
      name: 'DE window seed 9301605 — a flipped Main semifinal winner',
      participantsCount: 4,
      nonRandom: 9301605,
      submissions: [
        ['Main', 2, 1, { winningSide: 1 }],
        ['Backdraw', 3, 1, { matchUpStatus: 'DOUBLE_DEFAULT' }],
        ['Main', 2, 2, { winningSide: 2 }],
        ['Main', 3, 1, { matchUpStatus: 'WALKOVER', winningSide: 1 }],
        ['Main', 3, 1, { winningSide: 2 }],
      ],
    },
  ];

  for (const { name, participantsCount, nonRandom, submissions } of CASES) {
    setSubscriptions({});
    const drawId = 'cross-structure';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: DOUBLE_ELIMINATION, drawSize: 8, participantsCount, drawId }],
      setState: true,
      nonRandom,
    });

    const lines: string[] = [];
    for (const [index, submission] of submissions.entries()) {
      const [structureName, roundNumber, roundPosition, outcome] = submission as [string, number, number, any];
      const matchUps = tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
      const matchUp: any = matchUps.find(
        (m: any) =>
          m.structureName === structureName && m.roundNumber === roundNumber && m.roundPosition === roundPosition,
      );
      tournamentEngine.setMatchUpStatus({
        matchUpId: matchUp.matchUpId,
        propagateExitStatus: true,
        outcome,
        drawId,
      });
      const integrity: any = tournamentEngine.getDrawInconsistencies({ drawId });
      const found = (integrity?.inconsistencies ?? []).filter((i: any) => i.issueType === STALLED_POSITION);
      lines.push(
        `  step ${index + 1} ${structureName}|${roundNumber}|${roundPosition} -> ${found.length} STALLED_POSITION`,
      );
    }
    process.stdout.write(`\n${name}\n${lines.join('\n')}\n`);
  }
});
