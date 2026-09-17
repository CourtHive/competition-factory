import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION, FEED_IN_CHAMPIONSHIP_TO_SF } from '@Constants/drawDefinitionConstants';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

/**
 * A HOLE is not a drawPosition. On a feed round, the surviving position must still resolve.
 *
 * `getOrderedDrawPositions`'s feed-round branch picks the fed position with
 * `drawPositions.find((position) => !isNaN(ensureInt(position)))`. `ensureInt` returns **0** for
 * anything that is not a number or a numeric string — including `undefined` and `null` — and
 * `isNaN(0)` is `false`. So the predicate accepts a HOLE, `find` returns the hole at index 0, and
 * the real position at index 1 is discarded: the matchUp hydrates with **both sides empty** and the
 * occupant disappears from every consumer's view.
 *
 * `[undefined, 5]` is not a hypothetical shape. It is what `releaseAdvancedDrawPosition` and
 * `positionClear` deliberately write when they take the LOWER of two positions out, because
 * `drawPositions` is positional and compacting would move the survivor to the other side. The
 * engine is therefore capable of writing the one shape this branch cannot read.
 *
 * ## Measured, so the scope is not overstated
 *
 * Replaying both frozen census windows on both arms — 2,212,980 matchUp readings — **1,948 carried
 * a leading hole and none of them lost its occupant**: the leading holes the cascade actually
 * produces do not land on feed rounds. So this is LATENT, not live, and that is why it is being
 * fixed rather than reported as a regression.
 *
 * Constructed directly instead: one matchUp per run is rewritten, never all of them, because
 * `roundProfile` — which `getOrderedDrawPositions` falls back to — is DERIVED from the matchUps. An
 * earlier version of this probe rewrote every candidate at once and measured its own edit.
 *
 * Of 41 two-position matchUps across four draw types, 8 disagree between `[N]` and `[undefined, N]`,
 * and **every one of the 8 is a feed round**.
 */

function collectStructures(structures: any[], collected: any[] = []): any[] {
  for (const structure of structures ?? []) {
    collected.push(structure);
    if (structure.structures?.length) collectStructures(structure.structures, collected);
  }
  return collected;
}

type Candidate = { structureName: string; roundNumber: number; roundPosition: number; drawPosition: number };

/** every stored matchUp beyond round 1 that holds two real positions */
function twoPositionMatchUps(drawDefinition: any): Candidate[] {
  const candidates: Candidate[] = [];
  for (const structure of collectStructures(drawDefinition.structures)) {
    for (const matchUp of structure.matchUps ?? []) {
      const drawPositions = matchUp.drawPositions;
      if (!Array.isArray(drawPositions)) continue;
      if (drawPositions.filter(Boolean).length !== 2 || matchUp.roundNumber < 2) continue;
      candidates.push({
        structureName: structure.structureName,
        roundNumber: matchUp.roundNumber,
        roundPosition: matchUp.roundPosition,
        drawPosition: Math.max(...drawPositions.filter(Boolean)),
      });
    }
  }
  return candidates;
}

/**
 * Rewrite ONE matchUp to hold `drawPositions` and report the drawPosition its hydrated sides carry.
 */
function sidesFor(profile: any, candidate: Candidate, drawPositions: any[], drawId: string): (number | undefined)[] {
  const { tournamentRecord }: any = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ ...profile, drawId }],
    completeAllMatchUps: true,
    nonRandom: 1,
  });
  const drawDefinition = tournamentRecord.events[0].drawDefinitions.find((draw: any) => draw.drawId === drawId);

  let target: any;
  for (const structure of collectStructures(drawDefinition.structures)) {
    if (structure.structureName !== candidate.structureName) continue;
    for (const matchUp of structure.matchUps ?? []) {
      if (matchUp.roundNumber === candidate.roundNumber && matchUp.roundPosition === candidate.roundPosition) {
        target = matchUp;
      }
    }
  }
  expect(target).toBeDefined(); // control: the single edit landed where it was aimed

  target.drawPositions = drawPositions;
  target.matchUpStatus = TO_BE_PLAYED;
  target.winningSide = undefined;
  target.score = undefined;

  tournamentEngine.setState(tournamentRecord);
  const { matchUps } = tournamentEngine.allDrawMatchUps({ inContext: true, drawId });
  const hydrated = (matchUps ?? []).find(
    (matchUp: any) =>
      matchUp.structureName === candidate.structureName &&
      matchUp.roundNumber === candidate.roundNumber &&
      matchUp.roundPosition === candidate.roundPosition,
  );
  return (hydrated?.sides ?? []).map((side: any) => side?.drawPosition);
}

it.each([
  { drawType: FEED_IN_CHAMPIONSHIP_TO_SF, drawSize: 16, participantsCount: 16 },
  { drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8, participantsCount: 7 },
])('$drawType: a leading hole never hides the surviving drawPosition', (profile) => {
  const seedId = `hole-selection-seed-${profile.drawType}`;
  const { tournamentRecord }: any = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ ...profile, drawId: seedId }],
    completeAllMatchUps: true,
    nonRandom: 1,
  });
  const candidates = twoPositionMatchUps(
    tournamentRecord.events[0].drawDefinitions.find((draw: any) => draw.drawId === seedId),
  );

  // control: a draw with no two-position matchUps beyond round 1 would make this vacuous
  expect(candidates.length).toBeGreaterThan(0);

  const offences: string[] = [];
  let exercised = 0;

  for (const candidate of candidates) {
    const anchor = `${candidate.structureName}|${candidate.roundNumber}|${candidate.roundPosition}`;
    const leading = sidesFor(profile, candidate, [undefined, candidate.drawPosition], `hs-lead-${anchor}`);
    const trailing = sidesFor(profile, candidate, [candidate.drawPosition, undefined], `hs-trail-${anchor}`);

    // the control that makes the assertion meaningful: the TRAILING-hole form resolves, so a
    // failure below is about WHERE the hole is and not about the matchUp being unreadable
    if (!trailing.some((drawPosition) => drawPosition === candidate.drawPosition)) continue;
    exercised++;

    if (!leading.some((drawPosition) => drawPosition === candidate.drawPosition)) {
      offences.push(`${anchor}: [undefined, ${candidate.drawPosition}] hydrated to sides ${JSON.stringify(leading)}`);
    }
  }

  expect(exercised).toBeGreaterThan(0);
  expect(offences).toEqual([]);
});
