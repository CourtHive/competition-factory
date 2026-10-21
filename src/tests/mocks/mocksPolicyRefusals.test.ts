import { POLICY_SANCTIONING_USTA } from '@Fixtures/policies/POLICY_SANCTIONING_USTA';
import POLICY_DRAWS_DEFAULT from '@Fixtures/policies/POLICY_DRAWS_DEFAULT';
import POLICY_SCORING_USTA from '@Fixtures/policies/POLICY_SCORING_USTA';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { POLICY_TYPE_DRAWS, POLICY_TYPE_SANCTIONING, POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

/**
 * A policy that `attachPolicies` refuses refuses the generation, naming the policy type. The refusal was discarded:
 * generation succeeded without the policy, and a bare policy body passed as `policyDefinitions` (a sanctioning
 * fixture) attached its own fields as policy types.
 */
describe('mocksEngine policyDefinitions', () => {
  // the type refuses a bare body too; the runtime refusal is for a caller the types do not reach
  it('refuses a bare policy body passed as policyDefinitions', () => {
    const result: any = mocksEngine.generateTournamentRecord({ policyDefinitions: POLICY_SANCTIONING_USTA as any });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.option).toEqual('policyDefinitions.policyName');
  });

  it('attaches the same body under its policy type', () => {
    const result: any = mocksEngine.generateTournamentRecord({
      policyDefinitions: { [POLICY_TYPE_SANCTIONING]: POLICY_SANCTIONING_USTA },
      setState: true,
    });
    expect(result.success).toEqual(true);
    const { appliedPolicies } = tournamentEngine.getAppliedPolicies();
    expect(appliedPolicies[POLICY_TYPE_SANCTIONING].policyName).toEqual(POLICY_SANCTIONING_USTA.policyName);
  });

  it('refuses a policy with no values', () => {
    const result: any = mocksEngine.generateTournamentRecord({
      policyDefinitions: { ...POLICY_SCORING_USTA, [POLICY_TYPE_DRAWS]: {} },
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.option).toEqual('policyDefinitions.draws');
  });

  it('refuses policyDefinitions that are not an object', () => {
    const result: any = mocksEngine.generateTournamentRecord({ policyDefinitions: 'USTA' as any });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.option).toEqual('policyDefinitions');
  });

  it('treats an undefined policy as absent', () => {
    const result: any = mocksEngine.generateTournamentRecord({
      policyDefinitions: { ...POLICY_SCORING_USTA, [POLICY_TYPE_DRAWS]: undefined },
      setState: true,
    });
    expect(result.success).toEqual(true);
    const { appliedPolicies } = tournamentEngine.getAppliedPolicies();
    expect(Object.keys(appliedPolicies)).toEqual([POLICY_TYPE_SCORING]);
  });

  it('attaches POLICY_DRAWS_DEFAULT', () => {
    const result: any = mocksEngine.generateTournamentRecord({
      policyDefinitions: POLICY_DRAWS_DEFAULT,
      setState: true,
    });
    expect(result.success).toEqual(true);
    const { appliedPolicies } = tournamentEngine.getAppliedPolicies();
    expect(appliedPolicies[POLICY_TYPE_DRAWS]).toEqual(POLICY_DRAWS_DEFAULT[POLICY_TYPE_DRAWS]);
  });

  it('refuses an eventProfile policy, naming the eventProfile', () => {
    const result: any = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ drawProfiles: [{ drawSize: 4 }] }, { policyDefinitions: { [POLICY_TYPE_DRAWS]: {} } }],
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.option).toEqual('eventProfiles[1].policyDefinitions.draws');
  });

  it('modifyTournamentRecord names the eventProfile, not the position the new event would take', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });
    const result: any = mocksEngine.modifyTournamentRecord({
      eventProfiles: [{ eventName: 'New', policyDefinitions: POLICY_SANCTIONING_USTA as any }],
      tournamentRecord,
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.option).toEqual('eventProfiles[0].policyDefinitions.policyName');
  });
});

describe('generateDrawDefinition policyDefinitions', () => {
  it('refuses a policy that attachPolicies refuses', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ participantsProfile: { participantsCount: 8 } }],
      setState: true,
    });

    let result: any = tournamentEngine.generateDrawDefinition({
      policyDefinitions: { [POLICY_TYPE_DRAWS]: {} },
      eventId,
    });
    expect(result.error).toEqual(INVALID_VALUES);

    result = tournamentEngine.generateDrawDefinition({ policyDefinitions: POLICY_DRAWS_DEFAULT, eventId });
    expect(result.success).toEqual(true);
    expect(result.drawDefinition.extensions.find((e) => e.name === 'appliedPolicies').value[POLICY_TYPE_DRAWS]).toEqual(
      POLICY_DRAWS_DEFAULT[POLICY_TYPE_DRAWS],
    );
  });

  it('refuses a drawProfile policy in the mocksEngine', () => {
    const result: any = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, policyDefinitions: { [POLICY_TYPE_DRAWS]: {} } }],
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });
});
