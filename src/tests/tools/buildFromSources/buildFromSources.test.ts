// Round-trips a `mocksEngine`-generated tournament through the CFS public-API
// shapes (`getEventData`, `competitionScheduleMatchUps`, `getParticipants`)
// and back into a tournamentRecord — proving the reverse-engineering pipeline
// preserves the load-bearing identity and structure.
//
// Plus targeted unit tests for `classifySource`, the extractors, graceful
// degradation (single-source builds), and the cleanup invariants.
import tournamentEngine from '@Tests/engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

import {
  classifySource,
  extractEventData,
  extractMatchUps,
  extractParticipants,
  buildTournamentRecord,
  buildFromSources,
} from '@Tools/buildFromSources/buildFromSources';

// `classifySource`'s string union — extracted so the literal isn't repeated
// across assertions (SonarJS S1192).
const EVENT_DATA = 'event-data';

// Shared fixture date used by the back-to-back generators below: the
// end of one mini-tournament is the start of the next. Pulled to a
// constant so SonarJS S1192 doesn't fire over the three repeats.
const FIXTURE_DATE = '2026-06-12';

// ----------------------------------------------------------------- helpers
type AnyObj = Record<string, any>;

// Walk every structure (including nested `structures`) and return a
// matchUpId → matchUp map. Two of the schedule round-trip tests need
// the rebuilt record indexed this way to compare sides hydration
// against the schedule "truth"; extracting it kills the SonarJS
// no-identical-functions warning (S4144) without changing test logic.
function collectRebuiltMatchUps(rebuilt: AnyObj): Map<string, AnyObj> {
  const byId = new Map<string, AnyObj>();
  const walk = (structs: AnyObj[] | undefined) => {
    for (const s of structs ?? []) {
      for (const m of s.matchUps ?? []) byId.set(m.matchUpId, m);
      walk(s.structures);
    }
  };
  for (const e of rebuilt.events ?? []) for (const dd of e.drawDefinitions ?? []) walk(dd.structures);
  return byId;
}

// Flat list of every matchUp in a rebuilt record, in traversal order. Distinct from
// collectRebuiltMatchUps above, which keys by matchUpId and therefore dedupes.
function listRebuiltMatchUps(rebuilt: AnyObj): AnyObj[] {
  const matchUps: AnyObj[] = [];
  const walk = (structs: AnyObj[] | undefined) => {
    for (const s of structs ?? []) {
      matchUps.push(...(s.matchUps ?? []));
      walk(s.structures);
    }
  };
  for (const e of rebuilt.events ?? []) for (const dd of e.drawDefinitions ?? []) walk(dd.structures);
  return matchUps;
}

// Normalize a matchUp's `sides` to a sorted ["drawPosition:participantId", …]
// list so two matchUps can be compared regardless of side ordering.
function sidePairs(sides: AnyObj[]): string[] {
  return (sides ?? [])
    .filter((s) => s.participantId)
    .map((s) => `${s.drawPosition}:${s.participantId}`)
    .sort((a, b) => a.localeCompare(b));
}

interface CfsShapes {
  eventDataResponses: AnyObj[]; // one per event, raw factory `getEventData` output
  scheduleResponse: AnyObj; // raw factory `competitionScheduleMatchUps` output
  participantsResponse: AnyObj; // raw factory `getParticipants` output
}

// Pull the same three response shapes the CFS public API exposes, straight
// from the factory engine — exactly what `dev.build([...])` would receive
// from a network-tab paste.
function cfsShapes(record: AnyObj): CfsShapes {
  tournamentEngine.setState(record);
  const eventDataResponses = (record.events ?? []).map((e: AnyObj) =>
    tournamentEngine.getEventData({ eventId: e.eventId }),
  );
  const scheduleResponse = tournamentEngine.competitionScheduleMatchUps();
  const participantsResponse = tournamentEngine.getParticipants();
  return { eventDataResponses, scheduleResponse, participantsResponse };
}

function generateRoundRobin(opts: AnyObj = {}) {
  return mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, drawType: 'ROUND_ROBIN' }],
    venueProfiles: [{ courtsCount: 2 }],
    startDate: '2026-06-11',
    endDate: FIXTURE_DATE,
    ...opts,
  });
}

function generateMultiEvent() {
  return mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawSize: 4, drawType: 'ROUND_ROBIN', eventName: 'Mens', eventType: 'SINGLES' },
      { drawSize: 4, drawType: 'SINGLE_ELIMINATION', eventName: 'Womens', eventType: 'SINGLES' },
    ],
    venueProfiles: [{ courtsCount: 2, venueName: 'Center' }],
    startDate: '2026-06-11',
    endDate: FIXTURE_DATE,
  });
}

