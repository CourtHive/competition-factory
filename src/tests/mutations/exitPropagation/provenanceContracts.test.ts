import { propagateUnfillableLoserBye } from '@Mutate/matchUps/drawPositions/propagateUnfillableLoserBye';
import { reconcileDecider } from '@Mutate/matchUps/matchUpStatus/reconcileDecider';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';
import {
  deriveExitStateFromProvenance,
  withdrawProducedExits,
  withdrawByeClaimsFrom,
  clearSideExitProvenance,
  mergeSideExitProvenance,
  withdrawByeClaim,
  policyCodeString,
  byeClaimSurvives,
  recordByeClaim,
  exitProducedBy,
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
    expect(mergeSideExitProvenance({ matchUp: undefined as any, provenance: { 1: carried } as any })).toBeUndefined();
  });

  it('clearSideExitProvenance', () => {
    expect(clearSideExitProvenance(undefined)).toBeUndefined();
  });

  it('recordByeClaim refuses a side that is not 1 or 2', () => {
    const matchUp: any = { matchUpId: 'm' };
    recordByeClaim({ matchUp, claimantMatchUpId: 'claimant', sideNumber: 3 });
    recordByeClaim({ matchUp, claimantMatchUpId: undefined, sideNumber: 1 });
    recordByeClaim({ matchUp: undefined, claimantMatchUpId: 'claimant', sideNumber: 1 });
    expect(matchUp.sideExitProvenance).toBeUndefined();

    // CONTROL: the same call with a side that exists does write
    recordByeClaim({ matchUp, claimantMatchUpId: 'claimant', sideNumber: 1 });
    expect(matchUp.sideExitProvenance?.[1]?.byeClaims).toEqual(['claimant']);
  });

  it('withdrawByeClaimsFrom with no claimant leaves every claim where it is', () => {
    const matchUp: any = { matchUpId: 'm', sideExitProvenance: { 1: { byeClaims: ['claimant'] } } };
    withdrawByeClaimsFrom({ claimantMatchUpId: undefined, matchUps: [matchUp] });
    expect(matchUp.sideExitProvenance[1].byeClaims).toEqual(['claimant']);
  });
});

describe('withdrawing a claim keeps what else the side records', () => {
  it('drops the ledger and keeps the origin when the last claim goes', () => {
    const matchUp: any = { matchUpId: 'm', sideExitProvenance: { 1: { ...carried, byeClaims: ['claimant'] } } };
    withdrawByeClaim({ matchUp, claimantMatchUpId: 'claimant', sideNumber: 1 });
    expect(matchUp.sideExitProvenance).toEqual({ 1: carried });
  });

  it('drops the side when the claim was all it held', () => {
    const matchUp: any = { matchUpId: 'm', sideExitProvenance: { 1: { byeClaims: ['claimant'] }, 2: carried } };
    withdrawByeClaim({ matchUp, claimantMatchUpId: 'claimant', sideNumber: 1 });
    expect(matchUp.sideExitProvenance).toEqual({ 2: carried });
  });
});

describe('a provenance read with nothing to read answers no', () => {
  it('byeClaimSurvives', () => {
    const isStillDoubleExit = () => true;
    expect(byeClaimSurvives({ matchUp: undefined, sideNumber: 1, isStillDoubleExit })).toEqual(false);
    expect(byeClaimSurvives({ matchUp: { matchUpId: 'm' } as any, sideNumber: 3, isStillDoubleExit })).toEqual(false);
  });

  it('deriveExitStateFromProvenance', () => {
    expect(deriveExitStateFromProvenance(undefined)).toBeUndefined();
  });

  it('exitProducedBy', () => {
    const matchUp: any = { matchUpId: 'm', sideExitProvenance: { 1: carried } };
    expect(exitProducedBy({ sourceMatchUpId: undefined, matchUp })).toEqual(false);
    // CONTROL: and it can say yes
    expect(exitProducedBy({ sourceMatchUpId: 'source', matchUp })).toEqual(true);
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
    expect(reconcileDecider({})).toBeUndefined();
    expect(reconcileDecider({ matchUpId: 'm' })).toBeUndefined();
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
