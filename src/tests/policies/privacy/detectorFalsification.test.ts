/**
 * The check on the check.
 *
 * A conformance suite that cannot report "dirty" is worth exactly nothing, and looks identical to one
 * that passes. Every detector in `privacyConformance.ts` is fed a known-bad input here and required to
 * fire, and a known-good input and required to stay silent. The saturation control gets the same
 * treatment: it must fail when the fixture stops holding a value for something the policy denies.
 */

import { uncoveredDeniedPaths, templateDeniedPaths } from '@Tests/testHarness/privacySaturation';
import { generatePrivacyFixture } from '@Tests/testHarness/privacyFixture';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';
import {
  collectUnpermittedAttributes,
  analysePolicyConformance,
  scanForForbiddenData,
  describeViolations,
  deriveForbiddenData,
  participantTemplate,
} from '@Tests/testHarness/privacyConformance';

// constants and types
import POLICY_PRIVACY_DEFAULT from '@Fixtures/policies/POLICY_PRIVACY_DEFAULT';
import { POLICY_TYPE_PARTICIPANT } from '@Constants/policyConstants';

const fixture = generatePrivacyFixture();
const template = participantTemplate(POLICY_PRIVACY_DEFAULT);

const clean = () =>
  tournamentEngine.getParticipants({ policyDefinitions: POLICY_PRIVACY_DEFAULT, withGroupings: true }).participants;

describe('deriveForbiddenData', () => {
  it('finds what the policy removes, and nothing it permits', () => {
    const forbidden = deriveForbiddenData({ participants: fixture.hydratedParticipants, template });
    const attributes = new Set(forbidden.map((datum) => datum.attribute));

    expect(attributes.has('sex')).toEqual(true);
    expect(attributes.has('birthDate')).toEqual(true);
    expect(attributes.has('personId')).toEqual(true);
    // permitted attributes must NOT be treated as forbidden, or every response would look dirty
    expect(attributes.has('standardFamilyName')).toEqual(false);
    expect(attributes.has('participantId')).toEqual(false);
    expect(attributes.has('nationalityCode')).toEqual(false);
  });

  it('returns nothing when no policy is supplied — absence of a policy is not a denial', () => {
    expect(deriveForbiddenData({ participants: fixture.hydratedParticipants, template: undefined })).toEqual([]);
  });
});

describe('scanForForbiddenData', () => {
  const forbidden = deriveForbiddenData({ participants: fixture.hydratedParticipants, template });

  it('stays silent on a filtered response', () => {
    const result = scanForForbiddenData({ node: clean(), forbidden });
    expect(result.objectsScanned).toBeGreaterThan(0);
    expect(result.violations).toEqual([]);
  });

  it.each([
    ['at the top level', (leak: any, participant: any) => ({ ...participant, sex: leak.person.sex })],
    ['nested in a person', (leak: any, participant: any) => ({ ...participant, person: { sex: leak.person.sex } })],
    [
      'buried under an unrelated key',
      (leak: any, participant: any) => ({ ...participant, meta: { extra: [{ sex: leak.person.sex }] } }),
    ],
  ])('fires on a planted value %s', (_name, plant) => {
    const participants = clean();
    const leakSource = fixture.hydratedParticipants.find((p: any) => p.person?.sex);
    expect(leakSource).toBeDefined();
    const planted = [plant(leakSource, participants[0]), ...participants.slice(1)];

    const result = scanForForbiddenData({ node: planted, forbidden });
    expect(result.violations.map((violation) => violation.attribute)).toContain('sex');
  });

  it('does not fire on a matching value under a DIFFERENT attribute name', () => {
    const leakSource: any = fixture.hydratedParticipants.find((p: any) => p.person?.sex);
    const decoy = [{ unrelatedAttribute: leakSource.person.sex }];
    expect(scanForForbiddenData({ node: decoy, forbidden }).violations).toEqual([]);
  });

  it('skips a declared subtree, and reports having skipped it', () => {
    const leakSource: any = fixture.hydratedParticipants.find((p: any) => p.person?.sex);
    const node = { tournamentContacts: [{ sex: leakSource.person.sex }] };
    const result = scanForForbiddenData({ node, forbidden, skipSubtrees: ['tournamentContacts'] });
    expect(result.violations).toEqual([]);
    expect(result.skippedSubtrees).toEqual(['tournamentContacts']);
    // and without the declaration it fires — the skip is doing the work, not the shape of the input
    expect(scanForForbiddenData({ node, forbidden }).violations.length).toBeGreaterThan(0);
  });
});

