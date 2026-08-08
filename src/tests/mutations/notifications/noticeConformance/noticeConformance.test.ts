import {
  captureNotices,
  castDiff,
  castTableOwnerNames,
  changedEntities,
  conformanceViolations,
  fidelityViolations,
} from './harness';
import { setSubscriptions, deleteNotices } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { INDIVIDUAL } from '@Constants/participantConstants';
import { cast } from '@Query/readModel/cast';
import {
  DELETED_MATCHUP_IDS,
  MODIFY_DRAW_DEFINITION,
  MODIFY_MATCHUP,
  MODIFY_PARTICIPANTS,
  UPDATE_INCONTEXT_MATCHUP,
} from '@Constants/topicConstants';

// Workstream D-core scaffold. Demonstrates the notice-completeness invariant on
// two representative mutations: one COVERED (zero violations) and one KNOWN GAP
// (the harness flags it). The full ~640-method catalog sweep is the follow-on.

function seed() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    tournamentAttributes: { tournamentId: 'conf-t1' },
    startDate: '2025-01-01',
    endDate: '2025-01-14',
    drawProfiles: [{ drawSize: 8, eventName: 'Singles' }],
    completeAllMatchUps: true,
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);
}

const reset = () => {
  setSubscriptions({ subscriptions: {} });
  deleteNotices();
};

