/**
 * Participant privacy conformance, across every engine surface that emits participant data.
 *
 * The assertion is general by construction: nothing here names an attribute. For a given policy, no
 * attribute the policy denies — explicitly `false` or simply absent — may appear anywhere in the
 * response, at any depth, for any participantType. A `sex`-only test would pass the next time a
 * different attribute was widened; that is precisely how the defect this suite exists to prevent
 * survived for two and a half years.
 *
 * Every case carries a control (`participantsScanned`), because "no denied attribute found" in a
 * response that contained no participants proves nothing.
 */

import { generatePrivacyFixture, SINGLES_DRAW_ID } from '@Tests/testHarness/privacyFixture';
import { uncoveredDeniedPaths } from '@Tests/testHarness/privacySaturation';
import { describe, expect, it, test } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import {
  analysePolicyConformance,
  describeViolations,
  participantTemplate,
} from '@Tests/testHarness/privacyConformance';

// constants and types
import POLICY_PRIVACY_DEFAULT from '@Fixtures/policies/POLICY_PRIVACY_DEFAULT';
import { POLICY_TYPE_PARTICIPANT } from '@Constants/policyConstants';

/**
 * Attributes stapled onto `sides[].participant` AFTER the policy filter, by design: they describe the
 * participant's ENTRY into a draw, not the participant. `hydrateSideParticipant` adds them
 * deliberately. Declared here rather than tolerated silently — `annotationsSeen` proves each one is
 * still real, so this list cannot rot into a blanket exemption.
 */
const CONTEXT_ANNOTATIONS = ['entryStatus', 'entryStage', 'luckyAdvancement'];

/**
 * `tournamentContacts` is a different population under a different policy: `getTournamentInfo` filters
 * it with `POLICY_PRIVACY_STAFF`, which permits `participantRoleResponsibilities` (a contact without a
 * role is useless) while denying the same personal attributes the competitor policy denies. It is
 * excluded here and asserted on its own terms in `staffContacts.test.ts` — not exempted.
 */
const SEPARATELY_GOVERNED = ['tournamentContacts'];

// Built at module scope, not in `beforeAll`: the surface table below is enumerated at collection
// time, so `it.each` needs the eventIds/drawIds before any hook has run.
const fixture = generatePrivacyFixture();

/** Surfaces that accept `policyDefinitions` and emit participants. */
function surfaces(policyDefinitions: any) {
  const [eventId] = fixture.eventIds;
  const drawId = SINGLES_DRAW_ID;
  const withDraw = () => tournamentEngine.getEvent({ drawId });

  return {
    getParticipants: () => tournamentEngine.getParticipants({ policyDefinitions, withGroupings: true }),
    'getParticipants withIndividualParticipants': () =>
      tournamentEngine.getParticipants({ policyDefinitions, withGroupings: true, withIndividualParticipants: true }),
    'getParticipants fully hydrated': () =>
      tournamentEngine.getParticipants({
        policyDefinitions,
        withIndividualParticipants: true,
        withScheduleItems: true,
        withGroupings: true,
        withStatistics: true,
        withOpponents: true,
        withMatchUps: true,
        withEvents: true,
        withDraws: true,
      }),
    getCompetitionParticipants: () => tournamentEngine.getCompetitionParticipants({ policyDefinitions }),
    getParticipantSchedules: () => tournamentEngine.getParticipantSchedules({ policyDefinitions }),
    getEventData: () => tournamentEngine.getEventData({ eventId, policyDefinitions }),
    'getEventData usePublishState': () =>
      tournamentEngine.getEventData({ eventId, policyDefinitions, usePublishState: true }),
    getAllEventData: () => tournamentEngine.getAllEventData({ policyDefinitions }),
    getDrawData: () => tournamentEngine.getDrawData({ drawId, policyDefinitions }),
    getStructureData: () => {
      const { drawDefinition } = withDraw();
      return tournamentEngine.getStructureData({
        structureId: drawDefinition.structures[0].structureId,
        policyDefinitions,
        drawId,
      });
    },
    'competitionScheduleMatchUps hydrated': () =>
      tournamentEngine.competitionScheduleMatchUps({
        policyDefinitions,
        hydrateParticipants: true,
        usePublishState: true,
      }),
    // courthive-public asks for exactly this shape (tabDisplay.ts hard-codes hydrateParticipants:
    // false), which is what makes `mappedParticipants` a public payload rather than an internal one.
    'competitionScheduleMatchUps mappedParticipants': () =>
      tournamentEngine.competitionScheduleMatchUps({
        policyDefinitions,
        hydrateParticipants: false,
        usePublishState: true,
      }),
    allTournamentMatchUps: () => tournamentEngine.allTournamentMatchUps({ policyDefinitions }),
    tournamentMatchUps: () => tournamentEngine.tournamentMatchUps({ policyDefinitions }),
    allCompetitionMatchUps: () => tournamentEngine.allCompetitionMatchUps({ policyDefinitions }),
    allDrawMatchUps: () => {
      const { drawDefinition, event } = withDraw();
      return tournamentEngine.allDrawMatchUps({ drawDefinition, event, policyDefinitions, inContext: true });
    },
    drawMatchUps: () => {
      const { drawDefinition, event } = withDraw();
      return tournamentEngine.drawMatchUps({ drawDefinition, event, policyDefinitions, inContext: true });
    },
    allEventMatchUps: () => {
      const { event } = tournamentEngine.getEvent({ eventId });
      return tournamentEngine.allEventMatchUps({ event, policyDefinitions, inContext: true });
    },
    eventMatchUps: () => {
      const { event } = tournamentEngine.getEvent({ eventId });
      return tournamentEngine.eventMatchUps({ event, policyDefinitions, inContext: true });
    },
    getAllStructureMatchUps: () => {
      const { drawDefinition, event } = withDraw();
      return tournamentEngine.getAllStructureMatchUps({
        structure: drawDefinition.structures[0],
        drawDefinition,
        policyDefinitions,
        inContext: true,
        event,
      });
    },
    findParticipant: () =>
      tournamentEngine.findParticipant({ participantId: fixture.individualParticipantIds[0], policyDefinitions }),
  };
}

