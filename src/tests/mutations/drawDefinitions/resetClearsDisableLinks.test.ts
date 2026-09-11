import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { setSchemaWriteMode } from '@Global/state/globalState';
import { BRIDGE, NATIVE } from '@Constants/schemaWriteModeConstants';
import { DISABLE_LINKS } from '@Constants/extensionConstants';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

afterEach(() => setSchemaWriteMode(NATIVE));

/**
 * `disableLinks` marks a drawPosition whose assignment was cleared BY HAND, so link positioning
 * must not feed it again. `getTargetMatchUp` returns `disabledDrawPosition` for such a position, so
 * the flag suppresses progression through it.
 *
 * A reset returns the draw to its pre-play state, which makes the marker both meaningless and
 * harmful: left behind, it silently blocks progression through that position for the life of the
 * draw. These tests drive the real path — play the main round, let losers feed the consolation, then
 * clear one by hand — rather than planting the attribute, so they also pin that
 * `conditionallyDisableLinkPositioning` still applies to a CONSOLATION structure.
 */

/** Every assignment across the draw still carrying the flag, in either representation. */
function flaggedAssignments(drawId: string) {
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  return (drawDefinition.structures ?? []).flatMap((structure: any) =>
    (structure.positionAssignments ?? [])
      .filter(
        (assignment: any) =>
          assignment.disableLinks || (assignment.extensions ?? []).some((ext: any) => ext.name === DISABLE_LINKS),
      )
      .map((assignment: any) => ({
        structureName: structure.structureName,
        drawPosition: assignment.drawPosition,
        firstClass: !!assignment.disableLinks,
        extension: (assignment.extensions ?? []).some((ext: any) => ext.name === DISABLE_LINKS),
      })),
  );
}

/** Generate, play the main round so the consolation fills, and clear one consolation position. */
function drawWithAClearedConsolationPosition(drawId: string) {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 16, drawType: FIRST_MATCH_LOSER_CONSOLATION }],
    setState: true,
  });

  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-2', winningSide: 1 });
  for (const matchUp of matchUps.filter((m: any) => m.structureName === 'Main' && m.roundNumber === 1)) {
    expect(tournamentEngine.setMatchUpStatus({ drawId, matchUpId: matchUp.matchUpId, outcome }).success).toEqual(true);
  }

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const consolation = (drawDefinition.structures ?? []).find((s: any) => s.stage === 'CONSOLATION');
  const occupied = (consolation?.positionAssignments ?? []).filter((a: any) => a.participantId);
  // the feed must actually have happened, or the rest of the test proves nothing
  expect(occupied.length).toBeGreaterThan(0);

  const result = tournamentEngine.removeDrawPositionAssignment({
    structureId: consolation.structureId,
    drawPosition: occupied[0].drawPosition,
    drawId,
  });
  expect(result.success).toEqual(true);

  return { drawPosition: occupied[0].drawPosition };
}

it('resetDrawDefinition clears disableLinks left by a manual clear (first-class)', () => {
  const drawId = 'reset-disable-links-native';
  const { drawPosition } = drawWithAClearedConsolationPosition(drawId);

  // setup assertion: the flag is really there, on the position we cleared
  const before = flaggedAssignments(drawId);
  expect(before).toEqual([{ structureName: 'Consolation', drawPosition, firstClass: true, extension: false }]);

  expect(tournamentEngine.resetDrawDefinition({ drawId }).success).toEqual(true);

  expect(flaggedAssignments(drawId)).toEqual([]);
});

it('resetDrawDefinition clears disableLinks in BOTH representations under BRIDGE', () => {
  // BRIDGE writes the first-class attribute AND the legacy extension, so this pins that the removal
  // is not gated on the write mode — stale state must go regardless of how it was recorded.
  setSchemaWriteMode(BRIDGE);
  const drawId = 'reset-disable-links-bridge';
  const { drawPosition } = drawWithAClearedConsolationPosition(drawId);

  expect(flaggedAssignments(drawId)).toEqual([
    { structureName: 'Consolation', drawPosition, firstClass: true, extension: true },
  ]);

  expect(tournamentEngine.resetDrawDefinition({ drawId }).success).toEqual(true);

  expect(flaggedAssignments(drawId)).toEqual([]);
});

it('a reset draw can be re-fed through the position that had been disabled', () => {
  // the behavioural consequence, not just the attribute: a stale flag makes getTargetMatchUp
  // return disabledDrawPosition, so the position never receives a fed participant again.
  const drawId = 'reset-disable-links-refeed';
  drawWithAClearedConsolationPosition(drawId);
  expect(tournamentEngine.resetDrawDefinition({ drawId }).success).toEqual(true);

  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-2', winningSide: 1 });
  for (const matchUp of matchUps.filter((m: any) => m.structureName === 'Main' && m.roundNumber === 1)) {
    expect(tournamentEngine.setMatchUpStatus({ drawId, matchUpId: matchUp.matchUpId, outcome }).success).toEqual(true);
  }

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const consolation = (drawDefinition.structures ?? []).find((s: any) => s.stage === 'CONSOLATION');
  const occupied = (consolation?.positionAssignments ?? []).filter((a: any) => a.participantId);
  // all eight first-match losers land again, including the position that had been disabled
  expect(occupied.length).toEqual(8);
  expect(flaggedAssignments(drawId)).toEqual([]);
});
