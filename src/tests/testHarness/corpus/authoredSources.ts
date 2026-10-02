import { CorpusWriteError, writeScenario, type Directive } from './writeScenario';
import { getWinningSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { clearOutcome } from '../exitPropagation/transitions';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setRandomSource } from '@Tools/prng';
import { setClock } from '@Tools/clock';
import fs from 'fs';
import path from 'path';

// constants
import { POLICY_SCORING_DEFAULT } from '@Fixtures/policies/POLICY_SCORING_DEFAULT';
import { FIRST_MATCH_LOSER_CONSOLATION, CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import {
  BYE,
  CANCELLED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  IN_PROGRESS,
  RETIRED,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';

/**
 * Golden corpus C4c: authored scenarios, one per rule the outcome-pipeline spec marks UNPINNED or
 * states as a guarantee (`documentation/docs/concepts/outcome-pipeline.md`). Each scenario is a
 * short directive list on a generated draw, written through the C1c writer, and the test beside
 * this file asserts the result code of every step: the scenario is the pin, the assertion is the
 * claim. Where the engine disagrees with the page, the test fails and that is a finding, not a
 * test to fix.
 *
 * Section numbers refer to the spec page.
 */
const CLOCK = '2026-10-01T12:00:00.000Z';
const SEED = 4000;

/**
 * `expected` is the result code per step ('ok' or an ErrorType code; '?' for a rule the spec leaves
 * open). `finalState`, when present, is asked of the record the patches rebuild: it returns the
 * claims that FAIL, as sentences, so a flag's effect is pinned and not only its result code.
 */
type Authored = {
  scenarioId: string;
  ref: string;
  initialRecord: any;
  directives: Directive[];
  expected: string[];
  finalState?: (record: any) => string[];
};

/** every matchUp of a record, with stage and round coordinates, from the raw structures */
export function matchUpAt(record: any, stage: string, roundNumber: number, roundPosition: number) {
  for (const event of record.events ?? [])
    for (const drawDefinition of event.drawDefinitions ?? [])
      for (const structure of drawDefinition.structures ?? []) {
        if (structure.stage !== stage) continue;
        const hit = (structure.matchUps ?? []).find(
          (m: any) => m.roundNumber === roundNumber && m.roundPosition === roundPosition,
        );
        if (hit) return hit;
      }
  return undefined;
}

const claim = (ok: boolean, sentence: string) => (ok ? [] : [sentence]);

const win = (scoreString = '6-1 6-1', winningSide = 1) =>
  mocksEngine.generateOutcomeFromScoreString({ scoreString, winningSide }).outcome;

function generate(drawProfile: any, policy?: any) {
  // the starting record is built on the corpus clock, so its timestamps, and so its hash, reproduce:
  // a committed manifest of these hashes is only a signal if a rerun cannot move them
  setClock(CLOCK);
  // and from its own seed: one shared random sequence made every scenario's ids depend on how many
  // scenarios were generated before it, so adding one moved the hashes of all that followed
  setRandomSource(SEED);
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    ...(policy
      ? { policyDefinitions: { [POLICY_TYPE_SCORING]: { ...POLICY_SCORING_DEFAULT[POLICY_TYPE_SCORING], ...policy } } }
      : {}),
    drawProfiles: [drawProfile],
    startDate: '2026-10-01',
    endDate: '2026-10-03',
  });
  setClock();
  setRandomSource();
  tournamentEngine.reset();
  tournamentEngine.setState(tournamentRecord);
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const at = (stage: string, roundNumber: number, roundPosition: number) =>
    matchUps.find((m: any) => m.stage === stage && m.roundNumber === roundNumber && m.roundPosition === roundPosition);
  return { tournamentRecord, matchUps, at };
}

const sms = (m: any, outcome: any, extra: Record<string, unknown> = {}): Directive => ({
  method: 'setMatchUpStatus',
  params: { drawId: m.drawId, matchUpId: m.matchUpId, outcome, ...extra },
});

