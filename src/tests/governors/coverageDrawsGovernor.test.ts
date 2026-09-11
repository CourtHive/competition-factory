// Coverage tests for 8 draws-governor methods.

// Generators
import { generateDrawStructuresAndLinks } from '@Generators/drawDefinitions/generateDrawStructuresAndLinks';
import { getDrawTypeCoercion } from '@Generators/drawDefinitions/getDrawTypeCoercion';
import { addFinishingRounds } from '@Generators/drawDefinitions/addFinishingRounds';
import { newDrawDefinition } from '@Generators/drawDefinitions/newDrawDefinition';
import { MISSING_MATCHUPS } from '@Constants/errorConditionConstants';

// Query
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { addGoesTo } from '@Query/matchUps/addGoesTo';

// Engines
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// Testing
import { expect, it, describe } from 'vitest';

// Constants
import { AD_HOC, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_DRAWS } from '@Constants/policyConstants';

// ----------------------------------------------------------------
// 1. addFinishingRounds
// ----------------------------------------------------------------
describe('addFinishingRounds', () => {
  it('adds finishingRound data to matchUps from a draw', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structure = drawDefinition.structures[0];
    const matchUps = structure.matchUps;

    let result: any = addFinishingRounds({ matchUps });
    expect(result.length).toBeGreaterThan(0);

    const finalMatchUp = result.find((m) => m.roundNumber === 3);
    expect(finalMatchUp?.finishingRound).toBe(1);
  });

  it('REFUSES invalid matchUps input rather than returning an empty array', () => {
    // `[]` was the fail-open: the shape a caller naturally writes is
    // `matchUps = addFinishingRounds({ matchUps })`, so an empty return silently replaced their list.
    let result: any = addFinishingRounds({ matchUps: undefined as any });
    expect(result.error).toEqual(MISSING_MATCHUPS);

    // the engine-idiomatic call, which supplies no matchUps at all
    result = addFinishingRounds({ drawId: 'd1' } as any);
    expect(result.error).toEqual(MISSING_MATCHUPS);
  });

  it('mutates in place and returns the SAME reference — the contract consumers rely on', () => {
    // courthive-rankings calls this for its side effect and ignores the return, backfilling
    // finishingPositionRange on externally-authored records. The four generators inside the factory
    // reassign from the return, which is a no-op for the same reason. Both depend on this.
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }], setState: true });
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const matchUps = drawDefinition.structures[0].matchUps;
    matchUps.forEach((matchUp: any) => {
      delete matchUp.finishingPositionRange;
      delete matchUp.finishingRound;
    });

    const result: any = addFinishingRounds({ matchUps });
    expect(result).toBe(matchUps); // same reference, not a copy
    expect(matchUps.every((matchUp: any) => matchUp.finishingPositionRange)).toEqual(true);
  });
});

// ----------------------------------------------------------------
// 2. addGoesTo
// ----------------------------------------------------------------
describe('addGoesTo', () => {
  it('adds winnerMatchUpId/loserMatchUpId to draw matchUps', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    let result: any = addGoesTo({ drawDefinition });

    expect(result.inContextDrawMatchUps).toBeDefined();
    expect(result.inContextDrawMatchUps.length).toBeGreaterThan(0);
    expect(result.goesToMap).toBeDefined();

    // First-round matchUps should have winnerMatchUpId
    const firstRound = result.inContextDrawMatchUps.filter((m) => m.roundNumber === 1);
    expect(firstRound.every((m) => m.winnerMatchUpId)).toBe(true);
  });

  it('returns error for missing drawDefinition', () => {
    let result: any = addGoesTo({ drawDefinition: undefined as any });
    expect(result.error).toBe(MISSING_DRAW_DEFINITION);
  });
});

// ----------------------------------------------------------------
// 3. generateDrawMaticRound
// ----------------------------------------------------------------
describe('generateDrawMaticRound', () => {
  it('generates a round in an AD_HOC draw', () => {
    const {
      drawIds: [drawId],
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: AD_HOC }],
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;

    const { event } = tournamentEngine.getEvent({ eventId });
    const participantIds = event.entries.map((e) => e.participantId);

    let result: any = tournamentEngine.generateDrawMaticRound({
      participantIds,
      structureId,
      drawId,
    });

    expect(result.success).toBe(true);
  });
});

// ----------------------------------------------------------------
// 4. generateDrawStructuresAndLinks
// ----------------------------------------------------------------
describe('generateDrawStructuresAndLinks', () => {
  it('generates structures for a basic SE draw', () => {
    const drawDefinition = newDrawDefinition();
    let result: any = generateDrawStructuresAndLinks({
      drawType: SINGLE_ELIMINATION,
      drawDefinition,
      drawSize: 8,
    });

    expect(result.success).toBe(true);
    expect(result.structures?.length).toBeGreaterThan(0);
  });
});

// ----------------------------------------------------------------
// 5. getAssignedParticipantIds
// ----------------------------------------------------------------
describe('getAssignedParticipantIds', () => {
  it('returns participantIds assigned to draw positions', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      setState: true,
    });

    let result: any = tournamentEngine.getAssignedParticipantIds({ drawId });
    expect(result.assignedParticipantIds).toBeDefined();
    expect(result.assignedParticipantIds.length).toBe(8);
  });
});

// ----------------------------------------------------------------
// 6. getDrawTypeCoercion
// ----------------------------------------------------------------
describe('getDrawTypeCoercion', () => {
  it('returns true by default when no policy is set', () => {
    let result: any = getDrawTypeCoercion({});
    expect(result).toBe(true);
  });

  it('returns false when policy disables coercion', () => {
    const policyDefinitions = {
      [POLICY_TYPE_DRAWS]: { drawTypeCoercion: false },
    };
    let result: any = getDrawTypeCoercion({ policyDefinitions });
    expect(result).toBe(false);
  });

  it('respects per-drawType policy', () => {
    const policyDefinitions = {
      [POLICY_TYPE_DRAWS]: { drawTypeCoercion: { [SINGLE_ELIMINATION]: false } },
    };
    let result: any = getDrawTypeCoercion({ policyDefinitions, drawType: SINGLE_ELIMINATION });
    expect(result).toBe(false);
  });
});

// ----------------------------------------------------------------
// 7. isAdHoc
// ----------------------------------------------------------------
describe('isAdHoc', () => {
  it('returns true for an AD_HOC structure', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: AD_HOC }],
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structure = drawDefinition.structures[0];

    expect(isAdHoc({ structure })).toBe(true);
  });

  it('returns false for a SINGLE_ELIMINATION structure', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structure = drawDefinition.structures[0];

    expect(isAdHoc({ structure })).toBe(false);
  });
});

// ----------------------------------------------------------------
// 8. withdrawParticipantAtDrawPosition
// ----------------------------------------------------------------
describe('withdrawParticipantAtDrawPosition', () => {
  it('withdraws a participant at a given draw position', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;

    let result: any = tournamentEngine.withdrawParticipantAtDrawPosition({
      drawPosition: 1,
      structureId,
      drawId,
    });

    expect(result.success).toBe(true);

    // Verify the participant is withdrawn by checking assignments
    const { assignedParticipantIds } = tournamentEngine.getAssignedParticipantIds({ drawId });
    expect(assignedParticipantIds.length).toBe(7);
  });
});
