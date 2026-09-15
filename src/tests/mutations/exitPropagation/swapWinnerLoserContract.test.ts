import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

import {
  applyOutcome,
  findByCoord,
  generateDraw,
  playForward,
} from '@Tests/testHarness/exitPropagation/routeComparison';

// constants
import { CURTIS_CONSOLATION, COMPASS, OLYMPIC } from '@Constants/drawDefinitionConstants';

/**
 * THE CONTRACT of a winner/loser swap, enforced rather than described.
 *
 * Changing a decided matchUp's winner changes exactly two things, and they are easy to conflate
 * because both are "drawPositions" in loose speech:
 *
 *   SOURCE structure   the matchUp `drawPositions` of LATER ROUNDS — a different position advances
 *                      `positionAssignments` — NEVER, not one
 *   TARGET structures  `positionAssignments` — the occupant's identity changes
 *
 * **A participant's binding to a drawPosition in the structure they PLAYED IN is what a winner
 * change does not touch.** They keep their place in that draw; what changes is which of them
 * progresses out of it, and who consequently occupies the places that draw feeds.
 *
 * Conflating the two has already cost a defect — rewriting the advancement record with a positional
 * `map` broke the ascending-order invariant that binds drawPositions to sides
 * (`DRAW_POSITIONS_NOT_SORTED`, 25 findings, #4881(factory)). This file exists so the distinction
 * cannot be lost again: each half fails independently, so a change that violates either is named.
 */

const DRAW_SIZE = 16;
const SEED = 7001;

type Snapshot = { assignments: Record<string, string | null>; advancement: Record<string, string> };

const coordinates = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

function snapshot(drawId: string, structureName: string): Snapshot {
  const matchUps = tournamentEngine.allDrawMatchUps({ inContext: true, drawId })?.matchUps ?? [];
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structure: any = drawDefinition.structures.find((item: any) => item.structureName === structureName);
  return {
    assignments: Object.fromEntries(
      (structure?.positionAssignments ?? []).map((assignment: any) => [
        String(assignment.drawPosition),
        assignment.participantId ?? null,
      ]),
    ),
    advancement: Object.fromEntries(
      matchUps
        .filter((matchUp: any) => matchUp.structureName === structureName)
        .map((matchUp: any) => [coordinates(matchUp), JSON.stringify(matchUp.drawPositions)]),
    ),
  };
}

function flip(drawId: string, structureName: string, roundNumber: number, roundPosition: number) {
  const target = findByCoord(drawId, { structureName, roundNumber, roundPosition });
  expect(target?.winningSide, `${structureName}|${roundNumber}|${roundPosition} is not decided`).toBeTruthy();
  const result = applyOutcome(target.matchUpId, drawId, { winningSide: target.winningSide === 1 ? 2 : 1 }, true);
  expect(result?.error).toBeUndefined();
}

describe.each([
  { drawType: COMPASS, sourceName: 'East', targetName: 'West' },
  { drawType: OLYMPIC, sourceName: 'East', targetName: 'West' },
  { drawType: CURTIS_CONSOLATION, sourceName: 'Main', targetName: 'Consolation 1' },
])('$drawType — a winner change is a relabel, not a re-placement', ({ drawType, sourceName, targetName }) => {
  const setup = () => {
    const drawId = `contract-${drawType}`;
    generateDraw(drawType, drawId, DRAW_SIZE, SEED, DRAW_SIZE);
    playForward(drawId);
    return drawId;
  };

  it('NEVER changes positionAssignments in the structure that was played', () => {
    const drawId = setup();
    const before = snapshot(drawId, sourceName);
    // CONTROL: a structure with no assignments would satisfy the assertion vacuously.
    expect(Object.keys(before.assignments).length).toEqual(DRAW_SIZE);

    flip(drawId, sourceName, 1, 4);

    expect(snapshot(drawId, sourceName).assignments).toEqual(before.assignments);
  });

  it('DOES change which drawPosition advances, in a later round of that structure', () => {
    const drawId = setup();
    const before = snapshot(drawId, sourceName);

    flip(drawId, sourceName, 1, 4);

    const after = snapshot(drawId, sourceName);
    const changed = Object.keys(before.advancement).filter((key) => before.advancement[key] !== after.advancement[key]);
    // The advancement record MUST move — otherwise the flip changed nothing and the assertion above
    // holds for the wrong reason.
    expect(changed.length).toBeGreaterThan(0);
    // ...and only in rounds AFTER the one flipped; the flipped matchUp keeps its own positions.
    for (const key of changed) {
      const roundNumber = Number(key.split('|')[1]);
      expect(roundNumber, `${key} should not have moved`).toBeGreaterThan(1);
    }
  });

  it('DOES change positionAssignments in a structure that was fed', () => {
    const drawId = setup();
    const before = snapshot(drawId, targetName);
    expect(Object.values(before.assignments).filter(Boolean).length).toBeGreaterThan(0);

    flip(drawId, sourceName, 1, 4);

    const after = snapshot(drawId, targetName);
    const changed = Object.keys(before.assignments).filter((key) => before.assignments[key] !== after.assignments[key]);
    expect(changed.length, `${targetName} did not take the corrected loser`).toBeGreaterThan(0);
    // A relabel, not a re-placement: the SET of occupied positions is unchanged, only who holds them.
    const occupied = (snap: Snapshot) =>
      Object.keys(snap.assignments)
        .filter((key) => snap.assignments[key])
        .sort((a, b) => Number(a) - Number(b));
    expect(occupied(after)).toEqual(occupied(before));
  });
});
