import { expect, test, describe } from 'vitest';

import { getMatchUpStatusScopeViolation } from '@Query/matchUps/getMatchUpStatusScopeViolation';
import { isAdHocType } from '@Query/drawDefinition/isAdHocType';
import { isLadder } from '@Query/drawDefinition/isLadder';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

import { matchUpStatusScopes } from '@Constants/matchUpStatusScopes';
import { MATCHUP_STATUS_OUT_OF_SCOPE } from '@Constants/errorConditionConstants';
import { AD_HOC, LADDER, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { CHALLENGED, COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import {
  nonDirectingMatchUpStatuses,
  participantsRequiredMatchUpStatuses,
  upcomingMatchUpStatuses,
  validMatchUpStatuses,
} from '@Constants/matchUpStatusConstants';

describe('LADDER shares the AD_HOC structure shape without sharing its meaning', () => {
  test('a ladder is an adHoc TYPE — which is what buys it the behaviour it needs', () => {
    // AD_HOC here means a structure shape: matchUps with neither roundPosition nor drawPosition.
    // That gates no-drawSize-required, no stage capacity, and direct side assignment.
    expect(isAdHocType(LADDER)).toEqual(true);
    expect(isAdHocType(AD_HOC)).toEqual(true);
    expect(isAdHocType(SINGLE_ELIMINATION)).toEqual(false);
  });

  test('but a ladder is distinguishable, because its positionAssignments are an ORDERING', () => {
    // An AD_HOC draw's positionAssignments are a roster; a ladder's are a standing. Anything that
    // needs that difference must ask isLadder, not isAdHocType.
    expect(isLadder(LADDER)).toEqual(true);
    expect(isLadder(AD_HOC)).toEqual(false);
    expect(isLadder(undefined)).toEqual(false);
  });
});

describe('CHALLENGED joins the vocabulary in the right groups', () => {
  test('it is valid, and it requires participants', () => {
    // A challenge names both participants at the moment it is issued.
    expect(validMatchUpStatuses).toContain(CHALLENGED);
    expect(participantsRequiredMatchUpStatuses).toContain(CHALLENGED);
  });

  test('it directs nobody — a ladder has no next matchUp to direct into', () => {
    expect(nonDirectingMatchUpStatuses).toContain(CHALLENGED);
  });

  test('it is UPCOMING, which widens that group from "will happen" to "is expected to"', () => {
    // Deliberate: a challenge can be declined or expire. Excluding it would hide every outstanding
    // challenge from exactly the people who must act on it.
    expect(upcomingMatchUpStatuses).toContain(CHALLENGED);
    expect(upcomingMatchUpStatuses).toContain(TO_BE_PLAYED);
  });
});

describe('the scope mechanism is general, not a LADDER special case', () => {
  test('an unscoped status is unaffected in every context', () => {
    // This is what lets the check be called unconditionally without changing existing behaviour.
    for (const drawType of [SINGLE_ELIMINATION, AD_HOC, LADDER, undefined]) {
      expect(getMatchUpStatusScopeViolation({ matchUpStatus: COMPLETED, drawType })).toBeUndefined();
    }
    expect(matchUpStatusScopes[COMPLETED]).toBeUndefined();
  });

  test('CHALLENGED is refused outside a LADDER and allowed inside one', () => {
    expect(getMatchUpStatusScopeViolation({ matchUpStatus: CHALLENGED, drawType: LADDER })).toBeUndefined();
    expect(getMatchUpStatusScopeViolation({ matchUpStatus: CHALLENGED, drawType: SINGLE_ELIMINATION })).toMatch(
      /requires drawType LADDER/,
    );
  });

  test('missing context permits rather than refuses', () => {
    // Refusing on absent drawType would reject callers that never supplied one and have worked for
    // years. The check catches a status used where it cannot mean anything, not missing context.
    expect(getMatchUpStatusScopeViolation({ matchUpStatus: CHALLENGED, drawType: undefined })).toBeUndefined();
  });

  test('the map carries a reason, so a violation explains itself', () => {
    expect(matchUpStatusScopes[CHALLENGED]?.reason).toMatch(/participant created/);
  });
});

describe('the scope is ENFORCED, which DEAD_RUBBER never was', () => {
  test('setMatchUpStatus refuses CHALLENGED in an elimination draw', () => {
    // The whole point of D3: DEAD_RUBBER is scoped by convention and nothing stops it being set on
    // a singles matchUp in an elimination draw. CHALLENGED is the first status that cannot be.
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });
    const { drawId } = tournamentRecord.events[0].drawDefinitions[0];
    const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const matchUpId = matchUps[0].matchUpId;

    // NOTE: the status travels inside `outcome`. Passed top-level it is silently ignored and the
    // call succeeds as a no-op — which is how the first version of this test passed vacuously.
    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: CHALLENGED },
      matchUpId,
      drawId,
    });

    expect(result.error).toEqual(MATCHUP_STATUS_OUT_OF_SCOPE);
    expect(result.info).toMatch(/requires drawType LADDER/);
  });

  test('an ordinary status in the same draw is untouched', () => {
    // Guards against the check being over-eager: nothing existing may change behaviour.
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });
    const { drawId } = tournamentRecord.events[0].drawDefinitions[0];
    const matchUpId = tournamentEngine.allTournamentMatchUps().matchUps[0].matchUpId;

    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: TO_BE_PLAYED },
      matchUpId,
      drawId,
    });
    expect(result.error).toBeUndefined();
    expect(result.success).toEqual(true);
  });
});