describe('notice conformance harness (D-core scaffold)', () => {
  beforeEach(reset);
  afterEach(reset);

  it('COMPLETENESS: a covered mutation (modifyParticipant) yields zero violations', () => {
    seed();
    const before = structuredClone(tournamentEngine.getTournament().tournamentRecord);
    const { participants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [INDIVIDUAL] },
    });
    const target = participants[0];

    const captured = captureNotices(() => {
      tournamentEngine.modifyParticipant({
        participant: {
          ...target,
          person: { ...(target.person ?? {}), standardGivenName: 'Pete', standardFamilyName: 'Sampras' },
        },
      });
    });
    const after = structuredClone(tournamentEngine.getTournament().tournamentRecord);

    expect(captured.some((n) => n.topic === MODIFY_PARTICIPANTS)).toBe(true);
    expect(conformanceViolations(before, after, captured)).toEqual([]);
  });

  it('COMPLETENESS: setEventDates changes the event and is covered by MODIFY_EVENT (C2 closed)', () => {
    seed();
    const before = structuredClone(tournamentEngine.getTournament().tournamentRecord);
    const eventId = before.events[0].eventId;

    const captured = captureNotices(() => {
      tournamentEngine.setEventDates({ eventId, startDate: '2025-01-03', endDate: '2025-01-12' });
    });
    const after = structuredClone(tournamentEngine.getTournament().tournamentRecord);

    // the event attributes changed, and MODIFY_EVENT (added in C2) now covers it.
    expect(changedEntities(before, after).some((c) => c.kind === 'event' && c.change === 'modified')).toBe(true);
    expect(conformanceViolations(before, after, captured)).toEqual([]);
  });

  it('FIDELITY: castDiff is empty for an unchanged record (sanity)', () => {
    seed();
    const record = tournamentEngine.getTournament().tournamentRecord;
    expect(Object.keys(castDiff(record, structuredClone(record)))).toEqual([]);
  });

  // ── FALSIFYING THE DETECTOR ───────────────────────────────────────────────
  // A green conformance run is only evidence if the oracle can also report DIRTY.
  // These three prove `fidelityViolations` fails for the right reasons rather than
  // being vacuously empty — otherwise a broken oracle reads exactly like a clean
  // read model. (Mentat standards: verification discipline / falsify the detector.)

  it('FIDELITY: reports CLEAN with the real notice stream, DIRTY when the covering notice is dropped', () => {
    // UNSCORED seed: scoring a first-round matchUp genuinely moves match_ups rows
    // (a completeAllMatchUps seed is already scored, so the mutation would be a no-op
    // and the test would prove nothing).
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      tournamentAttributes: { tournamentId: 'conf-falsify' },
      participantsProfile: { participantsCount: 16 },
      drawProfiles: [{ drawSize: 8, eventName: 'Singles' }],
      startDate: '2025-01-01',
      endDate: '2025-01-14',
      nonRandom: 1,
    });
    tournamentEngine.setState(tournamentRecord);
    const before = structuredClone(tournamentEngine.getTournament().tournamentRecord);
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const target = matchUps.find((m: any) => m.roundNumber === 1 && m.sides?.every((s: any) => s.participantId));
    const { matchUpId, drawId } = target;

    let outcome: any;
    const captured = captureNotices(() => {
      outcome = tournamentEngine.setMatchUpStatus({
        matchUpId,
        drawId,
        outcome: {
          score: {
            sets: [
              { side1Score: 6, side2Score: 1, winningSide: 1 },
              { side1Score: 6, side2Score: 1, winningSide: 1 },
            ],
          },
          winningSide: 1,
          matchUpStatus: 'COMPLETED',
        },
      });
    });
    expect(outcome?.success).toBe(true);
    const after = structuredClone(tournamentEngine.getTournament().tournamentRecord);

    // the mutation genuinely moved projected rows — otherwise this proves nothing
    expect(Object.keys(castDiff(before, after)).length).toBeGreaterThan(0);
    // …and with the true stream the oracle is clean
    expect(fidelityViolations(before, after, captured)).toEqual([]);

    // now DROP every notice that identifies a matchUp or its owning draw. The record
    // change is identical; only the notice stream is impoverished. A working oracle
    // must flip to dirty here.
    const starved = captured.filter(
      (n) => ![MODIFY_MATCHUP, UPDATE_INCONTEXT_MATCHUP, MODIFY_DRAW_DEFINITION, DELETED_MATCHUP_IDS].includes(n.topic),
    );
    const starvedViolations = fidelityViolations(before, after, starved);
    expect(starvedViolations.length).toBeGreaterThan(0);
    expect(starvedViolations.some((v) => v.table === 'match_ups')).toBe(true);
  });

  it('FIDELITY: an empty notice stream is dirty for any row-moving mutation', () => {
    seed();
    const before = structuredClone(tournamentEngine.getTournament().tournamentRecord);
    tournamentEngine.setTournamentName({ tournamentName: 'Renamed Open' });
    const after = structuredClone(tournamentEngine.getTournament().tournamentRecord);

    expect(fidelityViolations(before, after, []).some((v) => v.table === 'tournaments')).toBe(true);
  });

  it('FIDELITY: every cast() table has a CAST_TABLE_OWNER mapping (drift guard)', () => {
    // The fidelity oracle fails CLOSED on an unmapped table, so an unmapped table would
    // surface as a violation on every scenario that touches it. This guard catches the
    // drift at its source instead: add a table to the read model, decide which notice
    // covers it. Asserted against a rich record so sparse tables are populated too.
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      tournamentAttributes: { tournamentId: 'conf-owner-drift' },
      participantsProfile: { participantsCount: 16 },
      drawProfiles: [{ drawSize: 8, seedsCount: 4, eventName: 'Singles' }],
      venueProfiles: [{ courtsCount: 2 }],
      startDate: '2025-01-01',
      endDate: '2025-01-14',
      completeAllMatchUps: true,
      nonRandom: 1,
    });
    tournamentEngine.setState(tournamentRecord);
    tournamentEngine.publishEvent({ eventId: tournamentEngine.getTournament().tournamentRecord.events[0].eventId });
    tournamentEngine.publishOrderOfPlay();

    const rows: any = cast({ tournamentRecord: tournamentEngine.getTournament().tournamentRecord })?.rows;
    const unmapped = Object.keys(rows ?? {}).filter((table) => !castTableOwnerNames().includes(table));
    expect(unmapped).toEqual([]);
  });
});
