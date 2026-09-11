/**
 * Draw, event and structure views cannot break when `seedings` is filtered out.
 *
 * CA, 2026-08-21: if a view depends on a filtered attribute, the view is wrong, not the policy. So
 * this asserts equivalence of everything a bracket needs in order to render — structures, position
 * assignments, seed assignments, matchUps, sides — between a policy that permits `seedings` and one
 * that denies it, while proving the attribute really did disappear.
 *
 * Two distinctions the assertions depend on:
 *
 *  - `seedings` (the participant attribute: a per-eventType scale, opt-in via `withSeeding`) is what a
 *    privacy policy governs. `seedValue` / `seedNumber` on a SIDE, and `seedAssignments` on a
 *    structure, are draw structure — they are not participant attributes and must survive.
 *  - Only `getEventData` emits `seedings` at all, and only when asked. `getDrawData` and
 *    `getStructureData` emit none under either policy; that is asserted rather than assumed, with
 *    `getEventData`'s non-zero count proving the counter can count.
 */

import { generatePrivacyFixture, SINGLES_DRAW_ID } from '@Tests/testHarness/privacyFixture';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

import POLICY_PRIVACY_DEFAULT from '@Fixtures/policies/POLICY_PRIVACY_DEFAULT';
import { POLICY_TYPE_PARTICIPANT } from '@Constants/policyConstants';

const fixture = generatePrivacyFixture();

/** `POLICY_PRIVACY_DEFAULT` names no `seedings` key, and `attributeFilter` copies only what is named. */
const seedingsDenied = POLICY_PRIVACY_DEFAULT;

function seedingsPermitted() {
  const policy = structuredClone(POLICY_PRIVACY_DEFAULT);
  policy[POLICY_TYPE_PARTICIPANT].participant.seedings = true;
  policy[POLICY_TYPE_PARTICIPANT].participant.individualParticipants.seedings = true;
  return policy;
}

const participantsProfile = { withSeeding: true, withEvents: true };

function countSeedings(node: any): number {
  if (Array.isArray(node)) return node.reduce((total, member) => total + countSeedings(member), 0);
  if (!node || typeof node !== 'object') return 0;
  let total = 0;
  for (const [key, value] of Object.entries(node)) {
    if (key === 'seedings' && value && Object.keys(value).length) total += 1;
    else total += countSeedings(value);
  }
  return total;
}

/** Everything a bracket needs in order to render, reduced to comparable counts. */
function renderShape(structures: any[] = []) {
  const matchUps = structures.flatMap((structure) => Object.values(structure?.roundMatchUps ?? {}).flat()) as any[];
  const sides = matchUps.flatMap((matchUp) => matchUp?.sides ?? []);
  return {
    structures: structures.length,
    positionAssignments: structures.reduce((total, s) => total + (s?.positionAssignments?.length ?? 0), 0),
    seedAssignments: structures.reduce((total, s) => total + (s?.seedAssignments?.length ?? 0), 0),
    sidesWithParticipants: sides.filter((side) => side?.participant).length,
    sidesWithSeedValue: sides.filter((side) => side?.seedValue !== undefined).length,
    matchUps: matchUps.length,
  };
}

const surfaces: [string, (policyDefinitions: any) => { node: any; structures: any[] }][] = [
  [
    'getEventData',
    (policyDefinitions) => {
      const result = tournamentEngine.getEventData({
        eventId: fixture.eventIds[0],
        participantsProfile,
        policyDefinitions,
      });
      return { node: result, structures: result.eventData.drawsData?.flatMap((draw: any) => draw.structures ?? []) };
    },
  ],
  [
    'getDrawData',
    (policyDefinitions) => {
      const result = tournamentEngine.getDrawData({
        drawId: SINGLES_DRAW_ID,
        participantsProfile,
        policyDefinitions,
      });
      return { node: result, structures: result.structures };
    },
  ],
  [
    'getStructureData',
    (policyDefinitions) => {
      const { drawDefinition } = tournamentEngine.getEvent({ drawId: SINGLES_DRAW_ID });
      const result = tournamentEngine.getStructureData({
        structureId: drawDefinition.structures[0].structureId,
        drawId: SINGLES_DRAW_ID,
        participantsProfile,
        policyDefinitions,
      });
      return { node: result, structures: [result.structure] };
    },
  ],
];

describe.each(surfaces)('%s renders identically when seedings are filtered', (_name, invoke) => {
  const permitted = invoke(seedingsPermitted());
  const denied = invoke(seedingsDenied);

  it('structures, positions, seed assignments, matchUps and sides are unchanged', () => {
    const shape = renderShape(permitted.structures);
    // controls, so an "identical" result is not two identical zeroes
    expect(shape.structures).toBeGreaterThan(0);
    expect(shape.matchUps).toBeGreaterThan(0);
    expect(shape.sidesWithParticipants).toBeGreaterThan(0);
    expect(shape.seedAssignments).toBeGreaterThan(0);
    expect(shape.sidesWithSeedValue).toBeGreaterThan(0);

    expect(renderShape(denied.structures)).toEqual(shape);
  });

  it('emits no seedings under the denying policy', () => {
    expect(countSeedings(denied.node)).toEqual(0);
  });
});

describe('the seedings counter can count', () => {
  it('getEventData emits seedings when the policy permits them', () => {
    const { node } = surfaces[0][1](seedingsPermitted());
    expect(countSeedings(node)).toBeGreaterThan(0);
  });

  it('getDrawData and getStructureData emit none under either policy — a fact, not an assumption', () => {
    for (const [, invoke] of surfaces.slice(1)) {
      expect(countSeedings(invoke(seedingsPermitted()).node)).toEqual(0);
    }
  });
});
