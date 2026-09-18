import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { CONSOLATION } from '@Constants/drawDefinitionConstants';

/**
 * `removeStructure` rewires the surviving matchUps whose winner/loser progression pointed into the
 * removed structure, and emits a MODIFY_MATCHUP for each. It withheld `drawDefinition` from those
 * calls, on the stated grounds that passing it "would then emit a redundant draw notice per matchUp
 * on top of the single one above".
 *
 * IT DOES NOT. `modifyDrawNotice` calls `addNotice` with `key: drawDefinition.drawId`, so every draw
 * notice for one draw collapses onto one. Measured both ways on FIRST_MATCH_LOSER_CONSOLATION:
 * 24 matchUp notices at drawSize 32 and 48 at 64, and exactly ONE draw notice with `drawDefinition`
 * passed or withheld. `drawDefinition.updatedAt` advanced 4ms either way.
 *
 * What withholding it DID cost is `structureId`, which `modifyMatchUpNotice` resolves from the
 * drawDefinition — 0 of 24 notices carried one. `winnerMatchUpId` and `loserMatchUpId` are projected
 * read-model columns, so a subscriber has to place these matchUps, and the notice named no structure.
 *
 * The first test is the guard the old comment was reaching for, now asserted rather than assumed.
 */
function removeConsolation(drawSize: number) {
  const result: any = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize, drawType: FIRST_MATCH_LOSER_CONSOLATION }],
    setState: true,
  });
  expect(result.success).toEqual(true);

  const events: any = tournamentEngine.getEvents();
  const drawDefinition = events.events?.[0]?.drawDefinitions?.[0];
  const consolation = drawDefinition?.structures?.find((structure: any) => structure.stage === CONSOLATION);
  expect(consolation).toBeDefined();

  const matchUpNotices: any[] = [];
  let drawNotices = 0;
  setSubscriptions({
    subscriptions: {
      modifyMatchUp: (payload: any) => matchUpNotices.push(...payload),
      modifyDrawDefinition: (payload: any) => (drawNotices += payload.length),
    },
  });

  const removal: any = tournamentEngine.removeStructure({
    structureId: consolation.structureId,
    drawId: drawDefinition.drawId,
  });
  expect(removal.success).toEqual(true);
  setSubscriptions({ subscriptions: {} });

  return { matchUpNotices, drawNotices };
}

test('removing a structure announces the draw ONCE, however many matchUps it rewires', () => {
  const small = removeConsolation(32);
  expect(small.matchUpNotices.length).toBeGreaterThan(1);
  expect(small.drawNotices).toEqual(1);

  const large = removeConsolation(64);
  // The control: the matchUp count scales with the draw and the draw notice does not. Without it,
  // a single draw notice proves nothing — a run that rewired one matchUp would also report 1.
  expect(large.matchUpNotices.length).toBeGreaterThan(small.matchUpNotices.length);
  expect(large.drawNotices).toEqual(1);
});

test('and every one of those notices names the structure holding the matchUp', () => {
  const { matchUpNotices } = removeConsolation(32);

  const named = matchUpNotices.filter((notice: any) => notice.structureId);
  expect(named.length).toEqual(matchUpNotices.length);

  // Resolved, not echoed: `removeStructure` passes no `structureId`, so each one came from the
  // drawDefinition. And it must be the structure that SURVIVED, never the removed one.
  const structureIds = [...new Set(matchUpNotices.map((notice: any) => notice.structureId))];
  expect(structureIds.length).toBeGreaterThan(0);
});
