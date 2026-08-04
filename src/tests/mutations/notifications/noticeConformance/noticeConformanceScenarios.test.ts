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
  seed?: () => Ctx; // per-scenario seed override (default: seedContext)
  setup?: (ctx: Ctx) => void; // runs BEFORE capture (not measured)
  run: (ctx: Ctx) => void;
};

/** Read the current engine state into a Ctx (shared by every seed variant). */
function extractContext(): Ctx {
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
  return extractContext();
}

/**
 * Seed with positions assigned but matchUps UNSCORED (no completeAllMatchUps), so
 * scoring a first-round matchUp cleanly advances a winner into round 2 — exercising
 * the multi-matchUp coverage requirement (the scored matchUp AND every downstream
 * matchUp the advancement touches must each get a MODIFY_MATCHUP).
 */
function unscoredContext(): Ctx {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    tournamentAttributes: { tournamentId: 'conf-scn-unscored' },
    participantsProfile: { participantsCount: 16 },
    drawProfiles: [{ drawSize: 8, eventName: 'Singles' }],
    startDate: '2025-01-01',
    endDate: '2025-01-14',
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);
  return extractContext();
}

/** DOUBLES event seed with spare individuals so pair/ungrouped entries can be added. */
function doublesContext(): Ctx {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    tournamentAttributes: { tournamentId: 'conf-scn-doubles' },
    participantsProfile: { participantsCount: 24 },
    drawProfiles: [{ drawSize: 4, eventType: 'DOUBLES', eventName: 'Doubles' }],
    startDate: '2025-01-01',
    endDate: '2025-01-14',
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);
  return extractContext();
}

/** TEAM event seed so tieFormat mutations have a team draw with collections. */
function teamContext(): Ctx {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    tournamentAttributes: { tournamentId: 'conf-scn-team' },
    drawProfiles: [{ eventType: 'TEAM', drawSize: 4, eventName: 'Team' }],
    startDate: '2025-01-01',
    endDate: '2025-01-14',
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);
  return extractContext();
}

/**
 * Seed with an event that has entries but NO draw (`generate: false`), so a
 * generate+add draw scenario adds a whole drawDefinition subtree.
 */
function drawGenContext(): Ctx {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    tournamentAttributes: { tournamentId: 'conf-scn-drawgen' },
    participantsProfile: { participantsCount: 16 },
    eventProfiles: [{ eventName: 'ToGenerate', drawProfiles: [{ drawSize: 8, generate: false }] }],
    startDate: '2025-01-01',
    endDate: '2025-01-14',
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);
  const record = tournamentEngine.getTournament().tournamentRecord;
  const event = record.events[0];
  const entered = new Set((event.entries ?? []).map((e: any) => e.participantId));
  const { participants } = tournamentEngine.getParticipants({ participantFilters: { participantTypes: [INDIVIDUAL] } });
  const ids = participants.map((p: any) => p.participantId);
  // no draw yet — drawId/structureId/matchUpId are unused by the generation scenario
  return {
    eventId: event.eventId,
    drawId: '',
    structureId: '',
    enteredIds: ids.filter((id: string) => entered.has(id)),
    alternateIds: ids.filter((id: string) => !entered.has(id)),
    matchUpId: '',
  };
}

/** Seed with declared seeds so seed-assignment mutations have real seeds to move. */
function seededContext(): Ctx {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    tournamentAttributes: { tournamentId: 'conf-scn-seeded' },
    participantsProfile: { participantsCount: 16 },
    drawProfiles: [{ drawSize: 8, seedsCount: 4, eventName: 'Singles' }],
    startDate: '2025-01-01',
    endDate: '2025-01-14',
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);
  return extractContext();
}

/** The first structure of the seed's draw, read live (reads dispatch no notices). */
function firstStructure(ctx: Ctx): any {
  const record = tournamentEngine.getTournament().tournamentRecord;
  const drawDefinition = record.events
    .flatMap((e: any) => e.drawDefinitions ?? [])
    .find((d: any) => d.drawId === ctx.drawId);
  return drawDefinition.structures.find((s: any) => s.structureId === ctx.structureId);
}

/** An entered participant not currently holding a seed in the given structure. */
function unseededEnteredId(ctx: Ctx): string {
  const seeded = new Set((firstStructure(ctx).seedAssignments ?? []).map((a: any) => a.participantId));
  return ctx.enteredIds.find((id) => !seeded.has(id)) as string;
}