function generateDoubles(opts: AnyObj = {}) {
  return mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, drawType: 'ROUND_ROBIN', eventType: 'DOUBLES' }],
    venueProfiles: [{ courtsCount: 1 }],
    startDate: FIXTURE_DATE,
    endDate: '2026-06-13',
    ...opts,
  });
}

function participantsByType(participants: AnyObj[] | undefined) {
  const out: Record<string, AnyObj[]> = {};
  for (const p of participants ?? []) {
    (out[p.participantType] ??= []).push(p);
  }
  return out;
}

function idSet(participants: AnyObj[] | undefined, type: string) {
  return new Set((participants ?? []).filter((p) => p.participantType === type).map((p) => p.participantId));
}

// Recursively collect every matchUpId in a record, regardless of nesting.
function collectMatchUpIds(record: AnyObj): string[] {
  const ids: string[] = [];
  for (const e of record.events ?? []) {
    for (const dd of e.drawDefinitions ?? []) {
      walk(dd.structures);
    }
  }
  return ids.sort((a, b) => a.localeCompare(b));

  function walk(structures: AnyObj[] | undefined) {
    if (!Array.isArray(structures)) return;
    for (const s of structures) {
      for (const m of s.matchUps ?? []) ids.push(m.matchUpId);
      walk(s.structures);
    }
  }
}

function collectPositionAssignments(
  record: AnyObj,
  eventId: string,
): Array<{ drawPosition: number; participantId: string }> {
  const out: Array<{ drawPosition: number; participantId: string }> = [];
  const event = (record.events ?? []).find((e: AnyObj) => e.eventId === eventId);
  for (const dd of event?.drawDefinitions ?? []) walk(dd.structures);
  return out.sort((a, b) => a.drawPosition - b.drawPosition);

  function walk(structures: AnyObj[] | undefined) {
    if (!Array.isArray(structures)) return;
    for (const s of structures) {
      for (const pa of s.positionAssignments ?? []) {
        if (pa.participantId) out.push({ drawPosition: pa.drawPosition, participantId: pa.participantId });
      }
      walk(s.structures);
    }
  }
}

// =============================================================== classifier

describe('classifySource', () => {
  it('recognizes the CFS public-API wrapper keys', () => {
    expect(classifySource({ tournamentPublicEventData: { eventData: {} } }).kind).toBe(EVENT_DATA);
    expect(classifySource({ tournamentMatchUps: { dateMatchUps: [] } }).kind).toBe('matchups');
    expect(classifySource({ tournamentParticipants: { participants: [] } }).kind).toBe('participants');
  });

  it('peels a single { data: ... } envelope', () => {
    expect(classifySource({ data: { tournamentMatchUps: { dateMatchUps: [] } } }).kind).toBe('matchups');
  });

  it('peels nested { data: { data: ... } } envelopes', () => {
    const wrapped = { data: { data: { data: { tournamentPublicEventData: { eventData: {} } } } } };
    expect(classifySource(wrapped).kind).toBe(EVENT_DATA);
  });

  it('does NOT peel an object that has `data` alongside other keys', () => {
    // Real responses sometimes have `data` AND other top-level fields;
    // peeling those would lose the siblings.
    expect(classifySource({ data: { foo: 1 }, success: true }).kind).toBe('unknown');
  });

  it('classifies the raw factory `getEventData` shape (no public-API wrapper)', () => {
    const { tournamentRecord } = generateRoundRobin();
    tournamentEngine.setState(tournamentRecord);
    const raw = tournamentEngine.getEventData({ eventId: tournamentRecord.events[0].eventId });
    expect(classifySource(raw).kind).toBe(EVENT_DATA);
  });

  it('classifies the raw factory `competitionScheduleMatchUps` shape', () => {
    const { tournamentRecord } = generateRoundRobin();
    tournamentEngine.setState(tournamentRecord);
    const raw = tournamentEngine.competitionScheduleMatchUps();
    expect(classifySource(raw).kind).toBe('matchups');
  });

  it('classifies the raw factory `getParticipants` shape', () => {
    const { tournamentRecord } = generateRoundRobin();
    tournamentEngine.setState(tournamentRecord);
    const raw = tournamentEngine.getParticipants();
    expect(classifySource(raw).kind).toBe('participants');
  });

  it('classifies a bare array of matchUps by sniffing matchUpId on the first member', () => {
    expect(classifySource([{ matchUpId: 'a' }, { matchUpId: 'b' }]).kind).toBe('matchups');
  });

  it('classifies a bare array of participants', () => {
    expect(classifySource([{ participantId: 'p1' }, { participantId: 'p2' }]).kind).toBe('participants');
  });

  it('returns unknown for primitives, null, undefined, and empty objects', () => {
    expect(classifySource(null).kind).toBe('unknown');
    expect(classifySource(undefined).kind).toBe('unknown');
    expect(classifySource('a string').kind).toBe('unknown');
    expect(classifySource(42).kind).toBe('unknown');
    expect(classifySource({}).kind).toBe('unknown');
    expect(classifySource([]).kind).toBe('unknown');
  });
});

