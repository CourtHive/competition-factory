import { POLICY_SANCTIONING_USTA } from '@Fixtures/policies/POLICY_SANCTIONING_USTA';
import POLICY_DRAWS_DEFAULT from '@Fixtures/policies/POLICY_DRAWS_DEFAULT';
import POLICY_SCORING_USTA from '@Fixtures/policies/POLICY_SCORING_USTA';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { POLICY_TYPE_DRAWS, POLICY_TYPE_SANCTIONING, POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { EXISTING_POLICY_TYPE, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { WALKOVER } from '@Constants/matchUpStatusConstants';

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

/**
 * An existing event's eventProfile `policyDefinitions` were accepted by the key check and never read. They now replace
 * the event's own policies, but only while nothing has happened under them (CA 2026-10-21): replacing a policy after
 * results would lose the record of the policy those results were produced under.
 */
describe('modifyTournamentRecord: an existing event', () => {
  const POLICY_A = { [POLICY_TYPE_SCORING]: { policyName: 'A', requireParticipantsForScoring: false } };
  const POLICY_B = { [POLICY_TYPE_SCORING]: { policyName: 'B', requireParticipantsForScoring: true } };

  function eventPolicies(tournamentRecord) {
    const extension = tournamentRecord.events[0].extensions?.find((e) => e.name === 'appliedPolicies');
    return extension?.value ?? {};
  }

  function generate(eventProfile = {}) {
    return mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventName: 'E', drawProfiles: [{ drawSize: 4 }], ...eventProfile }],
    }).tournamentRecord;
  }

  it('attaches a policy type the event does not hold', () => {
    const tournamentRecord = generate();
    const result: any = mocksEngine.modifyTournamentRecord({
      eventProfiles: [{ eventName: 'E', policyDefinitions: POLICY_A }],
      tournamentRecord,
    });
    expect(result.success).toEqual(true);
    expect(eventPolicies(tournamentRecord)[POLICY_TYPE_SCORING].policyName).toEqual('A');
  });

  it('replaces a policy the event holds while nothing has happened under it', () => {
    const tournamentRecord = generate({ policyDefinitions: POLICY_A });
    const result: any = mocksEngine.modifyTournamentRecord({
      eventProfiles: [{ eventName: 'E', policyDefinitions: POLICY_B }],
      tournamentRecord,
    });
    expect(result.success).toEqual(true);
    expect(eventPolicies(tournamentRecord)[POLICY_TYPE_SCORING].policyName).toEqual('B');
  });

  it('refuses to replace a policy once the event has results, and changes nothing', () => {
    const tournamentRecord = generate({ policyDefinitions: POLICY_A, completeAllMatchUps: true });
    const result: any = mocksEngine.modifyTournamentRecord({
      eventProfiles: [{ eventName: 'E', policyDefinitions: POLICY_B, drawProfiles: [{ drawSize: 4 }] }],
      tournamentRecord,
    });
    expect(result.error).toEqual(EXISTING_POLICY_TYPE);
    expect(result.context.option).toEqual('eventProfiles[0].policyDefinitions.scoring');
    expect(eventPolicies(tournamentRecord)[POLICY_TYPE_SCORING].policyName).toEqual('A');
    expect(tournamentRecord.events[0].drawDefinitions.length).toEqual(1);
  });

  it('counts a walkover as a result', () => {
    const tournamentRecord = generate({
      matchUpStatusProfile: { [WALKOVER]: 100 },
      policyDefinitions: POLICY_A,
      completeAllMatchUps: true,
    });
    const result: any = mocksEngine.modifyTournamentRecord({
      eventProfiles: [{ eventName: 'E', policyDefinitions: POLICY_B }],
      tournamentRecord,
    });
    expect(result.error).toEqual(EXISTING_POLICY_TYPE);
  });

  it('attaches a new policy type to an event with results', () => {
    const tournamentRecord = generate({ policyDefinitions: POLICY_A, completeAllMatchUps: true });
    const result: any = mocksEngine.modifyTournamentRecord({
      eventProfiles: [{ eventName: 'E', policyDefinitions: POLICY_DRAWS_DEFAULT }],
      tournamentRecord,
    });
    expect(result.success).toEqual(true);
    expect(Object.keys(eventPolicies(tournamentRecord)).sort()).toEqual([POLICY_TYPE_DRAWS, POLICY_TYPE_SCORING]);
  });
});
