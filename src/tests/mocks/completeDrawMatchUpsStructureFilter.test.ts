import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

/**
 * `completeDrawMatchUps({ structureIds })` — completion narrowed to named structures.
 *
 * Added so TMX's "Complete all matchUps" control can use this method instead of its own loop. That
 * loop filtered incomplete matchUps as `!winningSide && matchUpStatus !== BYE`, and a
 * `DOUBLE_WALKOVER` has no `winningSide` — so it was OVERWRITTEN with an ordinary result, silently
 * destroying a director's entry. This method already skips double exits; the only thing it lacked
 * was the structure scoping the button needs.
 *
 * Both halves are asserted, because they fail independently: without the filter the button would
 * complete the whole draw, and without the double-exit guard it would repeat TMX's defect.
 */

function compassDraw() {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: COMPASS, drawSize: 16, participantsCount: 16, drawId: 'A' }],
    setState: true,
  });
  // Pass `drawId` — NOT a drawDefinition. `getEvent()` hands back a COPY, so completing that
  // reports `completedCount: 32` while the engine's own draw is untouched (measured). The engine
  // resolves `drawId` to the live object.
  const { drawDefinition } = tournamentEngine.getEvent({ drawId: 'A' });
  const idOf = (structureName: string) =>
    drawDefinition?.structures?.find((structure: any) => structure.structureName === structureName)?.structureId;

  const completedIn = (structureName: string) =>
    tournamentEngine
      .allDrawMatchUps({ inContext: true, drawId: 'A' })
      .matchUps.filter((matchUp: any) => matchUp.structureName === structureName && matchUp.winningSide).length;

  return { idOf, completedIn };
}

it('completes only the named structure', () => {
  const { idOf, completedIn } = compassDraw();

  const result: any = tournamentEngine.completeDrawMatchUps({
    structureIds: [idOf('East')],
    drawId: 'A',
  });

  expect(result.error).toBeUndefined();
  expect(completedIn('East')).toBeGreaterThan(0);
  // West is fed from East, so positions arrive there — but nothing in it should have been PLAYED
  expect(completedIn('West')).toEqual(0);
});

it('completes every structure when structureIds is omitted', () => {
  const { completedIn } = compassDraw();

  const result: any = tournamentEngine.completeDrawMatchUps({ drawId: 'A' });

  expect(result.error).toBeUndefined();
  expect(completedIn('East')).toBeGreaterThan(0);
  expect(completedIn('West')).toBeGreaterThan(0);
});

it('an unknown structureId matches nothing rather than everything', () => {
  const { completedIn } = compassDraw();

  const result: any = tournamentEngine.completeDrawMatchUps({
    structureIds: ['not-a-structure'],
    drawId: 'A',
  });

  expect(result.error).toBeUndefined();
  expect(completedIn('East')).toEqual(0);
  expect(completedIn('West')).toEqual(0);
});

/**
 * The defect this whole change exists to remove. A DOUBLE_WALKOVER is a completed outcome a director
 * entered deliberately; completing the structure must not overwrite it.
 */
it('does not overwrite a DOUBLE_WALKOVER when completing a structure', () => {
  const { idOf } = compassDraw();
  const target: any = tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId: 'A' })
    .matchUps.find((matchUp: any) => matchUp.structureName === 'East' && matchUp.roundNumber === 1);

  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: target.matchUpId,
    drawId: 'A',
  });

  tournamentEngine.completeDrawMatchUps({ structureIds: [idOf('East')], drawId: 'A' });

  const after: any = tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId: 'A' })
    .matchUps.find((matchUp: any) => matchUp.matchUpId === target.matchUpId);

  expect(after.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(after.winningSide).toBeUndefined();
});

/**
 * Round-robin matchUps belong to the CHILD groups, not to the CONTAINER, so a caller holding a
 * group's id holds the id of the thing it means to complete. Matching only top-level ids made that
 * silently complete NOTHING — measured before the fix: container id -> 24 completed, the four child
 * ids -> 0. TMX's own loop resolves containers to children exactly this way, so a straight port
 * would have hit it.
 */
it('accepts a round-robin CHILD structureId, not only the container', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: ROUND_ROBIN, drawSize: 16, participantsCount: 16, drawId: 'RR' }],
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId: 'RR' });
  const container: any = drawDefinition?.structures?.[0];
  const childIds = (container.structures ?? []).map((structure: any) => structure.structureId);
  expect(childIds.length).toBeGreaterThan(0);

  const wins = () =>
    tournamentEngine.allDrawMatchUps({ inContext: true, drawId: 'RR' }).matchUps.filter((m: any) => m.winningSide)
      .length;

  const result: any = tournamentEngine.completeDrawMatchUps({ structureIds: childIds, drawId: 'RR' });

  expect(result.error).toBeUndefined();
  expect(wins()).toBeGreaterThan(0);
});

it('accepts the round-robin CONTAINER structureId too', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: ROUND_ROBIN, drawSize: 16, participantsCount: 16, drawId: 'RR2' }],
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId: 'RR2' });
  const containerId = drawDefinition?.structures?.[0]?.structureId;

  tournamentEngine.completeDrawMatchUps({ structureIds: [containerId], drawId: 'RR2' });

  const wins = tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId: 'RR2' })
    .matchUps.filter((m: any) => m.winningSide).length;
  expect(wins).toBeGreaterThan(0);
});
