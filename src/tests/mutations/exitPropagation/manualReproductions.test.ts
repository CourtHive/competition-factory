import { hash, getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION, DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { TO_BE_PLAYED, DEFAULTED, WALKOVER, RETIRED } from '@Constants/matchUpStatusConstants';

/**
 * The five hand-drivable exit-cascade reproductions, replayed.
 *
 * `Mentat/testing/EXIT_CASCADE_MANUAL_REPRODUCTIONS.md` records five defects a tournament director
 * could hit by entering ordinary scores — **no `propagateExitStatus`, no `allowChangePropagation`,
 * no attached policy**, which is exactly what TMX sends. They were drawn from the 480k Button sweep
 * and reduced to the few steps that matter. Two of them corrupted the draw SILENTLY.
 *
 * All five were fixed between `ea2a8ad06` (where the document measured them) and `849eb2eac`. This
 * file exists so that stays true: the document is prose and cannot fail, and every number in this
 * programme that lived only in prose went stale within days.
 *
 * ## What is asserted, and why it is not "no errors"
 *
 * Two properties, both of them the ones these scenarios were filed for:
 *
 *  1. **An error implies no mutation.** Every one of the five originally returned an error, or
 *     silently mis-wrote, over a draw it had already changed.
 *  2. **No step leaves an integrity inconsistency.** `getDrawInconsistencies` must rate the draw
 *     clean after every step, not merely at the end.
 *
 * Asserting "no step errors" would be WRONG, and scenario C is why. Its clear of `Main R2 M2` is now
 * REFUSED — `checkDownstreamCompatibility` rejects a non-directing status with no `winningSide`
 * while `activeDownstream` is true, and the consolation result genuinely is played downstream. That
 * refusal is the engine's documented rule and it mutates nothing; the director's remedy is to undo
 * the consolation result first. Pinning "no error" there would pin a bug the engine does not have.
 *
 * ## The controls, which are not optional
 *
 * A replay whose coordinates or player names no longer resolve would apply NOTHING and report a
 * clean draw — indistinguishable from a fix. So each step asserts that its coordinate names a real
 * matchUp and that the named participant is actually on one of its sides. `nonRandom` is what makes
 * that reproducible: BYE placement and participant order are decided at generation.
 *
 * That `getDrawInconsistencies` can still report dirty is not assumed either — measured the same
 * day on the same tree, it reports `DRAW_INCONSISTENCY` on 20 census seeds across the three frozen
 * windows.
 */

type Step = {
  structureName: string;
  roundNumber: number;
  roundPosition: number;
  winner?: string;
  matchUpStatus?: string;
  score?: any;
  clear?: boolean;
};

const CASES: {
  id: string;
  summary: string;
  drawType: string;
  drawSize: number;
  participantsCount: number;
  nonRandom: number;
  steps: Step[];
}[] = [
  {
    id: 'A',
    summary: 'ERR_EXISTING_POSITION_ASSIGNMENT over a mutated draw, with no exits at all',
    drawType: DOUBLE_ELIMINATION,
    drawSize: 8,
    participantsCount: 4,
    nonRandom: 20227166,
    steps: [
      { structureName: 'Main', roundNumber: 2, roundPosition: 1, winner: 'Portia Tillich' },
      { structureName: 'Main', roundNumber: 2, roundPosition: 2, winner: 'Inigo Stratton' },
      { structureName: 'Backdraw', roundNumber: 3, roundPosition: 1, winner: 'Rosalind Drazic' },
      { structureName: 'Main', roundNumber: 3, roundPosition: 1, winner: 'Portia Tillich' },
      { structureName: 'Backdraw', roundNumber: 4, roundPosition: 1, winner: 'Inigo Stratton' },
      { structureName: 'Backdraw', roundNumber: 4, roundPosition: 1, winner: 'Rosalind Drazic' },
    ],
  },
  {
    id: 'B',
    summary: 'ERR_ACTIVE_DRAW_POSITION over a mutated draw, then DROPPED_PROGRESSION',
    drawType: FIRST_MATCH_LOSER_CONSOLATION,
    drawSize: 16,
    participantsCount: 11,
    nonRandom: 20026346,
    steps: [
      { structureName: 'Main', roundNumber: 1, roundPosition: 2, winner: 'Marhsall Eyre' },
      { structureName: 'Main', roundNumber: 1, roundPosition: 4, winner: 'Maurits Humperdinck' },
      { structureName: 'Main', roundNumber: 2, roundPosition: 1, winner: 'Westley Wolin' },
      { structureName: 'Main', roundNumber: 2, roundPosition: 2, winner: 'Ivan Stewart' },
      { structureName: 'Consolation', roundNumber: 3, roundPosition: 1, winner: 'Erin Herbert' },
      { structureName: 'Main', roundNumber: 2, roundPosition: 1, winner: 'Marhsall Eyre' },
    ],
  },
  {
    id: 'C',
    summary: 'SILENT: a clear left DRAW_POSITION_UNASSIGNED — now correctly refused instead',
    drawType: FIRST_MATCH_LOSER_CONSOLATION,
    drawSize: 8,
    participantsCount: 4,
    nonRandom: 20267937,
    steps: [
      { structureName: 'Main', roundNumber: 2, roundPosition: 1, winner: 'Cordelia Yeats' },
      { structureName: 'Main', roundNumber: 2, roundPosition: 2, winner: 'George Langer' },
      { structureName: 'Consolation', roundNumber: 3, roundPosition: 1, winner: 'Michael Faulkner' },
      { structureName: 'Main', roundNumber: 2, roundPosition: 2, clear: true },
    ],
  },
  {
    id: 'F',
    summary: 'SILENT: WINNING_SIDE_ADVANCEMENT_MISMATCH — the loser advanced',
    drawType: DOUBLE_ELIMINATION,
    drawSize: 8,
    participantsCount: 4,
    nonRandom: 20210783,
    steps: [
      { structureName: 'Main', roundNumber: 2, roundPosition: 1, winner: 'Estlin Humperdinck' },
      { structureName: 'Main', roundNumber: 2, roundPosition: 2, winner: 'Emmanuel Beer' },
      { structureName: 'Backdraw', roundNumber: 3, roundPosition: 1, winner: 'Rick Constant' },
      { structureName: 'Main', roundNumber: 3, roundPosition: 1, winner: 'Estlin Humperdinck' },
      { structureName: 'Backdraw', roundNumber: 4, roundPosition: 1, winner: 'Emmanuel Beer' },
      { structureName: 'Backdraw', roundNumber: 4, roundPosition: 1, winner: 'Rick Constant' },
    ],
  },
  {
    id: 'E',
    summary: 'single exits only — ERR_ACTIVE_DRAW_POSITION over a mutated draw',
    drawType: FIRST_MATCH_LOSER_CONSOLATION,
    drawSize: 8,
    participantsCount: 5,
    nonRandom: 20001746,
    steps: [
      {
        structureName: 'Main',
        roundNumber: 2,
        roundPosition: 1,
        winner: 'Vizzini Eisenstein',
        matchUpStatus: DEFAULTED,
      },
      {
        structureName: 'Main',
        roundNumber: 1,
        roundPosition: 3,
        winner: 'Malachi Murry',
        matchUpStatus: RETIRED,
        score: { sets: [{ side1Score: 6, side2Score: 3 }] },
      },
      { structureName: 'Main', roundNumber: 2, roundPosition: 2, winner: 'Shannon Schumacher' },
      { structureName: 'Consolation', roundNumber: 3, roundPosition: 1, winner: 'Amelie Austen' },
      { structureName: 'Main', roundNumber: 2, roundPosition: 2, winner: 'Malachi Murry', matchUpStatus: WALKOVER },
    ],
  },
];

test.each(CASES)(
  'manual reproduction $id — $summary',
  ({ id, drawType, drawSize, participantsCount, nonRandom, steps }) => {
    setSubscriptions({});
    const drawId = `manual-repro-${id}`;
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ participantsCount, drawSize, drawType, drawId }],
      nonRandom,
      setState: true,
    });

    // CONTROL: the draw must exist and be unplayed, or every assertion below is about nothing.
    expect(getDrawMatchUps(drawId).length).toBeGreaterThan(0);

    const offences: string[] = [];

    steps.forEach((step, index) => {
      const label = `step ${index + 1} (${step.structureName} R${step.roundNumber} M${step.roundPosition})`;
      const target = getDrawMatchUps(drawId).find(
        (matchUp: any) =>
          matchUp.structureName === step.structureName &&
          matchUp.roundNumber === step.roundNumber &&
          matchUp.roundPosition === step.roundPosition,
      );
      // CONTROL: a coordinate that names no matchUp would silently skip the step.
      expect(target, `${label} names no matchUp`).toBeTruthy();

      let outcome: any;
      if (step.clear) {
        outcome = {
          score: { scoreStringSide1: '', scoreStringSide2: '' },
          matchUpStatus: TO_BE_PLAYED,
          winningSide: undefined,
        };
      } else {
        const side = (target.sides ?? []).find((entry: any) => entry?.participant?.participantName === step.winner);
        // CONTROL: the named participant must be in this matchUp. If `nonRandom` ever stops
        // determining placement, this fires rather than the replay quietly applying nothing.
        expect(side, `${label}: "${step.winner}" is not in this matchUp`).toBeTruthy();
        outcome = {
          winningSide: side.sideNumber,
          ...(step.matchUpStatus ? { matchUpStatus: step.matchUpStatus } : {}),
          ...(step.score ? { score: step.score } : {}),
        };
      }

      const before = hash(getDrawDefinition(drawId));
      const result: any = tournamentEngine.setMatchUpStatus({ matchUpId: target.matchUpId, outcome, drawId });
      const after = hash(getDrawDefinition(drawId));

      if (result?.error && before !== after) {
        offences.push(
          `${label}: returned ${JSON.stringify(result.error?.code ?? result.error)} after mutating the draw`,
        );
      }

      const integrity: any = getDrawInconsistencies({ drawDefinition: getDrawDefinition(drawId), drawId });
      const issues = [...new Set((integrity?.inconsistencies ?? []).map((entry: any) => entry.issueType))];
      if (issues.length) offences.push(`${label}: draw inconsistent — ${issues.join(', ')}`);
    });

    expect(offences).toEqual([]);
  },
);
