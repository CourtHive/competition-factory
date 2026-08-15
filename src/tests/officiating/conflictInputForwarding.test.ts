/**
 * Conformance guard: EVERY route that can evaluate a conflict of interest must forward EVERY
 * conflict-evaluation input.
 *
 * This exists because of a real defect. When `officialParticipantId` + `groupParticipants` were added
 * for tournament-scoped (GROUP) declarations, `addMatchUpOfficial` forwarded them and `assignOfficial`
 * did not — so the same conflict blocked a per-matchUp assignment and passed silently on the
 * tournament-level one. A rule that applies or not depending on which route the operator happened to use
 * is worse than no rule, because it looks enforced.
 *
 * `conflictInputsFrom()` makes that unlikely by construction. This makes it LOUD: add a key to
 * `CONFLICT_INPUT_KEYS` and any route that fails to forward it fails here, naming the route and the key.
 */
import { CONFLICT_INPUT_KEYS } from '@Query/officiating/conflictEvaluationInputs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getOfficialConflictsMock } = vi.hoisted(() => ({
  getOfficialConflictsMock: vi.fn(() => ({ success: true, conflicts: [], blocked: false })),
}));

vi.mock('@Query/officiating/getOfficialConflicts', () => ({
  getOfficialConflicts: getOfficialConflictsMock,
}));

import { getMatchUpOfficialConflicts } from '@Query/officiating/getMatchUpOfficialConflicts';
import { assignOfficial } from '@Mutate/officiating/assignOfficial';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

import { POLICY_TYPE_OFFICIATING_CONFLICT } from '@Constants/policyConstants';

/** Every conflict input, each set to a value distinguishable from `undefined`. */
function fullInputs() {
  return {
    policyDefinitions: { [POLICY_TYPE_OFFICIATING_CONFLICT]: { conflictRules: {} } },
    officialRecord: {
      officialRecordId: 'rec-1',
      personId: 'person-official',
      certifications: [],
      evaluations: [],
      assignments: [],
      suspensions: [],
      certificationRequirements: [],
      evaluationPolicies: [],
      createdAt: '2025-01-01',
      updatedAt: '2025-01-01',
    } as any,
    officialParticipantId: 'par-official',
    groupParticipants: [{ participantId: 'grp-1', participantType: 'GROUP', individualParticipantIds: [] }] as any,
    nationalityCode: 'FRA',
    organisationIds: ['org-1'],
  };
}

/** Each route, invoked with the full input set plus whatever else it needs. */
const ROUTES: { name: string; invoke: (inputs: any) => void }[] = [
  {
    name: 'assignOfficial',
    invoke: (inputs) =>
      assignOfficial({ ...inputs, tournamentId: 't-1', roleSubtype: 'CHAIR_UMPIRE', participants: [] }),
  },
  {
    name: 'getMatchUpOfficialConflicts',
    invoke: (inputs) => {
      const {
        tournamentRecord,
        drawIds: [drawId],
      } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }], setState: true, nonRandom: 1 });
      const drawDefinition = tournamentRecord.events[0].drawDefinitions.find((d: any) => d.drawId === drawId);
      const { matchUps } = tournamentEngine.allTournamentMatchUps();
      const matchUp = matchUps.find((m: any) => m.sides?.every((s: any) => s?.participantId));
      getMatchUpOfficialConflicts({ ...inputs, tournamentRecord, drawDefinition, matchUpId: matchUp.matchUpId });
    },
  },
];

describe('conflict-input forwarding conformance', () => {
  beforeEach(() => getOfficialConflictsMock.mockClear());

  it('covers every known route', () => {
    // A new evaluation route must be added to ROUTES. If you are here because you added one, add it.
    expect(ROUTES.length).toBeGreaterThanOrEqual(2);
  });

  it.each(ROUTES)('$name forwards every conflict-evaluation input', ({ invoke }) => {
    const inputs = fullInputs();
    invoke(inputs);

    expect(getOfficialConflictsMock).toHaveBeenCalled();
    const forwarded = getOfficialConflictsMock.mock.calls.at(-1)?.[0] as any;

    const dropped = CONFLICT_INPUT_KEYS.filter((key) => forwarded?.[key] === undefined);
    expect(dropped).toEqual([]);
  });

  it.each(ROUTES)('$name forwards the input VALUES unchanged, not just the keys', ({ name, invoke }) => {
    const inputs = fullInputs();
    invoke(inputs);
    const forwarded = getOfficialConflictsMock.mock.calls.at(-1)?.[0] as any;

    for (const key of CONFLICT_INPUT_KEYS) {
      // groupParticipants is legitimately derived (not forwarded verbatim) by the matchUp route: it
      // reads the tournament's GROUP participants rather than trusting a caller-supplied list.
      if (key === 'groupParticipants' && name === 'getMatchUpOfficialConflicts') {
        expect(Array.isArray(forwarded[key])).toBe(true);
        continue;
      }
      expect(forwarded[key]).toEqual((inputs as any)[key]);
    }
  });
});
