import { captureNotices, changedEntities, conformanceViolations } from './harness';
import { setSubscriptions, deleteNotices } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { INDIVIDUAL } from '@Constants/participantConstants';

/**
 * Workstream D-scenarios (slice 2). A data-driven catalog that runs each mutation
 * through the notice-conformance harness and asserts the invariant per mutation:
 *
 *   - `covered`  → zero completeness violations (a regression guard: if a wired
 *                  notice is dropped, this fails).
 *   - `gap`      → at least one violation (a TRIPWIRE for the known coverage gaps
 *                  from the notice audit; when the matching coverage workstream
 *                  (A/C) wires the notice, the tripwire fails → update the entry).
 *
 * Every scenario asserts the mutation actually changed the record first, so a
 * `gap` assertion can never pass vacuously. This is the seed of the full
 * ~640-method sweep; it currently covers the audit-named methods.
 */

type Ctx = {
  eventId: string;
  drawId: string;
  structureId: string;
  enteredIds: string[];
  alternateIds: string[];
  matchUpId: string;
};

type Scenario = {
  name: string;
  expectation: 'covered' | 'gap';
  note?: string; // owning coverage workstream for a gap
  setup?: (ctx: Ctx) => void; // runs BEFORE capture (not measured)
  run: (ctx: Ctx) => void;
};

function seedContext(): Ctx {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    tournamentAttributes: { tournamentId: 'conf-scn' },
    participantsProfile: { participantsCount: 16 },
    drawProfiles: [{ drawSize: 8, eventName: 'Singles' }],
    startDate: '2025-01-01',
    endDate: '2025-01-14',
    completeAllMatchUps: true,
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);
  const record = tournamentEngine.getTournament().tournamentRecord;
  const event = record.events[0];
  const drawDefinition = event.drawDefinitions[0];
  const entered = new Set((event.entries ?? []).map((e: any) => e.participantId));
  const { participants } = tournamentEngine.getParticipants({ participantFilters: { participantTypes: [INDIVIDUAL] } });
  const ids = participants.map((p: any) => p.participantId);
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  return {
    eventId: event.eventId,
    drawId: drawDefinition.drawId,
    structureId: drawDefinition.structures[0].structureId,
    enteredIds: ids.filter((id: string) => entered.has(id)),
    alternateIds: ids.filter((id: string) => !entered.has(id)),
    matchUpId: matchUps[0]?.matchUpId,
  };
}

const DELEGATED_OUTCOME = { score: { scoreStringSide1: '6-1 6-1', scoreStringSide2: '1-6 1-6' } };