export function authoredScenarios(): Authored[] {
  const out: Authored[] = [];

  // § 1 flags: the policy governs, both ways (CA, 2026-10-01)
  {
    const { tournamentRecord, at } = generate(
      { drawSize: 16, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      { propagateExitStatus: true, propagateRetirementAsExit: true },
    );
    out.push({
      scenarioId: 'authored/outcome-pipeline/flags-policy-true-binds-a-false-call',
      ref: 'spec § 1: a policy that propagates retirement as an exit overrules a call that says false',
      initialRecord: tournamentRecord,
      directives: [
        sms(
          at(MAIN, 1, 1),
          { ...win('6-3 2-1', 1), matchUpStatus: RETIRED },
          { propagateRetirementAsExit: false, propagateExitStatus: false },
        ),
      ],
      expected: ['ok'],
      finalState: (record) =>
        claim(
          matchUpAt(record, CONSOLATION, 1, 1)?.matchUpStatus === WALKOVER,
          'the policy won: the retirement carried into the consolation as a WALKOVER',
        ),
    });
  }
  {
    const { tournamentRecord, at } = generate(
      { drawSize: 16, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      { propagateExitStatus: false },
    );
    out.push({
      scenarioId: 'authored/outcome-pipeline/flags-policy-false-binds-a-true-call',
      ref: 'spec § 1: a policy that forbids exit propagation overrules a call that says true',
      initialRecord: tournamentRecord,
      directives: [sms(at(MAIN, 1, 1), { matchUpStatus: WALKOVER, winningSide: 1 }, { propagateExitStatus: true })],
      expected: ['ok'],
      finalState: (record) =>
        claim(
          matchUpAt(record, CONSOLATION, 1, 1)?.matchUpStatus === TO_BE_PLAYED,
          'the policy won: the consolation is untouched',
        ),
    });
  }
  {
    // the DEFAULT policy is silent on the flags, so the call decides
    const { tournamentRecord, at } = generate({ drawSize: 16, drawType: FIRST_MATCH_LOSER_CONSOLATION }, {});
    out.push({
      scenarioId: 'authored/outcome-pipeline/flags-silent-policy-leaves-it-to-the-call',
      ref: 'spec § 1: POLICY_SCORING_DEFAULT says nothing on the flags; the call propagates',
      initialRecord: tournamentRecord,
      directives: [sms(at(MAIN, 1, 1), { matchUpStatus: WALKOVER, winningSide: 1 }, { propagateExitStatus: true })],
      expected: ['ok'],
      finalState: (record) =>
        claim(
          matchUpAt(record, CONSOLATION, 1, 1)?.matchUpStatus === WALKOVER,
          'the call decided: the consolation holds the produced WALKOVER',
        ),
    });
  }

  // § 2 row 5 and § 2 row 9: INVALID_VALUES and the four INCOMPATIBLE_MATCHUP_STATUS conditions
  {
    const { tournamentRecord, at } = generate({ drawSize: 8 });
    const m1 = at(MAIN, 1, 1);
    const m2 = at(MAIN, 1, 2);
    out.push({
      scenarioId: 'authored/outcome-pipeline/invalid-and-incompatible-statuses',
      ref: 'spec § 2 rows 5 and 9',
      initialRecord: tournamentRecord,
      directives: [
        sms(m1, { matchUpStatus: CANCELLED, winningSide: 1 }), // row 5: a terminal non-result with a winner
        sms(m1, { matchUpStatus: BYE, winningSide: 1 }), // row 9: BYE with a winningSide
        sms(m1, { matchUpStatus: IN_PROGRESS, winningSide: 1 }), // row 9: a live status with a winner
        sms(m1, { ...win('6-1 6-1', 1), matchUpStatus: IN_PROGRESS }), // row 9: a live status with a deciding score
        sms(m2, win('6-1 6-1', 1)), // a completed matchUp with a valid winning score …
        sms(m2, { matchUpStatus: IN_PROGRESS }), // row 9: … cannot be reverted to live without a new result
      ],
      expected: [
        'ERR_INVALID_VALUES',
        'ERR_INCOMPATIBLE_MATCHUP_STATUS',
        'ERR_INCOMPATIBLE_MATCHUP_STATUS',
        'ERR_INCOMPATIBLE_MATCHUP_STATUS',
        'ok',
        'ERR_INCOMPATIBLE_MATCHUP_STATUS',
      ],
    });
  }

  // § 6 guarantee: asking for the double exit a matchUp is already in is a no-op success
  {
    const { tournamentRecord, at } = generate({ drawSize: 8 });
    const m1 = at(MAIN, 1, 1);
    out.push({
      scenarioId: 'authored/outcome-pipeline/double-exit-idempotent',
      ref: 'spec § 6: a second identical double exit is satisfied, not repeated',
      initialRecord: tournamentRecord,
      directives: [sms(m1, { matchUpStatus: DOUBLE_WALKOVER }), sms(m1, { matchUpStatus: DOUBLE_WALKOVER })],
      expected: ['ok', 'ok'],
      finalState: (record) =>
        claim(matchUpAt(record, MAIN, 1, 1)?.matchUpStatus === DOUBLE_WALKOVER, 'the matchUp holds its double exit'),
    });
  }

  // § 2 row 14 and § 3: a played-on winner cannot change without allowChangePropagation; with it, swaps
  {
    const { tournamentRecord, at } = generate({ drawSize: 8 });
    const m1 = at(MAIN, 1, 1);
    const m2 = at(MAIN, 1, 2);
    const r2 = at(MAIN, 2, 1);
    out.push({
      scenarioId: 'authored/outcome-pipeline/winner-change-refused-then-swapped',
      ref: 'spec § 2 row 14 and § 3: CANNOT_CHANGE_WINNING_SIDE, then swapWinnerLoser under allowChangePropagation',
      initialRecord: tournamentRecord,
      directives: [
        sms(m1, win('6-1 6-1', 1)),
        sms(m2, win('6-1 6-1', 1)),
        sms(r2, win('6-2 6-2', 1)), // the round-1 winners are now played on
        sms(m1, win('6-1 6-1', 2)), // change the winner: refused
        sms(m1, win('6-1 6-1', 2), { allowChangePropagation: true }), // with the flag: swapped everywhere
      ],
      expected: ['ok', 'ok', 'ok', 'ERR_UNCHANGED_CANNOT_CHANGE_WINNING_SIDE', 'ok'],
      finalState: (record) => {
        const first = matchUpAt(record, MAIN, 1, 1);
        const second = matchUpAt(record, MAIN, 2, 1);
        // the raw structure carries drawPositions, not participants; both of R1 P1's are present
        const advanced = getWinningSideDrawPosition({ matchUp: first });
        return [
          ...claim(first?.winningSide === 2, 'the winner of R1 P1 is now side 2'),
          ...claim(
            !!advanced && !!second?.drawPositions?.includes(advanced),
            'the new winner stands in R2 in the place of the old one',
          ),
        ];
      },
    });
  }

  // § 2 rows 9 and 10: clearing either source of a propagated exit, once the exit has been played on
  {
    const { tournamentRecord, at } = generate({ drawSize: 16, drawType: FIRST_MATCH_LOSER_CONSOLATION });
    const m1 = at(MAIN, 1, 1);
    const m2 = at(MAIN, 1, 2);
    out.push({
      scenarioId: 'authored/outcome-pipeline/clear-blocked-by-propagated-exit',
      ref: 'spec § 2 rows 9 and 10: the origin of the exit is refused as an active downstream (row 9), the other source as PROPAGATED_EXITS_DOWNSTREAM (row 10)',
      initialRecord: tournamentRecord,
      directives: [
        sms(m1, { matchUpStatus: WALKOVER, winningSide: 1 }, { propagateExitStatus: true }), // the loser carries a walkover into the consolation
        sms(m2, win('6-1 6-1', 1)), // the other loser arrives: the consolation matchUp is a produced walkover; its winner advances
        sms(at(MAIN, 2, 1), win('6-2 6-2', 2)), // the walkover's winner loses their first played match and is fed to the consolation
        sms(at(CONSOLATION, 2, 1), win('6-3 6-3', 1)), // the produced exit's winner has now played on
        sms(m1, clearOutcome), // row 9: the exit m1 produced would be withdrawn, but the downstream is active
        sms(m2, clearOutcome), // row 10: clearing m2 would leave the propagated exit standing
      ],
      expected: ['ok', 'ok', 'ok', 'ok', 'ERR_INCOMPATIBLE_MATCHUP_STATUS', 'ERR_PROPAGATED_EXITS_DOWNSTREAM'],
    });
  }

  // § 5 rule 1: a first-match-loser feed takes a loser only on their first match; a second-round
  // loser who won in round 1 is kept out, and a propagated BYE takes the fed position
  {
    const { tournamentRecord, at } = generate({ drawSize: 16, drawType: FIRST_MATCH_LOSER_CONSOLATION });
    out.push({
      scenarioId: 'authored/outcome-pipeline/fmlc-second-round-loser-kept-out',
      ref: 'spec § 5 rule 1: FIRST_MATCHUP feeds take a loser only on their first match; otherwise a propagated BYE',
      initialRecord: tournamentRecord,
      directives: [
        sms(at(MAIN, 1, 1), win('6-1 6-1', 1)),
        sms(at(MAIN, 1, 2), win('6-1 6-1', 1)),
        sms(at(MAIN, 2, 1), win('6-2 6-2', 2)), // the round-1 winner of R1 P1 loses in round 2
      ],
      expected: ['ok', 'ok', 'ok'],
      finalState: (record) => {
        const fed = matchUpAt(record, CONSOLATION, 2, 1);
        const consolation = record.events[0].drawDefinitions[0].structures.find((s: any) => s.stage === CONSOLATION);
        const lowest = Math.min(...(fed?.drawPositions ?? []).filter(Boolean));
        const assignment = consolation?.positionAssignments?.find((a: any) => a.drawPosition === lowest);
        return claim(!!assignment?.bye, 'the fed position of consolation R2 P1 holds a BYE, not the kept-out loser');
      },
    });
  }

  // exit-propagation § convergence: two double exits feeding one matchUp make a double exit there,
  // its flavour from both origins and no winner (defaults on both sides: DOUBLE_DEFAULT; else DOUBLE_WALKOVER)
  {
    const { tournamentRecord, at } = generate({ drawSize: 8 });
    out.push({
      scenarioId: 'authored/outcome-pipeline/double-exits-converge',
      ref: 'exit-propagation § convergence: both defaults make a DOUBLE_DEFAULT, a mixture a DOUBLE_WALKOVER',
      initialRecord: tournamentRecord,
      directives: [
        sms(at(MAIN, 1, 1), { matchUpStatus: DOUBLE_DEFAULT }),
        sms(at(MAIN, 1, 2), { matchUpStatus: DOUBLE_DEFAULT }), // two defaults converge on R2 P1
        sms(at(MAIN, 1, 3), { matchUpStatus: DOUBLE_DEFAULT }),
        sms(at(MAIN, 1, 4), { matchUpStatus: DOUBLE_WALKOVER }), // a default and a walkover converge on R2 P2
      ],
      expected: ['ok', 'ok', 'ok', 'ok'],
      finalState: (record) => {
        const both = matchUpAt(record, MAIN, 2, 1);
        const mixed = matchUpAt(record, MAIN, 2, 2);
        return [
          ...claim(
            both?.matchUpStatus === DOUBLE_DEFAULT && !both?.winningSide,
            'R2 P1 is a DOUBLE_DEFAULT with no winner',
          ),
          ...claim(
            mixed?.matchUpStatus === DOUBLE_WALKOVER && !mixed?.winningSide,
            'R2 P2 is a DOUBLE_WALKOVER with no winner',
          ),
        ];
      },
    });
  }

  // § 8 UNPINNED: bulkMatchUpStatusUpdate's two declared refusals
  {
    const { tournamentRecord, at } = generate({ drawSize: 4 });
    const m1 = at(MAIN, 1, 1);
    out.push({
      scenarioId: 'authored/outcome-pipeline/bulk-update-refusals',
      ref: 'spec § 8: bulkMatchUpStatusUpdate MISSING_VALUE and MISSING_TOURNAMENT_RECORD',
      initialRecord: tournamentRecord,
      directives: [
        { method: 'bulkMatchUpStatusUpdate', params: {} },
        {
          method: 'bulkMatchUpStatusUpdate',
          params: {
            outcomes: [
              { tournamentId: 'no-such-tournament', drawId: m1.drawId, matchUpId: m1.matchUpId, outcome: win() },
            ],
          },
        },
        {
          method: 'bulkMatchUpStatusUpdate',
          params: {
            outcomes: [
              {
                tournamentId: tournamentRecord.tournamentId,
                drawId: m1.drawId,
                matchUpId: m1.matchUpId,
                outcome: win(),
              },
            ],
          },
        },
      ],
      expected: ['ERR_MISSING_VALUE', 'ERR_MISSING_TOURNAMENT', 'ok'],
    });
  }

  return out;
}

export function recordAuthored({ outDir }: { outDir: string }) {
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'authored.jsonl');
  fs.writeFileSync(outPath, '');
  const written: { scenario: any; expected: string[]; finalState?: (record: any) => string[] }[] = [];
  const failed: { scenarioId: string; reason: string }[] = [];
  for (const authored of authoredScenarios()) {
    try {
      const scenario = writeScenario({
        scenarioId: authored.scenarioId,
        source: { kind: 'authored', ref: authored.ref },
        tags: ['authored', 'outcome-pipeline'],
        initialRecord: authored.initialRecord,
        directives: authored.directives,
        seed: SEED,
        clock: CLOCK,
      });
      fs.appendFileSync(outPath, JSON.stringify(scenario) + '\n');
      written.push({ scenario, expected: authored.expected, finalState: authored.finalState });
    } catch (err: any) {
      if (!(err instanceof CorpusWriteError)) throw err;
      failed.push({ scenarioId: authored.scenarioId, reason: err.message.slice(0, 300) });
    }
  }
  return { written, failed };
}
