import { BYE_ADVANCEMENT_MISSING } from '@Query/drawDefinition/getStructureInconsistencies';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { BYE } from '@Constants/matchUpStatusConstants';

/**
 * The integrity check was BLIND to a stranded BYE advancement, and that blindness is why the
 * `resetDrawDefinition` defect reached a user: the draw was wrong and `getDrawInconsistencies`
 * rated it `valid: true`.
 *
 * Every other advancement check in `getStructureInconsistencies` starts from a `winningSide`. A BYE
 * has none — *"a BYE is never won"* (CA, 2026-09-20) — so none of them could ever see it.
 *
 * These tests break a draw BY HAND rather than by calling reset, so they fail for the right reason
 * and stay meaningful no matter what reset does. The reset fix and this check are independent, and
 * a regression in either must show up here on its own.
 */

const DRAW_ID = 'byeCheckDraw';

function generate(participantsCount: number) {
  const { tournamentRecord }: any = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 16, participantsCount, drawId: DRAW_ID }],
    setState: false,
  });
  return tournamentRecord;
}

function mainStructure(tournamentRecord: any) {
  return tournamentRecord.events[0].drawDefinitions[0].structures.find((s: any) => s.stage === 'MAIN');
}

/** The round-1 BYE matchUps that advance a real participant, plus the position each one advances. */
function byeAdvancements(structure: any) {
  const byePositions: number[] = structure.positionAssignments
    .filter((assignment: any) => assignment.bye)
    .map((assignment: any) => assignment.drawPosition);

  return structure.matchUps
    .filter((matchUp: any) => matchUp.roundNumber === 1 && matchUp.matchUpStatus === BYE)
    .map((matchUp: any) => ({
      matchUp,
      advancedPosition: (matchUp.drawPositions ?? []).find((p: number) => !byePositions.includes(p)),
    }))
    .filter((entry: any) => typeof entry.advancedPosition === 'number');
}

it('REPORTS a draw whose BYE advancement has been removed', () => {
  const tournamentRecord = generate(13);
  const structure = mainStructure(tournamentRecord);

  const advancements = byeAdvancements(structure);
  expect(advancements.length).toBeGreaterThan(0);

  // break ONE of them by hand: strip the advanced position out of the round-2 matchUp it fed,
  // leaving the round-1 BYE and every positionAssignment untouched — exactly the shape reset produced
  const { matchUp: byeMatchUp, advancedPosition } = advancements[0];
  const targetMatchUp = structure.matchUps.find((m: any) => m.matchUpId === byeMatchUp.winnerMatchUpId);
  expect(targetMatchUp).toBeDefined();
  expect(targetMatchUp.drawPositions).toContain(advancedPosition);

  targetMatchUp.drawPositions = targetMatchUp.drawPositions.map((p: number) =>
    p === advancedPosition ? undefined : p,
  );

  tournamentEngine.setState(tournamentRecord);
  const result: any = tournamentEngine.getDrawInconsistencies({ drawId: DRAW_ID });

  const reported = (result.inconsistencies ?? []).filter((i: any) => i.issueType === BYE_ADVANCEMENT_MISSING);
  expect(reported.length).toBe(1);
  expect(result.valid).toBe(false);

  // it names the matchUp the advancement was lost FROM, and who was lost
  expect(reported[0].matchUpId).toBe(byeMatchUp.matchUpId);
  expect(reported[0].winnerMatchUpId).toBe(targetMatchUp.matchUpId);
  expect(reported[0].severity).toBe('error');

  const byeAssignment = structure.positionAssignments.find((a: any) => a.drawPosition === advancedPosition);
  expect(reported[0].participantId).toBe(byeAssignment.participantId);
});

it('CONTROL: the same draw, unbroken, reports nothing', () => {
  // the detector must be able to stay silent, or the test above proves nothing
  const tournamentRecord = generate(13);
  expect(byeAdvancements(mainStructure(tournamentRecord)).length).toBeGreaterThan(0);

  tournamentEngine.setState(tournamentRecord);
  const result: any = tournamentEngine.getDrawInconsistencies({ drawId: DRAW_ID });

  expect((result.inconsistencies ?? []).filter((i: any) => i.issueType === BYE_ADVANCEMENT_MISSING)).toEqual([]);
  expect(result.valid).toBe(true);
});

it('reports EVERY stranded advancement, not just the first', () => {
  const tournamentRecord = generate(13);
  const structure = mainStructure(tournamentRecord);
  const advancements = byeAdvancements(structure);
  expect(advancements.length).toBe(3);

  // strand all three — the shape the reset defect actually produced
  for (const { matchUp, advancedPosition } of advancements) {
    const target = structure.matchUps.find((m: any) => m.matchUpId === matchUp.winnerMatchUpId);
    target.drawPositions = (target.drawPositions ?? []).map((p: number) => (p === advancedPosition ? undefined : p));
  }

  tournamentEngine.setState(tournamentRecord);
  const result: any = tournamentEngine.getDrawInconsistencies({ drawId: DRAW_ID });

  const reported = (result.inconsistencies ?? []).filter((i: any) => i.issueType === BYE_ADVANCEMENT_MISSING);
  expect(reported.length).toBe(3);
  // one finding per stranded matchUp, each separately identified
  expect(new Set(reported.map((i: any) => i.matchUpId)).size).toBe(3);
});

it('does NOT fire on bye-vs-bye, which advances a position but no participant', () => {
  // 3 entries in a 16 draw: most round-1 matchUps are BYE facing BYE. A position still advances out
  // of them, but there is no participant whose absence could mean anything — so a check that keyed
  // on "this matchUp is a BYE" rather than on "a participant faced it" would flood here.
  const tournamentRecord = generate(3);
  const structure = mainStructure(tournamentRecord);

  const byeVsBye = structure.matchUps.filter((matchUp: any) => {
    const byePositions = structure.positionAssignments.filter((a: any) => a.bye).map((a: any) => a.drawPosition);
    return (
      matchUp.roundNumber === 1 &&
      (matchUp.drawPositions ?? []).length === 2 &&
      (matchUp.drawPositions ?? []).every((p: number) => byePositions.includes(p))
    );
  });
  expect(byeVsBye.length).toBeGreaterThan(0);

  tournamentEngine.setState(tournamentRecord);
  const result: any = tournamentEngine.getDrawInconsistencies({ drawId: DRAW_ID });

  expect((result.inconsistencies ?? []).filter((i: any) => i.issueType === BYE_ADVANCEMENT_MISSING)).toEqual([]);
});

it('does not fire on a draw that has been reset — the two halves agree', () => {
  // the end-to-end statement of the original bug: reset the draw, and the checker that was silent
  // on a broken draw is now silent on a CORRECT one
  const tournamentRecord = generate(13);
  tournamentEngine.setState(tournamentRecord);
  const reset: any = tournamentEngine.resetDrawDefinition({ drawId: DRAW_ID });
  expect(reset.success).toBe(true);

  const result: any = tournamentEngine.getDrawInconsistencies({ drawId: DRAW_ID });
  expect(result.inconsistencies).toEqual([]);
  expect(result.valid).toBe(true);
});