const scenarios: Scenario[] = [
  // ── covered controls (regression guards) ──────────────────────────────────
  {
    name: 'modifyParticipant (person name)',
    expectation: 'covered',
    run: () => {
      const { participants } = tournamentEngine.getParticipants({
        participantFilters: { participantTypes: [INDIVIDUAL] },
      });
      const p = participants[0];
      tournamentEngine.modifyParticipant({
        participant: {
          ...p,
          person: { ...(p.person ?? {}), standardGivenName: 'Pete', standardFamilyName: 'Sampras' },
        },
      });
    },
  },

  // ── audit-named mutations (all gaps now CLOSED; kept as regression guards) ──
  {
    // C2 CLOSED: modifyEvent now dispatches MODIFY_EVENT.
    name: 'modifyEvent (eventName)',
    expectation: 'covered',
    run: (ctx) => tournamentEngine.modifyEvent({ eventId: ctx.eventId, eventUpdates: { eventName: 'Renamed' } }),
  },
  {
    // C2 CLOSED: setEventDates now dispatches MODIFY_EVENT.
    name: 'setEventDates',
    expectation: 'covered',
    run: (ctx) =>
      tournamentEngine.setEventDates({ eventId: ctx.eventId, startDate: '2025-01-03', endDate: '2025-01-12' }),
  },
  {
    // C3 CLOSED: addEventEntries now dispatches MODIFY_EVENT_ENTRIES.
    name: 'addEventEntries (alternate)',
    expectation: 'covered',
    run: (ctx) => tournamentEngine.addEventEntries({ eventId: ctx.eventId, participantIds: [ctx.alternateIds[0]] }),
  },
  {
    // C3 CLOSED: removeEventEntries now dispatches MODIFY_EVENT_ENTRIES.
    name: 'removeEventEntries',
    expectation: 'covered',
    setup: (ctx) => tournamentEngine.addEventEntries({ eventId: ctx.eventId, participantIds: [ctx.alternateIds[0]] }),
    run: (ctx) => tournamentEngine.removeEventEntries({ eventId: ctx.eventId, participantIds: [ctx.alternateIds[0]] }),
  },
  {
    // C1 CLOSED: renameStructures now dispatches MODIFY_DRAW_DEFINITION.
    name: 'renameStructures',
    expectation: 'covered',
    run: (ctx) =>
      tournamentEngine.renameStructures({
        drawId: ctx.drawId,
        structureDetails: [{ structureId: ctx.structureId, structureName: 'Renamed' }],
      }),
  },
  {
    // C1 CLOSED: setDelegatedOutcome now dispatches MODIFY_MATCHUP for the
    // first-class matchUp.delegatedOutcome write (was silent).
    name: 'setDelegatedOutcome',
    expectation: 'covered',
    run: (ctx) =>
      tournamentEngine.setDelegatedOutcome({
        matchUpId: ctx.matchUpId,
        drawId: ctx.drawId,
        outcome: DELEGATED_OUTCOME,
      }),
  },
  {
    // C2 CLOSED: deleteEvents now cascades DELETE_EVENT + DELETED_DRAW_IDS + DELETE_PARTICIPANTS.
    name: 'deleteEvents (cascade)',
    expectation: 'covered',
    run: (ctx) => tournamentEngine.deleteEvents({ eventIds: [ctx.eventId] }),
  },
  {
    // WS-A CLOSED: regenerateParticipantNames now dispatches MODIFY_PARTICIPANTS.
    name: 'regenerateParticipantNames',
    expectation: 'covered',
    run: () =>
      tournamentEngine.regenerateParticipantNames({ formats: { INDIVIDUAL: { personFormat: 'LAST, First' } } }),
  },
];

const gapReport: Array<{ name: string; note?: string; violations: number }> = [];

const reset = () => {
  setSubscriptions({ subscriptions: {} });
  deleteNotices();
};

describe('notice conformance — scenario catalog (D-scenarios)', () => {
  afterEach(reset);

  afterAll(() => {
    if (gapReport.length) {
      const lines = gapReport
        .map((g) => {
          const suffix = g.note ? ` [${g.note}]` : '';
          return `  • ${g.name} — ${g.violations} violation(s)${suffix}`;
        })
        .join('\n');
      // Living gap list — the audit's hand-probed silences, now automated.
      console.log(`\n[notice-conformance] known coverage gaps (tripwires):\n${lines}\n`);
    }
  });

  for (const scn of scenarios) {
    const label = scn.expectation === 'gap' ? 'GAP' : 'covered';
    it(`${label}: ${scn.name}`, () => {
      const ctx = seedContext();
      scn.setup?.(ctx);

      const before = structuredClone(tournamentEngine.getTournament().tournamentRecord);
      const captured = captureNotices(() => scn.run(ctx));
      const after = structuredClone(tournamentEngine.getTournament().tournamentRecord);

      // never let a gap assertion pass vacuously — the mutation must have changed the record
      expect(changedEntities(before, after).length).toBeGreaterThan(0);

      const violations = conformanceViolations(before, after, captured);
      if (scn.expectation === 'covered') {
        expect(violations).toEqual([]);
      } else {
        expect(violations.length).toBeGreaterThan(0);
        gapReport.push({ name: scn.name, note: scn.note, violations: violations.length });
      }
    });
  }
});
