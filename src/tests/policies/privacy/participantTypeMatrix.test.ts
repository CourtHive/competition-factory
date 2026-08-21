/**
 * The participantType matrix, and the distinction that is load-bearing and was previously untested:
 *
 *   filtering an ATTRIBUTE must never remove an ENTITY.
 *
 * `teams` is an attribute of an INDIVIDUAL participant — the teams it belongs to — and a policy may
 * deny it. A TEAM participant is an entity, and no policy may make it disappear. The two share a
 * word and nothing else.
 */

import { analysePolicyConformance, describeViolations } from '@Tests/testHarness/privacyConformance';
import { generatePrivacyFixture, GROUP_PARTICIPANT_ID } from '@Tests/testHarness/privacyFixture';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

import POLICY_PRIVACY_DEFAULT from '@Fixtures/policies/POLICY_PRIVACY_DEFAULT';
import { GROUP, INDIVIDUAL, PAIR, TEAM } from '@Constants/participantConstants';
import { POLICY_TYPE_PARTICIPANT } from '@Constants/policyConstants';

const fixture = generatePrivacyFixture();

const countByType = (participants: any[]) =>
  participants.reduce((counts, participant) => {
    counts[participant.participantType] = (counts[participant.participantType] ?? 0) + 1;
    return counts;
  }, {});

/** The same query with no policy at all — the yardstick for "did filtering remove anything". */
const unfiltered = () =>
  tournamentEngine.getParticipants({ withGroupings: true, withIndividualParticipants: true }).participants;

const filtered = (policyDefinitions: any) =>
  tournamentEngine.getParticipants({ policyDefinitions, withGroupings: true, withIndividualParticipants: true })
    .participants;

/** `teams` named explicitly as denied, rather than merely absent from the template. */
function teamsDeniedPolicy() {
  const policy = structuredClone(POLICY_PRIVACY_DEFAULT);
  policy[POLICY_TYPE_PARTICIPANT].participant.teams = false;
  policy[POLICY_TYPE_PARTICIPANT].participant.groups = false;
  return policy;
}

describe('filtering an attribute never removes an entity', () => {
  it.each([
    ['teams absent from the template', POLICY_PRIVACY_DEFAULT],
    ['teams explicitly false', teamsDeniedPolicy()],
  ])('%s: every participantType survives, in the same numbers', (_name, policyDefinitions) => {
    const before = unfiltered();
    const after = filtered(policyDefinitions);

    // control: the fixture actually contains all four types, so the comparison is not between two
    // empty sets
    expect(Object.keys(countByType(before)).sort((a, b) => a.localeCompare(b, 'en'))).toEqual([
      GROUP,
      INDIVIDUAL,
      PAIR,
      TEAM,
    ]);
    expect(countByType(after)).toEqual(countByType(before));
    expect(after.map((p: any) => p.participantId).sort((a, b) => a.localeCompare(b, 'en'))).toEqual(
      before.map((p: any) => p.participantId).sort((a, b) => a.localeCompare(b, 'en')),
    );
  });

  it.each([
    ['teams absent from the template', POLICY_PRIVACY_DEFAULT],
    ['teams explicitly false', teamsDeniedPolicy()],
  ])('%s: the `teams` / `groups` ATTRIBUTE is gone from individuals', (_name, policyDefinitions) => {
    const before = unfiltered().filter((p: any) => p.participantType === INDIVIDUAL);
    const after = filtered(policyDefinitions).filter((p: any) => p.participantType === INDIVIDUAL);

    // control: without a policy the attribute is populated, so its absence below means something
    expect(before.filter((p: any) => p.teams?.length).length).toBeGreaterThan(0);
    expect(before.filter((p: any) => p.groups?.length).length).toBeGreaterThan(0);

    expect(after.filter((p: any) => p.teams !== undefined)).toEqual([]);
    expect(after.filter((p: any) => p.groups !== undefined)).toEqual([]);
  });

  it('the GROUP participant is still addressable after its members are filtered', () => {
    const after = filtered(POLICY_PRIVACY_DEFAULT);
    const group = after.find((p: any) => p.participantId === GROUP_PARTICIPANT_ID);
    expect(group?.participantType).toEqual(GROUP);
    expect(group?.individualParticipantIds?.length).toBeGreaterThan(0);
  });
});

describe('nested individualParticipants are governed', () => {
  /**
   * A policy strictly stricter on `individualParticipants` than at the top level. If a surface applied
   * the TOP-LEVEL template to nested individuals — an easy and invisible mistake — the nested people
   * would carry a family name the policy denies them while the outer participants correctly did not.
   */
  function strictNestedPolicy() {
    const policy = structuredClone(POLICY_PRIVACY_DEFAULT);
    policy[POLICY_TYPE_PARTICIPANT].participant.individualParticipants.person.standardFamilyName = false;
    return policy;
  }

  it.each([
    ['getParticipants', () => filtered(strictNestedPolicy())],
    [
      'matchUp sides',
      () =>
        tournamentEngine.allTournamentMatchUps({ policyDefinitions: strictNestedPolicy(), inContext: true }).matchUps,
    ],
  ])('%s applies the individualParticipants sub-template, not the top-level one', (_name, invoke) => {
    const nested: any[] = [];
    const outer: any[] = [];
    const walk = (node: any, insideIndividuals: boolean) => {
      if (Array.isArray(node)) return node.forEach((member) => walk(member, insideIndividuals));
      if (!node || typeof node !== 'object') return;
      if (node.person && node.participantId) (insideIndividuals ? nested : outer).push(node);
      for (const [key, value] of Object.entries(node)) {
        walk(value, insideIndividuals || key === 'individualParticipants');
      }
    };
    walk(invoke(), false);

    // controls: both populations exist, and the outer one still carries the attribute
    expect(nested.length).toBeGreaterThan(0);
    expect(outer.length).toBeGreaterThan(0);
    expect(outer.filter((p) => p.person?.standardFamilyName !== undefined).length).toBeGreaterThan(0);

    expect(nested.filter((p) => p.person?.standardFamilyName !== undefined)).toEqual([]);
  });
});

describe('every participantType is scanned by the general check', () => {
  it('reports no violation for any type, having examined all of them', () => {
    const node = filtered(POLICY_PRIVACY_DEFAULT);
    const analysis = analysePolicyConformance({
      participants: fixture.hydratedParticipants,
      policyDefinitions: POLICY_PRIVACY_DEFAULT,
      node,
    });
    expect(analysis.unpermitted.participantsScanned).toBeGreaterThanOrEqual(node.length);
    expect(describeViolations(analysis)).toEqual([]);
  });
});