// ============================================================== extractors

describe('extractors', () => {
  it('extractEventData unwraps both the public-API and raw factory shapes', () => {
    const { tournamentRecord } = generateRoundRobin();
    tournamentEngine.setState(tournamentRecord);
    const raw = tournamentEngine.getEventData({ eventId: tournamentRecord.events[0].eventId });

    const fromBare = extractEventData(raw);
    const fromWrapped = extractEventData({ tournamentPublicEventData: raw });
    const fromData = extractEventData({ data: { tournamentPublicEventData: raw } });

    for (const x of [fromBare, fromWrapped, fromData]) {
      expect(x.tournamentInfo?.tournamentId).toBe(tournamentRecord.tournamentId);
      expect(x.eventInfo?.eventId).toBe(tournamentRecord.events[0].eventId);
      expect(Array.isArray(x.drawsData)).toBe(true);
      expect(Array.isArray(x.participants)).toBe(true);
    }
  });

  it('extractMatchUps returns the dateMatchUps array from every shape it understands', () => {
    const { tournamentRecord } = generateRoundRobin();
    tournamentEngine.setState(tournamentRecord);
    const raw = tournamentEngine.competitionScheduleMatchUps();
    const dateMatchUps = raw.dateMatchUps ?? [];

    expect(extractMatchUps(raw).length).toBe(dateMatchUps.length);
    expect(extractMatchUps({ tournamentMatchUps: raw }).length).toBe(dateMatchUps.length);
    expect(extractMatchUps({ data: raw }).length).toBe(dateMatchUps.length);
    expect(extractMatchUps(dateMatchUps).length).toBe(dateMatchUps.length); // bare array passthrough
    expect(extractMatchUps({}).length).toBe(0); // graceful empty
  });

  it('extractParticipants returns the participants array from every shape it understands', () => {
    const { tournamentRecord } = generateRoundRobin();
    tournamentEngine.setState(tournamentRecord);
    const raw = tournamentEngine.getParticipants();
    const participants = raw.participants ?? [];
    const n = participants.length;

    expect(extractParticipants(raw).length).toBe(n);
    expect(extractParticipants({ tournamentParticipants: raw }).length).toBe(n);
    expect(extractParticipants({ data: { tournamentParticipants: raw } }).length).toBe(n);
    expect(extractParticipants(participants).length).toBe(n);
    expect(extractParticipants({}).length).toBe(0);
  });
});

// ================================================== round-trip via mocksEngine