describe('collectUnpermittedAttributes', () => {
  it('stays silent on a filtered response, having examined participants', () => {
    const result = collectUnpermittedAttributes({ node: clean(), template });
    expect(result.participantsScanned).toBeGreaterThan(0);
    expect(result.findings).toEqual([]);
  });

  it('fires on a COMPUTED attribute that no record holds', () => {
    // `seedings` exists only after hydration, so the value-matching detector cannot see it. This is
    // the case that justifies having two detectors rather than one.
    const participants = clean();
    const planted = [{ ...participants[0], seedings: { SINGLES: [{ seedValue: 1 }] } }, ...participants.slice(1)];
    const result = collectUnpermittedAttributes({ node: planted, template });
    expect(result.findings.flatMap((finding) => finding.attributes)).toContain('seedings');
  });

  it('honours declared context annotations, and reports which were seen', () => {
    const participants = clean();
    const planted = [{ ...participants[0], entryStatus: 'DIRECT_ACCEPTANCE' }, ...participants.slice(1)];

    const withAnnotation = collectUnpermittedAttributes({
      contextAnnotations: ['entryStatus'],
      node: planted,
      template,
    });
    expect(withAnnotation.findings).toEqual([]);
    expect(withAnnotation.annotationsSeen).toEqual(['entryStatus']);

    // without the declaration the same input is a violation — the exemption is load-bearing
    expect(collectUnpermittedAttributes({ node: planted, template }).findings.length).toBeGreaterThan(0);
  });

  it('returns nothing when no policy is supplied', () => {
    const result = collectUnpermittedAttributes({ node: fixture.hydratedParticipants, template: undefined });
    expect(result.findings).toEqual([]);
    expect(result.participantsScanned).toEqual(0);
  });
});

describe('the saturation control', () => {
  it('reports nothing uncovered for the fixture as built', () => {
    expect(uncoveredDeniedPaths({ participants: fixture.hydratedParticipants, template })).toEqual([]);
  });

  it('names every denied path, at every depth', () => {
    const denied = templateDeniedPaths(template);
    expect(denied).toContain('person.sex');
    expect(denied).toContain('individualParticipants.person.sex');
    expect(denied).toContain('contacts');
    expect(denied).not.toContain('person.standardFamilyName');
  });

  it('fires when a denied attribute has no value to leak', () => {
    const stripped = fixture.hydratedParticipants.map((participant: any) => {
      const { person, ...rest } = participant;
      const { sex, ...personRest } = person ?? {};
      return person ? { ...rest, person: personRest } : rest;
    });
    expect(uncoveredDeniedPaths({ participants: stripped, template })).toContain('person.sex');
  });
});

describe('analysePolicyConformance', () => {
  it('composes both detectors and describes violations from each', () => {
    const participants = clean();
    const leakSource: any = fixture.hydratedParticipants.find((p: any) => p.person?.sex);
    const planted = [
      { ...participants[0], person: { ...participants[0].person, sex: leakSource.person.sex } },
      { ...participants[1], seedings: { SINGLES: [{ seedValue: 1 }] } },
      ...participants.slice(2),
    ];

    const violations = describeViolations(
      analysePolicyConformance({
        participants: fixture.hydratedParticipants,
        policyDefinitions: POLICY_PRIVACY_DEFAULT,
        node: planted,
      }),
    );
    expect(violations.some((violation) => violation.startsWith('person.sex'))).toEqual(true);
    expect(violations.some((violation) => violation.startsWith('seedings'))).toEqual(true);
  });

  it('is silent when the policy permits what is present', () => {
    const permissive = structuredClone(POLICY_PRIVACY_DEFAULT);
    permissive[POLICY_TYPE_PARTICIPANT].participant = { '*': true };
    const analysis = analysePolicyConformance({
      participants: fixture.hydratedParticipants,
      policyDefinitions: permissive,
      node: fixture.hydratedParticipants,
    });
    expect(analysis.unpermitted.participantsScanned).toBeGreaterThan(0);
    expect(describeViolations(analysis)).toEqual([]);
  });
});
