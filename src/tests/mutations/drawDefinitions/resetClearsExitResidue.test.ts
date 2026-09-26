import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, BYE } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * `resetDrawDefinition` left exit-propagation residue on every BYE matchUp.
 *
 * CA hit it in TMX on 2026-09-24: a COMPASS 16 with 14 participants, a `DOUBLE_WALKOVER` entered at
 * `East|1|2`, then a reset. `West|1|1` — a BYE — still carried
 * `matchUpStatusCodes: [{ sideNumber: 1 }, { previousMatchUpStatus: DOUBLE_WALKOVER, matchUpStatus:
 * WALKOVER, sideNumber: 2 }]` and the matching `sideExitProvenance`, describing a walkover that had
 * just been undone. `North|1|1` kept a `byeClaims` ledger entry for the same vanished exit.
 *
 * **The cause is the BYE skip, not a missing clear.** `toBePlayed` does clear both fields, and
 * `resetMatchUpScore` reached it only for `matchUpStatus !== BYE`. Skipping the overwrite is correct
 * — a BYE is POSITIONING, which reset keeps, and CA's ruling is that "the BYE remains a BYE" — but
 * it took the residue clear with it. So the two are separated: the status survives, the record of a
 * result does not.
 *
 * Asserted on the RAW stored matchUps as well as the in-context ones. In-context reads project
 * provenance into `matchUpStatusCodes` (`projectExitStatusCodes`) and can derive provenance back out
 * of legacy codes (`getSideExitProvenance`), so an assertion on one surface alone cannot tell a field
 * that was cleared from a field that was re-derived on the way out.
 */

const DRAW_ID = 'exitResidueDraw';

function rawMatchUps() {
  const { drawDefinition }: any = tournamentEngine.getEvent({ drawId: DRAW_ID });
  return drawDefinition.structures.flatMap((structure: any) =>
    (structure.matchUps ?? []).map((matchUp: any) => ({ ...matchUp, structureName: structure.structureName })),
  );
}

function contextMatchUps() {
  const { matchUps }: any = tournamentEngine.allDrawMatchUps({ drawId: DRAW_ID, inContext: true });
  return matchUps;
}

const residue = (matchUps: any[]) =>
  matchUps
    .filter((matchUp: any) => matchUp.matchUpStatusCodes?.length || matchUp.sideExitProvenance)
    .map((matchUp: any) => ({
      structureName: matchUp.structureName,
      roundNumber: matchUp.roundNumber,
      roundPosition: matchUp.roundPosition,
      matchUpStatus: matchUp.matchUpStatus,
    }));

const at = (matchUps: any[], structureName: string, roundNumber: number, roundPosition: number) =>
  matchUps.find(
    (matchUp: any) =>
      matchUp.structureName === structureName &&
      matchUp.roundNumber === roundNumber &&
      matchUp.roundPosition === roundPosition,
  );

it('removes exit-propagation residue from a BYE matchUp when a draw is reset', () => {
  // CA's reproduction shape: two byes in a COMPASS 16, and a double exit in the first round
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: COMPASS, drawSize: 16, participantsCount: 14, drawId: DRAW_ID }],
    setState: true,
  });

  const target = at(contextMatchUps(), 'East', 1, 2);
  expect(target).toBeDefined();

  const outcome: any = tournamentEngine.setMatchUpStatus({
    matchUpId: target.matchUpId,
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    drawId: DRAW_ID,
  });
  expect(outcome.success).toBe(true);

  // the residue exists before the reset — otherwise this test would pass on a draw where the
  // propagation never happened at all
  const stampedBefore = residue(rawMatchUps());
  expect(stampedBefore.length).toBeGreaterThan(0);
  expect(stampedBefore.some((m) => m.matchUpStatus === BYE)).toBe(true);

  // the two BYE matchUps CA reported, by coordinate
  const westBefore = at(rawMatchUps(), 'West', 1, 1);
  expect(westBefore.matchUpStatus).toEqual(BYE);
  expect(westBefore.matchUpStatusCodes?.length).toBeGreaterThan(0);
  expect(westBefore.sideExitProvenance?.[2]?.previousMatchUpStatus).toEqual(DOUBLE_WALKOVER);
  const northBefore = at(rawMatchUps(), 'North', 1, 1);
  expect(northBefore.sideExitProvenance?.[1]?.byeClaims?.length).toBeGreaterThan(0);

  const result: any = tournamentEngine.resetDrawDefinition({ drawId: DRAW_ID });
  expect(result.success).toBe(true);

  // nothing anywhere in the draw still describes the exit — on either surface
  expect(residue(rawMatchUps())).toEqual([]);
  expect(residue(contextMatchUps())).toEqual([]);

  // each part of the rule separately, on the matchUp CA pasted
  const west = at(rawMatchUps(), 'West', 1, 1);
  expect(west.matchUpStatusCodes ?? []).toEqual([]);
  expect(west.sideExitProvenance).toBeUndefined();
  // and the BYE itself SURVIVES — it is positioning, not a result
  expect(west.matchUpStatus).toEqual(BYE);

  // the BYE claim ledger goes with it
  expect(at(rawMatchUps(), 'North', 1, 1).sideExitProvenance).toBeUndefined();

  // the draw the user is left with is internally consistent
  const inconsistencies: any = tournamentEngine.getDrawInconsistencies({ drawId: DRAW_ID });
  expect(inconsistencies.inconsistencies).toEqual([]);
  expect(inconsistencies.valid).toBe(true);
});

it('keeps every BYE matchUp a BYE while clearing the residue', () => {
  // the companion half of the rule: the clear must not turn a BYE into TO_BE_PLAYED, which is what
  // routing BYE matchUps through `toBePlayed` would have done
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: COMPASS, drawSize: 16, participantsCount: 14, drawId: DRAW_ID }],
    setState: true,
  });

  const byesBefore = rawMatchUps()
    .filter((matchUp: any) => matchUp.matchUpStatus === BYE)
    .map((matchUp: any) => ({
      structureName: matchUp.structureName,
      roundNumber: matchUp.roundNumber,
      roundPosition: matchUp.roundPosition,
      drawPositions: [...(matchUp.drawPositions ?? [])],
    }));
  expect(byesBefore.length).toBeGreaterThan(0);

  const target = at(contextMatchUps(), 'East', 1, 2);
  tournamentEngine.setMatchUpStatus({
    matchUpId: target.matchUpId,
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    drawId: DRAW_ID,
  });
  tournamentEngine.resetDrawDefinition({ drawId: DRAW_ID });

  // every BYE that existed before the double exit is still a BYE, on the same positions and at the
  // same index — a hole cannot have moved a position onto the other side
  for (const expected of byesBefore) {
    const actual = at(rawMatchUps(), expected.structureName, expected.roundNumber, expected.roundPosition);
    expect(actual).toBeDefined();
    expect(actual.matchUpStatus).toEqual(BYE);
    expected.drawPositions.forEach((drawPosition: number, index: number) => {
      expect(actual.drawPositions?.[index]).toEqual(drawPosition);
    });
  }
});