/**
 * A policy unrelated to the historical `sex` defect: it denies attributes the shipped default PERMITS
 * (`participantName`, `rankings`, `ratings`, `representing`, `person.nationalityCode`) and permits one
 * the default denies (`person.birthDate`). If conformance were an artefact of the default's shape
 * rather than of the filter honouring whatever it is handed, this policy would expose it.
 */
function invertedPolicy() {
  const template = structuredClone(POLICY_PRIVACY_DEFAULT);
  const participant = template[POLICY_TYPE_PARTICIPANT].participant;
  for (const level of [participant, participant.individualParticipants]) {
    level.participantName = false;
    level.rankings = false;
    level.ratings = false;
    level.representing = false;
    level.person.nationalityCode = false;
    level.person.birthDate = true;
  }
  return template;
}

const POLICIES: [string, () => any][] = [
  ['POLICY_PRIVACY_DEFAULT', () => POLICY_PRIVACY_DEFAULT],
  ['inverted policy', invertedPolicy],
];

describe('the fixture can prove anything at all', () => {
  it('holds a value for every attribute the policy denies', () => {
    for (const [policyName, buildPolicy] of POLICIES) {
      const template = participantTemplate(buildPolicy());
      const uncovered = uncoveredDeniedPaths({ participants: fixture.hydratedParticipants, template });
      expect(uncovered, `${policyName}: denied attributes with no value to leak`).toEqual([]);
    }
    expect(fixture.saturatedCount).toBeGreaterThan(0);
  });

  it('emits every participantType, and staff, so the matrix is not hypothetical', () => {
    const types = new Set(fixture.participants.map((participant: any) => participant.participantType));
    expect([...types].sort((a, b) => a.localeCompare(b, 'en'))).toEqual(['GROUP', 'INDIVIDUAL', 'PAIR', 'TEAM']);
  });
});

describe.each(POLICIES)('%s is honoured', (_policyName, buildPolicy) => {
  const policyDefinitions = buildPolicy();
  const surfaceEntries = Object.entries(surfaces(policyDefinitions));

  it.each(surfaceEntries)('%s emits nothing the policy denies', (_name, invoke) => {
    const node = invoke();
    expect(node?.error).toBeUndefined();

    const analysis = analysePolicyConformance({
      contextAnnotations: CONTEXT_ANNOTATIONS,
      skipSubtrees: SEPARATELY_GOVERNED,
      participants: fixture.hydratedParticipants,
      policyDefinitions,
      node,
    });

    // the control: a scan that examined no participants cannot testify to anything
    expect(analysis.unpermitted.participantsScanned).toBeGreaterThan(0);
    expect(analysis.forbidden.length).toBeGreaterThan(0);
    expect(describeViolations(analysis)).toEqual([]);
  });
});

describe('the check can report dirty', () => {
  // Falsification. Each case widens the policy the surface was given, exactly as CFS did in place on
  // the shared fixture, and requires the SAME assertion to fail. Without this pair, a green run is
  // evidence about the fixture rather than about the filter.
  const widened = () => {
    const policy = structuredClone(POLICY_PRIVACY_DEFAULT);
    policy[POLICY_TYPE_PARTICIPANT].participant.person.sex = true;
    policy[POLICY_TYPE_PARTICIPANT].participant.individualParticipants.person.sex = true;
    return policy;
  };

  /** Judge a widened response against the STRICT policy — what the strict policy's holder expects. */
  const analyseWidened = (invoke: () => any) =>
    analysePolicyConformance({
      contextAnnotations: CONTEXT_ANNOTATIONS,
      participants: fixture.hydratedParticipants,
      policyDefinitions: POLICY_PRIVACY_DEFAULT,
      node: invoke(),
    });

  it.each(Object.entries(surfaces(widened())))('%s goes red when the policy is widened', (_name, invoke) => {
    const analysis = analyseWidened(invoke);
    expect(analysis.unpermitted.participantsScanned).toBeGreaterThan(0);
    expect(describeViolations(analysis).some((violation) => violation.startsWith('person.sex'))).toEqual(true);
  });
});

test('declared context annotations are real, not a blanket exemption', () => {
  const node = tournamentEngine.getEventData({
    policyDefinitions: POLICY_PRIVACY_DEFAULT,
    eventId: fixture.eventIds[0],
  });
  const analysis = analysePolicyConformance({
    contextAnnotations: CONTEXT_ANNOTATIONS,
    participants: fixture.hydratedParticipants,
    policyDefinitions: POLICY_PRIVACY_DEFAULT,
    node,
  });
  // If this ever empties, the exemption has stopped exempting anything and should be deleted rather
  // than left standing as a permanent hole.
  expect(analysis.unpermitted.annotationsSeen.length).toBeGreaterThan(0);
});
