import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

/**
 * A policy must hold a defined attribute besides its policyName (building-a-tournament.md § 6.3, CA 2026-10-29): an
 * attribute whose value is undefined is not stored, so a policy holding only such attributes would read back as its
 * name alone, which is refused.
 */
test('a policy whose only other attributes are undefined is refused, and nothing is attached', () => {
  tournamentEngine.setState(tournamentEngine.newTournamentRecord());
  const before = tournamentEngine.getTournament().tournamentRecord.extensions;
  let result: any = tournamentEngine.attachPolicies({
    policyDefinitions: { avoidance: { policyName: 'DEFINED_ONLY', roundsToSeparate: undefined } },
  });
  expect(result.error).toEqual(INVALID_VALUES);
  expect(tournamentEngine.getTournament().tournamentRecord.extensions ?? []).toEqual(before ?? []);

  // CONTROL: one defined attribute, beside an undefined one, is a policy
  result = tournamentEngine.attachPolicies({
    policyDefinitions: { avoidance: { policyName: 'DEFINED_ONLY', roundsToSeparate: undefined, policyAttributes: [] } },
  });
  expect(result.success).toEqual(true);
});