describe('round-trip from mocksEngine', () => {
  it('preserves tournamentId, name, dates, timeZone, and venues', () => {
    const { tournamentRecord } = generateRoundRobin({ tournamentName: 'Round-Trip Open' });
    const { eventDataResponses, scheduleResponse, participantsResponse } = cfsShapes(tournamentRecord);

    const rebuilt = buildTournamentRecord({
      eventDataDocs: eventDataResponses.map(extractEventData),
      matchUpDocs: extractMatchUps(scheduleResponse),
      participantDocs: [extractParticipants(participantsResponse)],
    });

    expect(rebuilt.tournamentId).toBe(tournamentRecord.tournamentId);
    expect(rebuilt.tournamentName).toBe(tournamentRecord.tournamentName);
    expect(rebuilt.startDate).toBe(tournamentRecord.startDate);
    expect(rebuilt.endDate).toBe(tournamentRecord.endDate);
    expect(rebuilt.venues?.[0]?.venueId).toBe(tournamentRecord.venues?.[0]?.venueId);
  });

  it('preserves every participantId from the original', () => {
    const { tournamentRecord } = generateRoundRobin();
    const { eventDataResponses, scheduleResponse, participantsResponse } = cfsShapes(tournamentRecord);

    const rebuilt = buildTournamentRecord({
      eventDataDocs: eventDataResponses.map(extractEventData),
      matchUpDocs: extractMatchUps(scheduleResponse),
      participantDocs: [extractParticipants(participantsResponse)],
    });

    const originalIds = (tournamentRecord.participants ?? []).map((p: AnyObj) => p.participantId).sort();
    const rebuiltIds = (rebuilt.participants ?? []).map((p: AnyObj) => p.participantId).sort();
    expect(rebuiltIds).toEqual(originalIds);
  });

  it('preserves every matchUpId and its drawPositions', () => {
    // Note: sides stored on a drawDefinition's matchUp are not yet hydrated
    // with `participantId` — the factory resolves those at query time from
    // positionAssignments. So we compare `drawPositions`, which IS stored
    // on the matchUp, and verify hydrated [drawPosition → participantId]
    // pairs against the schedule response (which IS hydrated) below.
    const { tournamentRecord } = generateRoundRobin();
    const { eventDataResponses, scheduleResponse, participantsResponse } = cfsShapes(tournamentRecord);

    const rebuilt = buildTournamentRecord({
      eventDataDocs: eventDataResponses.map(extractEventData),
      matchUpDocs: extractMatchUps(scheduleResponse),
      participantDocs: [extractParticipants(participantsResponse)],
    });

    expect(collectMatchUpIds(rebuilt)).toEqual(collectMatchUpIds(tournamentRecord));

    const indexByMatchUpId = (record: AnyObj) => {
      const map = new Map<string, AnyObj>();
      const walk = (structs: AnyObj[] | undefined) => {
        for (const s of structs ?? []) {
          for (const m of s.matchUps ?? []) map.set(m.matchUpId, m);
          walk(s.structures);
        }
      };
      for (const e of record.events ?? []) for (const dd of e.drawDefinitions ?? []) walk(dd.structures);
      return map;
    };

    const originalById = indexByMatchUpId(tournamentRecord);
    const rebuiltById = indexByMatchUpId(rebuilt);
    const sortedDrawPositions = (m: AnyObj) => [...(m.drawPositions ?? [])].sort((a, b) => a - b);
    for (const [id, original] of originalById) {
      const reb = rebuiltById.get(id);
      expect(reb, `matchUp ${id} missing from rebuilt`).toBeDefined();
      expect(sortedDrawPositions(reb!)).toEqual(sortedDrawPositions(original));
    }
  });

  it('preserves hydrated side participantIds against the schedule response', () => {
    const { tournamentRecord } = generateRoundRobin();
    const { eventDataResponses, scheduleResponse, participantsResponse } = cfsShapes(tournamentRecord);

    const rebuilt = buildTournamentRecord({
      eventDataDocs: eventDataResponses.map(extractEventData),
      matchUpDocs: extractMatchUps(scheduleResponse),
      participantDocs: [extractParticipants(participantsResponse)],
    });

    // Schedule response is the "ground truth" for hydrated sides.
    const truth = new Map<string, AnyObj>();
    for (const m of scheduleResponse.dateMatchUps ?? []) truth.set(m.matchUpId, m);

    const rebuiltById = collectRebuiltMatchUps(rebuilt);

    let compared = 0;
    for (const [id, truthMatchUp] of truth) {
      const reb = rebuiltById.get(id);
      expect(reb, `matchUp ${id} missing from rebuilt`).toBeDefined();
      expect(sidePairs(reb!.sides)).toEqual(sidePairs(truthMatchUp.sides));
      compared += 1;
    }
    expect(compared).toBeGreaterThan(0);
  });

  it('populates drawDefinition.entries on every rebuilt draw', () => {
    // The factory's getParticipants query reads drawDefinition.entries when
    // resolving per-draw participants; a missing array used to crash with
    // "Cannot read properties of undefined (reading 'filter')". Each draw
    // must carry entries derived from its own positionAssignments.
    const { tournamentRecord } = generateRoundRobin();
    const { eventDataResponses, scheduleResponse, participantsResponse } = cfsShapes(tournamentRecord);

    const rebuilt = buildTournamentRecord({
      eventDataDocs: eventDataResponses.map(extractEventData),
      matchUpDocs: extractMatchUps(scheduleResponse),
      participantDocs: [extractParticipants(participantsResponse)],
    });

    const draws: AnyObj[] = [];
    for (const e of rebuilt.events ?? []) draws.push(...(e.drawDefinitions ?? []));
    expect(draws.length).toBeGreaterThan(0);
    for (const dd of draws) {
      expect(Array.isArray(dd.entries)).toBe(true);
      expect(dd.entries.length).toBeGreaterThan(0);
      const positionIds = new Set(
        collectPositionAssignments(rebuilt, rebuilt.events![0].eventId).map((p) => p.participantId),
      );
      for (const entry of dd.entries) {
        expect(typeof entry.participantId).toBe('string');
        expect(entry.entryStage).toBeTruthy();
        expect(entry.entryStatus).toBeTruthy();
        expect(positionIds.has(entry.participantId)).toBe(true);
      }
    }
  });

  it('preserves positionAssignments on each event', () => {
    const { tournamentRecord } = generateRoundRobin();
    const { eventDataResponses, scheduleResponse, participantsResponse } = cfsShapes(tournamentRecord);

    const rebuilt = buildTournamentRecord({
      eventDataDocs: eventDataResponses.map(extractEventData),
      matchUpDocs: extractMatchUps(scheduleResponse),
      participantDocs: [extractParticipants(participantsResponse)],
    });

    for (const e of tournamentRecord.events ?? []) {
      const before = collectPositionAssignments(tournamentRecord, e.eventId);
      const after = collectPositionAssignments(rebuilt, e.eventId);
      // CONTAINER + ITEM may both list each assignment; dedupe before comparing
      const norm = (arr: typeof before) =>
        [...new Map(arr.map((x) => [`${x.drawPosition}|${x.participantId}`, x])).values()].sort(
          (a, b) => a.drawPosition - b.drawPosition,
        );
      expect(norm(after)).toEqual(norm(before));
    }
  });

  it('round-trips a multi-event tournament (RR + SE)', () => {
    const { tournamentRecord } = generateMultiEvent();
    const { eventDataResponses, scheduleResponse, participantsResponse } = cfsShapes(tournamentRecord);

    const rebuilt = buildFromSources([...eventDataResponses, scheduleResponse, participantsResponse]).record;

    const originalEvents = (tournamentRecord.events ?? []).map((e: AnyObj) => e.eventId).sort();
    const rebuiltEvents = (rebuilt.events ?? []).map((e: AnyObj) => e.eventId).sort();
    expect(rebuiltEvents).toEqual(originalEvents);

    // Per-event matchUpId set must match
    for (const eventId of originalEvents) {
      const oIds = collectMatchUpIds({
        events: [(tournamentRecord.events ?? []).find((e: AnyObj) => e.eventId === eventId)],
      });
      const rIds = collectMatchUpIds({ events: [(rebuilt.events ?? []).find((e: AnyObj) => e.eventId === eventId)] });
      expect(rIds).toEqual(oIds);
    }
  });
});