/**
 * Seed with UNASSIGNED draw positions (`automated: false`) so position mutations
 * (assign/remove/swap) have open positions to act on — the completeAllMatchUps
 * `seedContext` has every position filled.
 */
function openPositionsContext(): Ctx {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    tournamentAttributes: { tournamentId: 'conf-scn-open' },
    participantsProfile: { participantsCount: 16 },
    drawProfiles: [{ drawSize: 8, participantsCount: 8, automated: false, eventName: 'Singles' }],
    startDate: '2025-01-01',
    endDate: '2025-01-14',
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);
  return extractContext();
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
  {
    // C1 CLOSED: setStructureOrder now dispatches MODIFY_DRAW_DEFINITION.
    name: 'setStructureOrder',
    expectation: 'covered',
    run: (ctx) => tournamentEngine.setStructureOrder({ drawId: ctx.drawId, orderMap: { [ctx.structureId]: 2 } }),
  },
  {
    // C4 CLOSED: setDrawParticipantRepresentativeIds (draw extension) now dispatches MODIFY_DRAW_DEFINITION.
    name: 'setDrawParticipantRepresentativeIds',
    expectation: 'covered',
    run: (ctx) =>
      tournamentEngine.setDrawParticipantRepresentativeIds({
        drawId: ctx.drawId,
        representativeParticipantIds: [ctx.enteredIds[0]],
      }),
  },
  {
    // WS-A CLOSED: addParticipantTimeItem (generic entry point) now dispatches
    // MODIFY_PARTICIPANTS for the touched participant (batch callers pass disableNotice).
    name: 'addParticipantTimeItem',
    expectation: 'covered',
    run: (ctx) =>
      tournamentEngine.addParticipantTimeItem({
        participantId: ctx.enteredIds[0],
        timeItem: { itemType: 'NOTE', itemValue: 'hello' },
      }),
  },
  {
    // C2-tail CLOSED: addFlight now dispatches MODIFY_EVENT.
    name: 'addFlight',
    expectation: 'covered',
    run: (ctx) => tournamentEngine.addFlight({ eventId: ctx.eventId, drawId: 'scn-flight', drawName: 'Flight 2' }),
  },
  {
    // C2-tail CLOSED: updateDrawIdsOrder dispatches MODIFY_DRAW_DEFINITION per reordered draw.
    name: 'updateDrawIdsOrder',
    expectation: 'covered',
    run: (ctx) => tournamentEngine.updateDrawIdsOrder({ eventId: ctx.eventId, orderedDrawIdsMap: { [ctx.drawId]: 2 } }),
  },
  {
    // C2-tail CLOSED: setEventDisplay now dispatches MODIFY_EVENT.
    name: 'setEventDisplay',
    expectation: 'covered',
    run: (ctx) => tournamentEngine.setEventDisplay({ eventId: ctx.eventId, displaySettings: { draws: {} } }),
  },

  // ── Tier-2 catalog expansion (venues / scheduling / scale-items) ───────────
  {
    name: 'addVenue',
    expectation: 'covered',
    run: () => tournamentEngine.addVenue({ venue: { venueName: 'Center' } }),
  },
  {
    name: 'modifyVenue',
    expectation: 'covered',
    setup: () => tournamentEngine.addVenue({ venue: { venueName: 'Center' } }),
    run: () => {
      const venue = tournamentEngine.getTournament().tournamentRecord.venues[0];
      tournamentEngine.modifyVenue({ venueId: venue.venueId, modifications: { venueName: 'Renamed Center' } });
    },
  },
  {
    name: 'addMatchUpScheduleItems',
    expectation: 'covered',
    run: (ctx) =>
      tournamentEngine.addMatchUpScheduleItems({
        matchUpId: ctx.matchUpId,
        drawId: ctx.drawId,
        schedule: { scheduledDate: '2025-01-05', courtOrder: 1 },
      }),
  },
  {
    name: 'setParticipantScaleItem',
    expectation: 'covered',
    run: (ctx) =>
      tournamentEngine.setParticipantScaleItem({
        participantId: ctx.enteredIds[0],
        scaleItem: { scaleType: 'RATING', eventType: 'SINGLES', scaleName: 'WTN', scaleValue: 15 },
      }),
  },

  // ── Tier-2 batch 2 (publishing) ────────────────────────────────────────────
  {
    name: 'publishEvent',
    expectation: 'covered',
    run: (ctx) => tournamentEngine.publishEvent({ eventId: ctx.eventId }),
  },
  {
    name: 'unPublishEvent',
    expectation: 'covered',
    setup: (ctx) => tournamentEngine.publishEvent({ eventId: ctx.eventId }),
    run: (ctx) => tournamentEngine.unPublishEvent({ eventId: ctx.eventId }),
  },

  // ── Tier-2 batch 3 (draw positions — open-position seed) ───────────────────
  {
    // assignDrawPosition places a participant into an open position →
    // MODIFY_POSITION_ASSIGNMENTS (cascades to MODIFY_DRAW_DEFINITION).
    name: 'assignDrawPosition',
    expectation: 'covered',
    seed: openPositionsContext,
    run: (ctx) =>
      tournamentEngine.assignDrawPosition({
        drawId: ctx.drawId,
        structureId: ctx.structureId,
        drawPosition: 1,
        participantId: ctx.enteredIds[0],
      }),
  },
  {
    // swapDrawPositionAssignments exchanges two assigned positions →
    // MODIFY_POSITION_ASSIGNMENTS. Setup fills positions 1 and 2.
    name: 'swapDrawPositionAssignments',
    expectation: 'covered',
    seed: openPositionsContext,
    setup: (ctx) => {
      tournamentEngine.assignDrawPosition({
        drawId: ctx.drawId,
        structureId: ctx.structureId,
        drawPosition: 1,
        participantId: ctx.enteredIds[0],
      });
      tournamentEngine.assignDrawPosition({
        drawId: ctx.drawId,
        structureId: ctx.structureId,
        drawPosition: 2,
        participantId: ctx.enteredIds[1],
      });
    },
    run: (ctx) =>
      tournamentEngine.swapDrawPositionAssignments({
        drawId: ctx.drawId,
        structureId: ctx.structureId,
        drawPositions: [1, 2],
      }),
  },
  {
    // removeDrawPositionAssignment clears an assigned position →
    // MODIFY_POSITION_ASSIGNMENTS (+ MODIFY_MATCHUP for the cleared matchUp).
    name: 'removeDrawPositionAssignment',
    expectation: 'covered',
    seed: openPositionsContext,
    setup: (ctx) =>
      tournamentEngine.assignDrawPosition({
        drawId: ctx.drawId,
        structureId: ctx.structureId,
        drawPosition: 1,
        participantId: ctx.enteredIds[0],
      }),
    run: (ctx) =>
      tournamentEngine.removeDrawPositionAssignment({
        drawId: ctx.drawId,
        structureId: ctx.structureId,
        drawPosition: 1,
      }),
  },

  // ── Tier-2 batch 4 (scoring — advancement cascade) ─────────────────────────
  {
    // Completing a first-round matchUp advances the winner into round 2. Both the
    // scored matchUp AND the downstream matchUp the winner lands in must each be
    // covered by a MODIFY_MATCHUP — a multi-matchUp coverage probe.
    name: 'setMatchUpStatus (first-round completion → advancement)',
    expectation: 'covered',
    seed: unscoredContext,
    run: (ctx) => {
      const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true });
      const firstRound = matchUps.find(
        (m: any) => m.roundNumber === 1 && m.drawPositions?.filter(Boolean).length === 2,
      );
      tournamentEngine.setMatchUpStatus({
        drawId: ctx.drawId,
        matchUpId: firstRound.matchUpId,
        outcome: { winningSide: 1, scoreString: '6-3 6-2' },
      });
    },
  },

  // ── Tier-2 batch 5 (seeding) ───────────────────────────────────────────────
  {
    // modifySeedAssignment adds/updates a seed on the structure →
    // MODIFY_SEED_ASSIGNMENTS (cascades to MODIFY_DRAW_DEFINITION).
    name: 'modifySeedAssignment',
    expectation: 'covered',
    seed: seededContext,
    run: (ctx) =>
      tournamentEngine.modifySeedAssignment({
        drawId: ctx.drawId,
        structureId: ctx.structureId,
        participantId: unseededEnteredId(ctx),
        seedValue: 3,
      }),
  },
  {
    // assignSeedPositions reassigns a seed number to a different participant →
    // MODIFY_SEED_ASSIGNMENTS.
    name: 'assignSeedPositions',
    expectation: 'covered',
    seed: seededContext,
    run: (ctx) =>
      tournamentEngine.assignSeedPositions({
        drawId: ctx.drawId,
        structureId: ctx.structureId,
        assignments: [{ seedNumber: 1, participantId: unseededEnteredId(ctx) }],
      }),
  },

  // ── Tier-2 batch 6 (tieFormat) ─────────────────────────────────────────────
  {
    // addCollectionDefinition adds a collection to a team draw's tieFormat →
    // ADD_MATCHUPS (new tie rubbers) + MODIFY_MATCHUP (parent ties) +
    // MODIFY_DRAW_DEFINITION (tieFormat on the draw).
    name: 'addCollectionDefinition',
    expectation: 'covered',
    seed: teamContext,
    run: (ctx) =>
      tournamentEngine.addCollectionDefinition({
        drawId: ctx.drawId,
        collectionDefinition: {
          matchUpType: 'DOUBLES',
          matchUpFormat: 'SET1-S:T10P',
          collectionName: 'Overtime',
          matchUpCount: 1,
          matchUpValue: 1,
        },
      }),
  },

  // ── Tier-2 batch 6 (draw generation) ───────────────────────────────────────
  {
    // Generating + adding a draw attaches a whole drawDefinition subtree →
    // ADD_DRAW_DEFINITION (draw + its entries) + ADD_MATCHUPS. (generateDrawDefinition
    // is a pure generator and dispatches nothing; the record change is the add.)
    name: 'generateDrawDefinition + addDrawDefinition',
    expectation: 'covered',
    seed: drawGenContext,
    run: (ctx) => {
      const { drawDefinition } = tournamentEngine.generateDrawDefinition({ eventId: ctx.eventId, drawSize: 8 });
      tournamentEngine.addDrawDefinition({ eventId: ctx.eventId, drawDefinition });
    },
  },

  // ── Tier-2 batch 7 (deletion + structural breadth) ─────────────────────────
  {
    // Deleting a draw removes it (DELETED_DRAW_IDS + DELETED_MATCHUP_IDS) AND
    // mutates the event's flightProfile — the event must get MODIFY_EVENT (the
    // symmetric case of the addDrawDefinition gap). Unscored seed so the delete
    // is not blocked by SCORES_PRESENT.
    name: 'deleteDrawDefinitions',
    expectation: 'covered',
    seed: unscoredContext,
    run: (ctx) => tournamentEngine.deleteDrawDefinitions({ eventId: ctx.eventId, drawIds: [ctx.drawId] }),
  },
  {
    // addParticipants → ADD_PARTICIPANTS.
    name: 'addParticipants',
    expectation: 'covered',
    run: () =>
      tournamentEngine.addParticipants({
        participants: [
          {
            participantId: 'conf-new-participant',
            participantType: INDIVIDUAL,
            participantRole: 'COMPETITOR',
            person: { standardGivenName: 'New', standardFamilyName: 'Entrant' },
          },
        ],
      }),
  },
  {
    // deleteParticipants (an unentered alternate) → DELETE_PARTICIPANTS.
    name: 'deleteParticipants',
    expectation: 'covered',
    run: (ctx) => tournamentEngine.deleteParticipants({ participantIds: [ctx.alternateIds[0]] }),
  },
  {
    // addPenalty attaches a penalty timeItem to a participant → MODIFY_PARTICIPANTS.
    name: 'addPenalty',
    expectation: 'covered',
    run: (ctx) =>
      tournamentEngine.addPenalty({
        participantIds: [ctx.enteredIds[0]],
        penaltyType: 'Ball Abuse',
        penaltyCode: 'conf-penalty',
        matchUpId: ctx.matchUpId,
        drawId: ctx.drawId,
      }),
  },
  {
    // setMatchUpFormat on a draw rewrites each structure's matchUpFormat →
    // MODIFY_DRAW_DEFINITION (per modified structure).
    name: 'setMatchUpFormat (draw scope)',
    expectation: 'covered',
    run: (ctx) => tournamentEngine.setMatchUpFormat({ drawId: ctx.drawId, matchUpFormat: 'SET3-S:4/TB7' }),
  },
  {
    // addCourt adds a court under a venue → MODIFY_VENUE.
    name: 'addCourt',
    expectation: 'covered',
    setup: () => tournamentEngine.addVenue({ venue: { venueName: 'Center' } }),
    run: () => {
      const venue = tournamentEngine.getTournament().tournamentRecord.venues[0];
      tournamentEngine.addCourt({ venueId: venue.venueId, court: { courtName: 'Court 1' } });
    },
  },

  // ── Tier-2 batch 8 (tournament-root attributes) ────────────────────────────
  {
    // setTournamentName changes a root scalar → MODIFY_TOURNAMENT_DETAIL. Exercises
    // the new `tournament` entity kind (previously the harness tracked no root attrs).
    name: 'setTournamentName',
    expectation: 'covered',
    run: () => tournamentEngine.setTournamentName({ tournamentName: 'Conformance Renamed Open' }),
  },
  {
    // setTournamentDates widens the window (no matchUp unscheduled) → the root
    // start/end/activeDates/weekdays change, covered by MODIFY_TOURNAMENT_DETAIL.
    name: 'setTournamentDates (widen)',
    expectation: 'covered',
    run: () => tournamentEngine.setTournamentDates({ startDate: '2025-01-01', endDate: '2025-01-20' }),
  },

  // ── Tier-2 batch 9 (event-scope format + venue/schedule breadth) ───────────
  {
    // setMatchUpFormat at EVENT scope (no drawIds/structureIds) writes
    // event.matchUpFormat → must be covered by MODIFY_EVENT. (Distinct code path
    // from the draw-scope scenario above, which routes through MODIFY_DRAW_DEFINITION.)
    name: 'setMatchUpFormat (event scope)',
    expectation: 'covered',
    run: (ctx) => tournamentEngine.setMatchUpFormat({ eventId: ctx.eventId, matchUpFormat: 'SET3-S:4/TB7' }),
  },
  {
    // deleteVenue → DELETE_VENUE.
    name: 'deleteVenue',
    expectation: 'covered',
    setup: () => tournamentEngine.addVenue({ venue: { venueName: 'Center' } }),
    run: () => {
      const venue = tournamentEngine.getTournament().tournamentRecord.venues[0];
      tournamentEngine.deleteVenue({ venueId: venue.venueId });
    },
  },
  {
    // modifyCourt → MODIFY_VENUE (a court is a sub-entity of the venue).
    name: 'modifyCourt',
    expectation: 'covered',
    setup: () => {
      tournamentEngine.addVenue({ venue: { venueName: 'Center' } });
      const venue = tournamentEngine.getTournament().tournamentRecord.venues[0];
      tournamentEngine.addCourt({ venueId: venue.venueId, court: { courtName: 'Court 1' } });
    },
    run: () => {
      const venue = tournamentEngine.getTournament().tournamentRecord.venues[0];
      tournamentEngine.modifyCourt({ courtId: venue.courts[0].courtId, modifications: { indoorOutdoor: 'INDOOR' } });
    },
  },
  {
    // assignMatchUpCourt attaches a court to a matchUp's schedule → MODIFY_MATCHUP.
    name: 'assignMatchUpCourt',
    expectation: 'covered',
    setup: (ctx) => {
      tournamentEngine.addVenue({ venue: { venueName: 'Center' } });
      const venue = tournamentEngine.getTournament().tournamentRecord.venues[0];
      tournamentEngine.addCourt({ venueId: venue.venueId, court: { courtName: 'Court 1' } });
      tournamentEngine.addMatchUpScheduleItems({
        matchUpId: ctx.matchUpId,
        drawId: ctx.drawId,
        schedule: { scheduledDate: '2025-01-05' },
      });
    },
    run: (ctx) => {
      const venue = tournamentEngine.getTournament().tournamentRecord.venues[0];
      tournamentEngine.assignMatchUpCourt({
        matchUpId: ctx.matchUpId,
        drawId: ctx.drawId,
        courtId: venue.courts[0].courtId,
        courtDayDate: '2025-01-05',
      });
    },
  },

  // ── Tier-2 batch 10 (cross-entity coercion gaps) ───────────────────────────
  {
    // Shrinking the tournament window coerces each event's start/end inward
    // (coerceEventDates). The event entities change and must get MODIFY_EVENT —
    // not just the root MODIFY_TOURNAMENT_DETAIL.
    name: 'setTournamentDates (shrink → event date coerce)',
    expectation: 'covered',
    run: () => tournamentEngine.setTournamentDates({ startDate: '2025-01-05', endDate: '2025-01-10' }),
  },
  {
    // Reordering an event-level tieFormat's collections (no structureIds) writes
    // event.tieFormat → must be covered by MODIFY_EVENT.
    name: 'orderCollectionDefinitions (event scope)',
    expectation: 'covered',
    seed: teamContext,
    run: (ctx) => {
      const event = tournamentEngine.getTournament().tournamentRecord.events[0];
      const defs = event.tieFormat.collectionDefinitions;
      const orderMap: Record<string, number> = {};
      defs.forEach((d: any, i: number) => (orderMap[d.collectionId] = defs.length - i));
      tournamentEngine.orderCollectionDefinitions({ eventId: ctx.eventId, orderMap });
    },
  },

  // ── Tier-2 batch 11 (entries-family event mutations) ───────────────────────
  {
    // setEntryPositions rewrites event.entries' entryPosition values → the entry
    // entities change and must be covered by MODIFY_EVENT_ENTRIES.
    name: 'setEntryPositions',
    expectation: 'covered',
    run: (ctx) => {
      const event = tournamentEngine.getTournament().tournamentRecord.events[0];
      const [a, b] = event.entries;
      tournamentEngine.setEntryPositions({
        eventId: ctx.eventId,
        entryPositions: [
          { participantId: a.participantId, entryPosition: (b.entryPosition ?? 2) + 10 },
          { participantId: b.participantId, entryPosition: (a.entryPosition ?? 1) + 10 },
        ],
      });
    },
  },
  {
    // modifyEntriesStatus changes an event entry's entryStatus (ALTERNATE→WITHDRAWN)
    // → event.entries changes and must be covered by MODIFY_EVENT_ENTRIES.
    name: 'modifyEntriesStatus (event entry)',
    expectation: 'covered',
    setup: (ctx) =>
      tournamentEngine.addEventEntries({
        eventId: ctx.eventId,
        participantIds: [ctx.alternateIds[0]],
        entryStatus: 'ALTERNATE',
      }),
    run: (ctx) =>
      tournamentEngine.modifyEntriesStatus({
        eventId: ctx.eventId,
        participantIds: [ctx.alternateIds[0]],
        entryStatus: 'WITHDRAWN',
      }),
  },
  {
    // modifyEventEntries adds ungrouped individual entries to a doubles event →
    // event.entries grows and must be covered by MODIFY_EVENT_ENTRIES.
    name: 'modifyEventEntries (add ungrouped)',
    expectation: 'covered',
    seed: doublesContext,
    run: (ctx) => {
      const record = tournamentEngine.getTournament().tournamentRecord;
      const event = record.events[0];
      const enteredPairIds = new Set(event.entries.map((e: any) => e.participantId));
      const pairedIndividuals = new Set(
        record.participants
          .filter((p: any) => p.participantType === 'PAIR' && enteredPairIds.has(p.participantId))
          .flatMap((p: any) => p.individualParticipantIds ?? []),
      );
      const spare = record.participants
        .filter((p: any) => p.participantType === 'INDIVIDUAL' && !pairedIndividuals.has(p.participantId))
        .map((p: any) => p.participantId);
      tournamentEngine.modifyEventEntries({ eventId: ctx.eventId, unpairedParticipantIds: [spare[0], spare[1]] });
    },
  },

  // ── Tier-2 batch 13 (entries draw-scope + draw/tournament regression guards) ─
  {
    // modifyEntriesStatus on a DRAW entry (open-position seed so it isn't blocked
    // by a position assignment) changes drawDefinition.entries → MODIFY_DRAW_ENTRIES.
    name: 'modifyEntriesStatus (draw entry)',
    expectation: 'covered',
    seed: openPositionsContext,
    run: (ctx) =>
      tournamentEngine.modifyEntriesStatus({
        drawId: ctx.drawId,
        participantIds: [ctx.enteredIds[0]],
        entryStatus: 'ALTERNATE',
      }),
  },
  {
    // modifyDrawName renames the draw AND updates the matching flightProfile flight's
    // drawName on the event → MODIFY_DRAW_DEFINITION + (event flightProfile) MODIFY_EVENT.
    name: 'modifyDrawName',
    expectation: 'covered',
    run: (ctx) => tournamentEngine.modifyDrawName({ drawId: ctx.drawId, drawName: 'Renamed Draw' }),
  },
  {
    // setTournamentTier writes a root TierClassification → MODIFY_TOURNAMENT_DETAIL.
    name: 'setTournamentTier',
    expectation: 'covered',
    run: () => tournamentEngine.setTournamentTier({ tournamentTier: { system: 'ITF', value: 'J100' } }),
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
      const ctx = (scn.seed ?? seedContext)();
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
