import { propagateUnfillableLoserBye } from '@Mutate/matchUps/drawPositions/propagateUnfillableLoserBye';
import { reconcileDecider } from '@Mutate/matchUps/matchUpStatus/reconcileDecider';
import { byeSeatStands } from '@Mutate/matchUps/matchUpStatus/feederSendsNobody';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';
import {
  deriveExitStateFromProvenance,
  withdrawProducedExits,
  clearSideExitProvenance,
  mergeSideExitProvenance,
  policyCodeString,
  exitCarriedFrom,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

// constants
import { DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * WHAT THE PROVENANCE FUNCTIONS DO WHEN THEY ARE HANDED NOTHING.
 *
 * Every one of these is called from a cascade, with whatever the cascade has in hand. A function
 * that throws on a missing matchUp turns one matchUp the cascade could not find into a mutation
 * that failed half-way, so each of them declines quietly — and until now nothing pinned that they
 * do. These are the contracts, one per function, asserted on what is RETURNED or LEFT UNTOUCHED.
 */

const carried = { previousMatchUpStatus: DOUBLE_WALKOVER, matchUpStatus: WALKOVER, sourceMatchUpId: 'source' };

describe('a provenance write with nothing to write to changes nothing', () => {
  it('mergeSideExitProvenance', () => {
    // it reports whether it wrote, so a caller can announce what it changed
    expect(mergeSideExitProvenance({ matchUp: undefined as any, provenance: { 1: carried } as any })).toBe(false);

    // CONTROL: the same call with a matchUp to write to does write, and says so
    const matchUp: any = { matchUpId: 'm' };
    expect(mergeSideExitProvenance({ matchUp, provenance: { 1: carried } as any })).toBe(true);
    expect(matchUp.sideExitProvenance).toEqual({ 1: carried });
  });

  it('clearSideExitProvenance', () => {
    expect(clearSideExitProvenance(undefined)).toBeUndefined();
  });
});

describe('a provenance read with nothing to read answers no', () => {
  it('byeSeatStands', () => {
    const drawDefinition: any = { drawId: 'd', structures: [] };
    expect(byeSeatStands({ drawDefinition, structureId: undefined, drawPosition: 1 })).toEqual(false);
    expect(byeSeatStands({ drawDefinition, structureId: 's', drawPosition: undefined })).toEqual(false);
    expect(byeSeatStands({ drawDefinition, structureId: 's', drawPosition: 1 })).toEqual(false);
  });

  it('deriveExitStateFromProvenance', () => {
    expect(deriveExitStateFromProvenance(undefined)).toBeUndefined();
  });

  it('exitCarriedFrom', () => {
    const matchUp: any = { matchUpId: 'm', sideExitProvenance: { 1: carried } };
    expect(exitCarriedFrom({ sourceMatchUpId: undefined, matchUp })).toEqual(false);
    // CONTROL: and it can say yes
    expect(exitCarriedFrom({ sourceMatchUpId: 'source', matchUp })).toEqual(true);
  });

  it('withdrawProducedExits', () => {
    expect(withdrawProducedExits({ sourceMatchUpId: undefined, mappedMatchUps: {} as any })).toEqual([]);
    expect(withdrawProducedExits({ sourceMatchUpId: 'source', mappedMatchUps: undefined })).toEqual([]);
  });

  it('propagateUnfillableLoserBye', () => {
    expect(propagateUnfillableLoserBye({ matchUpId: undefined } as any)).toBeUndefined();
  });
});

describe('policyCodeString reads the policy code and nothing else', () => {
  it('returns a string as it is, and an empty one as nothing', () => {
    expect(policyCodeString('DM')).toEqual('DM');
    expect(policyCodeString('')).toBeUndefined();
  });

  it('reads the code out of a record an earlier version stored', () => {
    expect(policyCodeString({ code: 'DM' })).toEqual('DM');
    expect(policyCodeString({ matchUpStatusCode: 'OA' })).toEqual('OA');
  });

  it('does not read a carried exit as a policy code', () => {
    expect(
      policyCodeString({ sideNumber: 1, matchUpStatus: WALKOVER, previousMatchUpStatus: DOUBLE_WALKOVER }),
    ).toBeUndefined();
  });
});

describe('reconcileDecider leaves the decider alone unless a final that feeds one has changed', () => {
  const decider = () =>
    (tournamentEngine.allTournamentMatchUps().matchUps ?? []).find((m: any) => m.structureName === 'Decider');
  const drawDefinition = () => tournamentEngine.getEvent({ drawId: 'd' }).drawDefinition;
  const generate = () =>
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId: 'd', drawType: DOUBLE_ELIMINATION, drawSize: 8 }],
      setState: true,
    });

  it('does nothing without a draw or a matchUp', () => {
    expect(reconcileDecider({}).success).toEqual(true);
    expect(reconcileDecider({ matchUpId: 'm' }).success).toEqual(true);
  });

  it('does nothing for a matchUp that feeds no decider', () => {
    generate();
    const first: any = (tournamentEngine.allTournamentMatchUps().matchUps ?? []).find(
      (m: any) => m.structureName === 'Main' && m.roundNumber === 1,
    );
    reconcileDecider({ drawDefinition: drawDefinition(), matchUpId: first.matchUpId, winningSideBefore: 1 });
    expect(decider().matchUpStatus).toEqual(TO_BE_PLAYED);
  });

  it('does nothing for a final whose winner is what it was', () => {
    generate();
    const final: any = (tournamentEngine.allTournamentMatchUps().matchUps ?? []).find(
      (m: any) => m.structureName === 'Main' && m.roundNumber === 4,
    );
    reconcileDecider({ drawDefinition: drawDefinition(), matchUpId: final.matchUpId, winningSideBefore: undefined });
    expect(decider().matchUpStatus).toEqual(TO_BE_PLAYED);
  });
});