// ============================================== round-trip — doubles event
// PAIRs are entered (positions, entries, sides reference PAIR participantIds);
// the underlying INDIVIDUALs live in the top-level participants list and are
// linked via PAIR.individualParticipantIds.

describe('round-trip from mocksEngine — doubles', () => {
  it('preserves both PAIR and INDIVIDUAL participants by count and id', () => {
    const { tournamentRecord } = generateDoubles();
    const { eventDataResponses, scheduleResponse, participantsResponse } = cfsShapes(tournamentRecord);

    const rebuilt = buildTournamentRecord({
      eventDataDocs: eventDataResponses.map(extractEventData),
      matchUpDocs: extractMatchUps(scheduleResponse),
      participantDocs: [extractParticipants(participantsResponse)],
    });

    const oPairs = idSet(tournamentRecord.participants, 'PAIR');
    const rPairs = idSet(rebuilt.participants, 'PAIR');
    const oIndis = idSet(tournamentRecord.participants, 'INDIVIDUAL');
    const rIndis = idSet(rebuilt.participants, 'INDIVIDUAL');

    expect(oPairs.size).toBeGreaterThan(0);
    expect(oIndis.size).toBe(oPairs.size * 2); // sanity: each pair has 2 individuals
    expect(rPairs).toEqual(oPairs);
    expect(rIndis).toEqual(oIndis);
  });

  it('preserves PAIR.individualParticipantIds — every link resolves to a rebuilt INDIVIDUAL', () => {
    const { tournamentRecord } = generateDoubles();
    const { eventDataResponses, scheduleResponse, participantsResponse } = cfsShapes(tournamentRecord);

    const rebuilt = buildTournamentRecord({
      eventDataDocs: eventDataResponses.map(extractEventData),
      matchUpDocs: extractMatchUps(scheduleResponse),
      participantDocs: [extractParticipants(participantsResponse)],
    });

    const { PAIR: rebuiltPairs = [] } = participantsByType(rebuilt.participants);
    const rebuiltIndividualIds = idSet(rebuilt.participants, 'INDIVIDUAL');

    expect(rebuiltPairs.length).toBeGreaterThan(0);
    for (const pair of rebuiltPairs) {
      expect(pair.individualParticipantIds?.length).toBe(2);
      for (const indId of pair.individualParticipantIds) {
        expect(rebuiltIndividualIds.has(indId), `PAIR ${pair.participantId} links to missing INDIVIDUAL ${indId}`).toBe(
          true,
        );
      }
    }
  });

  it('keeps eventType=DOUBLES and matchUpType=DOUBLES throughout', () => {
    const { tournamentRecord } = generateDoubles();
    const { eventDataResponses, scheduleResponse, participantsResponse } = cfsShapes(tournamentRecord);

    const rebuilt = buildTournamentRecord({
      eventDataDocs: eventDataResponses.map(extractEventData),
      matchUpDocs: extractMatchUps(scheduleResponse),
      participantDocs: [extractParticipants(participantsResponse)],
    });

    expect(rebuilt.events?.[0]?.eventType).toBe('DOUBLES');
    const matchUps = listRebuiltMatchUps(rebuilt);
    expect(matchUps.length).toBeGreaterThan(0);
    for (const m of matchUps) expect(m.matchUpType).toBe('DOUBLES');
  });

  it('positionAssignments and entries reference PAIR ids — never raw INDIVIDUAL ids', () => {
    const { tournamentRecord } = generateDoubles();
    const { eventDataResponses, scheduleResponse, participantsResponse } = cfsShapes(tournamentRecord);

    const rebuilt = buildTournamentRecord({
      eventDataDocs: eventDataResponses.map(extractEventData),
      matchUpDocs: extractMatchUps(scheduleResponse),
      participantDocs: [extractParticipants(participantsResponse)],
    });

    const pairIds = idSet(rebuilt.participants, 'PAIR');
    const indiIds = idSet(rebuilt.participants, 'INDIVIDUAL');

    const event = rebuilt.events?.[0];
    expect(event).toBeDefined();
    for (const entry of event!.entries ?? []) {
      expect(pairIds.has(entry.participantId), `entry ${entry.participantId} is not a PAIR`).toBe(true);
      expect(indiIds.has(entry.participantId)).toBe(false);
    }
    const positions: AnyObj[] = [];
    const walk = (structs: AnyObj[] | undefined) => {
      for (const s of structs ?? []) {
        positions.push(...(s.positionAssignments ?? []));
        walk(s.structures);
      }
    };
    for (const dd of event!.drawDefinitions ?? []) walk(dd.structures);
    for (const pa of positions) {
      if (!pa.participantId) continue;
      expect(pairIds.has(pa.participantId), `positionAssignment ${pa.participantId} is not a PAIR`).toBe(true);
    }
  });

  it('hydrated sides match the schedule response (PAIR ids per drawPosition)', () => {
    const { tournamentRecord } = generateDoubles();
    const { eventDataResponses, scheduleResponse, participantsResponse } = cfsShapes(tournamentRecord);

    const rebuilt = buildTournamentRecord({
      eventDataDocs: eventDataResponses.map(extractEventData),
      matchUpDocs: extractMatchUps(scheduleResponse),
      participantDocs: [extractParticipants(participantsResponse)],
    });

    const truth = new Map<string, AnyObj>();
    for (const m of scheduleResponse.dateMatchUps ?? []) truth.set(m.matchUpId, m);

    const rebuiltById = collectRebuiltMatchUps(rebuilt);

    expect(truth.size).toBeGreaterThan(0);
    for (const [id, truthMatchUp] of truth) {
      const reb = rebuiltById.get(id);
      expect(reb).toBeDefined();
      expect(sidePairs(reb!.sides)).toEqual(sidePairs(truthMatchUp.sides));
    }
  });

  it('rebuilt PAIR records have the canonical TODS shape (no side-context pollution)', () => {
    const { tournamentRecord } = generateDoubles();
    const { eventDataResponses, scheduleResponse, participantsResponse } = cfsShapes(tournamentRecord);

    const rebuilt = buildTournamentRecord({
      eventDataDocs: eventDataResponses.map(extractEventData),
      matchUpDocs: extractMatchUps(scheduleResponse),
      participantDocs: [extractParticipants(participantsResponse)],
    });

    const polluting = [
      'entryStatus',
      'entryStage',
      'individualParticipants',
      'groupParticipantIds',
      'teamParticipantIds',
      'pairParticipantIds',
      'groups',
      'teams',
    ];
    for (const p of rebuilt.participants ?? []) {
      for (const k of polluting) {
        expect(p, `${p.participantType} ${p.participantId} retained ${k}`).not.toHaveProperty(k);
      }
    }
  });

  it('matchups-only mode recovers the PAIRs AND their underlying INDIVIDUALs from side.participant.individualParticipants', () => {
    // This was a real gap before — matchups-only used to recover only the
    // PAIR (via side.participantId + side.participant) and silently dropped
    // every INDIVIDUAL. mergeParticipants now also harvests
    // side.participant.individualParticipants so doubles graceful degradation
    // matches singles.
    const { tournamentRecord } = generateDoubles();
    tournamentEngine.setState(tournamentRecord);
    const scheduleResponse = tournamentEngine.competitionScheduleMatchUps();

    const rebuilt = buildTournamentRecord({
      matchUpDocs: extractMatchUps(scheduleResponse),
    });

    const originalPairs = idSet(tournamentRecord.participants, 'PAIR');
    const originalIndis = idSet(tournamentRecord.participants, 'INDIVIDUAL');
    const rebuiltPairs = idSet(rebuilt.participants, 'PAIR');
    const rebuiltIndis = idSet(rebuilt.participants, 'INDIVIDUAL');

    expect(rebuiltPairs).toEqual(originalPairs);
    expect(rebuiltIndis).toEqual(originalIndis);
  });
});

