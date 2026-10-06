import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { playForward } from '@Tests/testHarness/exitPropagation/driver';
import { setSubscriptions } from '@Global/state/globalState';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';
import {
  MATRIX_EXTENSION_CELLS,
  TEAM_LINE_CELLS,
  cellExitOutcome,
  MATRIX_CELLS,
} from '@Tests/testHarness/exitPropagation/matrixCells';

/**
 * `findDrawMatchUp` IN CONTEXT HYDRATES ONE MATCHUP, AND IT IS THE SAME MATCHUP THE STRUCTURE WOULD
 * HAVE RENDERED.
 *
 * It used to hydrate the whole structure holding the matchUp and pick one out — measured 2026-10-01,
 * the two in-context lookups a TEAM line score makes were 11% of everything `setMatchUpStatus`
 * spent. Now only the requested matchUp (or the dual it is a line of) is hydrated, against
 * structure-level profiles still taken from every matchUp in the structure.
 *
 * The claim is that nothing a single matchUp's context is derived from was dropped. This is the
 * equality that claim rests on: every matchUp of every structure, lines included, at generation, a
 * few steps into play, and played out — compared, field for field, with the same matchUp taken from
 * a whole-structure hydration. With and without `event`, and with the participants hydrated.
 */

const canonical = (value: any): any => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort((a, b) => a.localeCompare(b))
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
};

const CELLS = [
  ...MATRIX_CELLS.filter(
    (cell) => cell.drawSize === 16 && cell.participantsCount === 13 && cell.exitStatus === 'DOUBLE_WALKOVER',
  ),
  ...MATRIX_EXTENSION_CELLS.filter((cell) => cell.drawSize === 16 && cell.exitStatus === 'DOUBLE_WALKOVER'),
  ...TEAM_LINE_CELLS.filter(
    (cell) => cell.drawSize === 8 && cell.participantsCount === 7 && cell.exitStatus === 'WALKOVER',
  ),
].filter((cell) => cell.propagateExitStatus);

/**
 * KNOWN, TRACKED, NOT THIS FILE'S SUBJECT. The TEAM double elimination's lines cell crashed in
 * `removeDirectedParticipants` until 2026-10-06, which ended its play early and hid this: a later
 * step refuses after it has mutated the draw — the double-elimination residual of the
 * ERROR_IMPLIES_NO_MUTATION class (Mentat/planning/ERROR_ATOMICITY_ROUTES_ASSESSED.md). Pinned so
 * the fix shows up here as a failure to update, not as a silent pass.
 */
const KNOWN_PLAY_FAILURES: Record<number, string[]> = {
  300071: [
    'ERROR_IMPLIES_NO_MUTATION returned {"message":"drawPosition is occupied","code":"ERR_OCCUPIED_DRAW_POSITION"} after mutating the draw',
  ],
};

function compareEveryMatchUp(drawId: string): number {
  const { tournamentRecord } = tournamentEngine.getTournament();
  const event = tournamentRecord.events.find((candidate: any) =>
    candidate.drawDefinitions?.some((draw: any) => draw.drawId === drawId),
  );
  const drawDefinition = event.drawDefinitions.find((draw: any) => draw.drawId === drawId);
  const tournamentParticipants = tournamentRecord.participants;

  let compared = 0;
  for (const structure of drawDefinition.structures) {
    for (const variant of [{}, { event }, { event, tournamentParticipants }]) {
      const whole = getAllStructureMatchUps({ ...variant, inContext: true, drawDefinition, structure }).matchUps;
      for (const expected of whole) {
        const { matchUp } = findDrawMatchUp({
          ...variant,
          matchUpId: expected.matchUpId,
          inContext: true,
          drawDefinition,
        });
        expect(canonical(matchUp), `${structure.structureName} ${expected.matchUpId}`).toEqual(canonical(expected));
        compared += 1;
      }
    }
  }
  return compared;
}

it.each(CELLS)(
  '$drawType $drawSize/$participantsCount lines=$lineUps: one matchUp in context is the matchUp the structure renders',
  (cell) => {
    setSubscriptions({});
    const drawId = `ctx-${cell.seed}`;
    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          ...(cell.tieFormatName ? { tieFormatName: cell.tieFormatName } : {}),
          ...(cell.eventType ? { eventType: cell.eventType } : {}),
          participantsCount: cell.participantsCount,
          drawType: cell.drawType,
          drawSize: cell.drawSize,
          drawId,
        },
      ],
      nonRandom: cell.seed,
      setState: true,
    });
    if (cell.lineUps) {
      const result: any = tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId });
      expect(result.success).toEqual(true);
    }

    const exitOutcome = cellExitOutcome(cell.exitStatus);
    const propagateExitStatus = cell.propagateExitStatus;

    // CONTROL: every state compared something, lines included where there are lines
    expect(compareEveryMatchUp(drawId)).toBeGreaterThan(0);
    // play must succeed for the comparisons after it to mean anything: a step that throws is
    // reported in `failures` (ERROR_ATOMICITY) and the draw stops short of being played out.
    // Five steps cannot finish a draw, so that partial play reports only that it did not converge.
    const partial = playForward({ propagateExitStatus, exitOutcome, maxSteps: 5, drawId }).failures;
    expect(partial.map(({ property }) => property)).toEqual(['DRIVER_DID_NOT_CONVERGE']);
    expect(compareEveryMatchUp(drawId)).toBeGreaterThan(0);
    const played = playForward({ propagateExitStatus, exitOutcome, drawId }).failures;
    expect(played.map(({ property, detail }) => `${property} ${detail}`)).toEqual(KNOWN_PLAY_FAILURES[cell.seed] ?? []);
    expect(compareEveryMatchUp(drawId)).toBeGreaterThan(0);
  },
);