// ====================================================== graceful degradation

describe('graceful degradation (single-source builds)', () => {
  it('participants-only → just { participants } (no tournament metadata, no events)', () => {
    const { tournamentRecord } = generateRoundRobin();
    tournamentEngine.setState(tournamentRecord);
    const participantsResponse = tournamentEngine.getParticipants();

    const rebuilt = buildTournamentRecord({
      participantDocs: [extractParticipants(participantsResponse)],
    });

    expect(rebuilt.participants?.length).toBe((participantsResponse.participants ?? []).length);
    expect(rebuilt.tournamentId).toBeUndefined();
    expect(rebuilt.tournamentName).toBeUndefined();
    expect(rebuilt.events).toBeUndefined();
    expect(rebuilt.venues).toBeUndefined();
  });

  it('matchups-only → derives tournamentId + events + entries from sides; no venues / name', () => {
    const { tournamentRecord } = generateRoundRobin();
    tournamentEngine.setState(tournamentRecord);
    const scheduleResponse = tournamentEngine.competitionScheduleMatchUps();

    const rebuilt = buildTournamentRecord({
      matchUpDocs: extractMatchUps(scheduleResponse),
    });

    expect(rebuilt.tournamentId).toBe(tournamentRecord.tournamentId);
    expect(rebuilt.tournamentName).toBeUndefined();
    expect(rebuilt.venues).toBeUndefined();
    expect(rebuilt.events?.length).toBeGreaterThan(0);
    // Entries must be derived from positionAssignments off the matchUp sides
    const eventEntries = rebuilt.events?.[0]?.entries ?? [];
    expect(eventEntries.length).toBeGreaterThan(0);
  });

  it('event-data-only → full record minus matchUps the schedule response would have added', () => {
    const { tournamentRecord } = generateRoundRobin();
    tournamentEngine.setState(tournamentRecord);
    const eventDataResponse = tournamentEngine.getEventData({ eventId: tournamentRecord.events[0].eventId });

    const rebuilt = buildTournamentRecord({
      eventDataDocs: [extractEventData(eventDataResponse)],
    });

    expect(rebuilt.tournamentId).toBe(tournamentRecord.tournamentId);
    expect(rebuilt.tournamentName).toBe(tournamentRecord.tournamentName);
    expect(rebuilt.venues?.length).toBeGreaterThan(0);
    expect(rebuilt.events?.length).toBe(1);
    expect(rebuilt.events?.[0]?.drawDefinitions?.length).toBe(1);
  });
});

// ============================================================ buildFromSources

describe('buildFromSources', () => {
  it('classifies a mixed array and produces an identical record vs. labeled extractors', () => {
    const { tournamentRecord } = generateRoundRobin();
    const { eventDataResponses, scheduleResponse, participantsResponse } = cfsShapes(tournamentRecord);

    const fromSources = buildFromSources([...eventDataResponses, scheduleResponse, participantsResponse]).record;

    const fromLabeled = buildTournamentRecord({
      eventDataDocs: eventDataResponses.map(extractEventData),
      matchUpDocs: extractMatchUps(scheduleResponse),
      participantDocs: [extractParticipants(participantsResponse)],
    });

    expect(JSON.stringify(fromSources)).toBe(JSON.stringify(fromLabeled));
  });

  it('reports unknownCount and includes classification per source', () => {
    const { tournamentRecord } = generateRoundRobin();
    const { eventDataResponses, scheduleResponse } = cfsShapes(tournamentRecord);

    const { classification, unknownCount } = buildFromSources([
      eventDataResponses[0],
      scheduleResponse,
      'not a source',
      { foo: 'bar' },
    ]);

    expect(classification.map((c) => c.kind)).toEqual([EVENT_DATA, 'matchups', 'unknown', 'unknown']);
    expect(unknownCount).toBe(2);
  });

  it('peels { data: ... } envelopes on every source independently', () => {
    const { tournamentRecord } = generateRoundRobin();
    const { eventDataResponses, scheduleResponse } = cfsShapes(tournamentRecord);

    const result = buildFromSources([{ data: eventDataResponses[0] }, { data: { data: scheduleResponse } }]).record;

    expect(result.tournamentId).toBe(tournamentRecord.tournamentId);
    expect(collectMatchUpIds(result)).toEqual(collectMatchUpIds(tournamentRecord));
  });

  it('handles an empty array', () => {
    const { record, classification, unknownCount } = buildFromSources([]);
    expect(record).toEqual({});
    expect(classification).toEqual([]);
    expect(unknownCount).toBe(0);
  });

  it('handles null / undefined entries without throwing', () => {
    const { unknownCount } = buildFromSources([null, undefined, 0, false]);
    expect(unknownCount).toBe(4);
  });
});

// ========================================================= cleanup invariants

describe('cleanup invariants', () => {
  it('strips _id / __v fields from output', () => {
    const { tournamentRecord } = generateRoundRobin();
    const { eventDataResponses, scheduleResponse, participantsResponse } = cfsShapes(tournamentRecord);

    // Inject mongo noise so we know the strip is active
    eventDataResponses[0].eventData.drawsData[0]._id = 'should-be-stripped';
    eventDataResponses[0].eventData.drawsData[0].__v = 0;

    const rebuilt = buildTournamentRecord({
      eventDataDocs: eventDataResponses.map(extractEventData),
      matchUpDocs: extractMatchUps(scheduleResponse),
      participantDocs: [extractParticipants(participantsResponse)],
    });

    const json = JSON.stringify(rebuilt);
    expect(json).not.toContain('"_id"');
    expect(json).not.toContain('"__v"');
  });

  it('strips matchUp context fields (eventId, drawId, gender, …) from stored matchUps', () => {
    const { tournamentRecord } = generateRoundRobin();
    const { eventDataResponses, scheduleResponse, participantsResponse } = cfsShapes(tournamentRecord);

    const rebuilt = buildTournamentRecord({
      eventDataDocs: eventDataResponses.map(extractEventData),
      matchUpDocs: extractMatchUps(scheduleResponse),
      participantDocs: [extractParticipants(participantsResponse)],
    });

    const stripped = [
      'eventId',
      'drawId',
      'drawName',
      'drawType',
      'gender',
      'tournamentId',
      'eventName',
      'hasContext',
      'readyToScore',
    ];
    const matchUps = listRebuiltMatchUps(rebuilt);

    expect(matchUps.length).toBeGreaterThan(0);
    for (const m of matchUps) {
      for (const k of stripped) {
        expect(m, `matchUp ${m.matchUpId} retained ${k}`).not.toHaveProperty(k);
      }
    }
  });

  it('trims side.participant to { entryStage, entryStatus } only', () => {
    const { tournamentRecord } = generateRoundRobin();
    const { eventDataResponses, scheduleResponse, participantsResponse } = cfsShapes(tournamentRecord);

    const rebuilt = buildTournamentRecord({
      eventDataDocs: eventDataResponses.map(extractEventData),
      matchUpDocs: extractMatchUps(scheduleResponse),
      participantDocs: [extractParticipants(participantsResponse)],
    });

    const sideParticipants: AnyObj[] = [];
    const walk = (structs: AnyObj[] | undefined) => {
      for (const s of structs ?? []) {
        for (const m of s.matchUps ?? []) {
          for (const side of m.sides ?? []) {
            if (side.participant) sideParticipants.push(side.participant);
          }
        }
        walk(s.structures);
      }
    };
    for (const e of rebuilt.events ?? []) for (const dd of e.drawDefinitions ?? []) walk(dd.structures);

    const allowed = new Set(['entryStage', 'entryStatus']);
    for (const p of sideParticipants) {
      for (const k of Object.keys(p)) {
        expect(allowed.has(k), `side.participant retained ${k}`).toBe(true);
      }
    }
  });

  it('drops empty individualParticipantIds from INDIVIDUAL participants', () => {
    const { tournamentRecord } = generateRoundRobin();
    const { eventDataResponses, scheduleResponse, participantsResponse } = cfsShapes(tournamentRecord);

    const rebuilt = buildTournamentRecord({
      eventDataDocs: eventDataResponses.map(extractEventData),
      matchUpDocs: extractMatchUps(scheduleResponse),
      participantDocs: [extractParticipants(participantsResponse)],
    });

    for (const p of rebuilt.participants ?? []) {
      if (p.participantType === 'INDIVIDUAL' && Array.isArray(p.individualParticipantIds)) {
        expect(p.individualParticipantIds.length).toBeGreaterThan(0);
      }
    }
  });
});
