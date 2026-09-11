// Build a TODS tournamentRecord from CFS public-API responses.
//
// Pure-ESM core. No node:fs / process — safe to import from a browser
// bundle (used by `dev.build` in TMX) and from a Node CLI
// (Mentat/tools/cfs-to-tournament-record.mjs is a thin wrapper around it).
//
// Public API
//   classifySource(raw)            -> { kind: 'event-data'|'matchups'|'participants'|'unknown', value }
//   extractEventData(raw)          -> { tournamentInfo?, eventInfo?, drawsData, participants }
//   extractMatchUps(raw)           -> matchUp[]
//   extractParticipants(raw)       -> participant[]
//   buildTournamentRecord({ eventDataDocs, matchUpDocs, participantDocs })
//   buildFromSources(sources)      -> { record, classification, unknownCount }
//
// Wrapper shapes understood
//   { data: { ... } }                                  (GraphQL / REST envelope, peeled recursively)
//   { tournamentPublicEventData: { eventData, participants } }
//   { tournamentMatchUps: { dateMatchUps } }
//   { tournamentParticipants: { participants } }
//   The unwrapped factory shapes are accepted too.

import { inferDrawLinks } from '@Mutate/drawDefinitions/links/inferDrawLinks';

// ------------------------------------------------------------------- types
//
// The BOUNDARY types are deliberately loose. These functions exist to accept data whose shape is
// NOT under this codebase's control — network-tab copies, third-party exports, envelopes that may or
// may not be present. Declaring precise input types would assert a contract the callers cannot honour
// and the code does not rely on; every field is read defensively at the point of use instead.
// Interior structures are typed properly.

export type SourceKind = 'event-data' | 'matchups' | 'participants' | 'unknown';

// The kind literals, named once. sonarjs flags the repetition and it is right to: these are the
// vocabulary the classifier and every consumer agree on, not incidental strings.
const EVENT_DATA: SourceKind = 'event-data';
const MATCHUPS: SourceKind = 'matchups';
const PARTICIPANTS: SourceKind = 'participants';
const UNKNOWN: SourceKind = 'unknown';

export interface ClassifiedSource {
  kind: SourceKind;
  value: any;
}

export interface EventDataDoc {
  tournamentInfo?: any;
  eventInfo?: any;
  drawsData: any[];
  participants: any[];
}

export interface BuildTournamentRecordArgs {
  eventDataDocs?: any[];
  matchUpDocs?: any[];
  participantDocs?: any[];
  /**
   * Optional collector for matchUps that could not be placed. Passed in rather than returned so this
   * function's shape stays exactly what it was — callers assembling a record by hand are not broken
   * by a new wrapper, and one that wants the report opts in by handing over an array.
   */
  unplaced?: UnplacedMatchUp[];
}

/** A matchUp the assembler could not place, and enough identity to find it in the source. */
export interface UnplacedMatchUp {
  matchUpId?: string;
  eventId?: string;
  drawId?: string;
  /** the structureId it named — which no structure in that draw carries */
  structureId?: string;
}

export interface BuildFromSourcesResult {
  /** the assembled tournamentRecord */
  record: Record<string, any>;
  /** what each input was taken to be, by index — so a caller can show its work */
  classification: { index: number; kind: SourceKind }[];
  /** inputs that matched no known shape. Reported rather than dropped silently. */
  unknownCount: number;
  /**
   * Links added by `inferDrawLinks` to make reconstructed draws readable, and with what confidence.
   * Empty when nothing needed repair. Never silent: a caller that would rather refuse than repair
   * can inspect this and decide.
   */
  inferredLinks: { drawId?: string; inferred: any[]; issues: string[] }[];
  /**
   * matchUps that named a structure the draw does not contain. Empty in the ordinary case. Reported
   * rather than dropped: a shorter draw with no complaint is the hardest loss to notice.
   */
  unplacedMatchUps: UnplacedMatchUp[];
}

// ----------------------------------------------------------------- wrappers
// Peel single-key envelopes like { data: { ... } } recursively. Network-tab
// copies sometimes include this envelope and sometimes not.
function peelDataEnvelope(raw) {
  let obj = raw;
  while (isWrappedInData(obj)) {
    obj = obj.data;
  }
  return obj;
}

function isWrappedInData(obj) {
  return (
    obj !== null && typeof obj === 'object' && !Array.isArray(obj) && 'data' in obj && Object.keys(obj).length === 1
  );
}

function unwrapKeys(obj, keys) {
  if (obj === null || typeof obj !== 'object') return obj;
  for (const k of keys) {
    if (k in obj) return obj[k];
  }
  return obj;
}

// --------------------------------------------------------------- extractors
export function extractEventData(raw) {
  const root = unwrapKeys(peelDataEnvelope(raw), ['tournamentPublicEventData']);
  const eventDataNode = root?.eventData ?? root;
  return {
    tournamentInfo: eventDataNode?.tournamentInfo,
    eventInfo: eventDataNode?.eventInfo,
    drawsData: eventDataNode?.drawsData ?? [],
    participants: root?.participants ?? eventDataNode?.participants ?? [],
  };
}

export function extractMatchUps(raw) {
  const root = unwrapKeys(peelDataEnvelope(raw), ['tournamentMatchUps']);
  if (Array.isArray(root)) return root;
  return root?.dateMatchUps ?? root?.matchUps ?? [];
}

export function extractParticipants(raw) {
  const root = unwrapKeys(peelDataEnvelope(raw), ['tournamentParticipants']);
  if (Array.isArray(root)) return root;
  return root?.participants ?? [];
}

// --------------------------------------------------------------- classifier
// Sniff a raw object and return what kind of CFS response it looks like.
// Used by `buildFromSources` so callers can pass a heterogeneous array of
// pasted responses without explicit labeling.
export function classifySource(raw: any): ClassifiedSource {
  const obj = peelDataEnvelope(raw);
  if (obj === null || typeof obj !== 'object') return { kind: UNKNOWN, value: obj };

  const wrapperKind = classifyByWrapperKey(obj);
  if (wrapperKind) return { kind: wrapperKind, value: obj };

  if (Array.isArray(obj)) return { kind: classifyArrayShape(obj), value: obj };

  return { kind: classifyObjectShape(obj), value: obj };
}

function classifyByWrapperKey(obj) {
  if ('tournamentPublicEventData' in obj) return EVENT_DATA;
  if ('tournamentMatchUps' in obj) return MATCHUPS;
  if ('tournamentParticipants' in obj) return PARTICIPANTS;
  return undefined;
}

function classifyArrayShape(arr) {
  const sample = arr.find((x) => x !== null && typeof x === 'object');
  if (sample?.matchUpId) return MATCHUPS;
  if (sample?.participantId && !sample.eventInfo) return PARTICIPANTS;
  return UNKNOWN;
}

function classifyObjectShape(obj) {
  if (obj.dateMatchUps) return MATCHUPS;
  if (obj.eventData) return EVENT_DATA;
  if (obj.tournamentInfo) return EVENT_DATA;
  if (obj.drawsData) return EVENT_DATA;
  if (looksLikeParticipantsBag(obj)) return PARTICIPANTS;
  return UNKNOWN;
}

function looksLikeParticipantsBag(obj) {
  return Boolean(obj.participants) && !obj.eventInfo && !obj.tournamentInfo && !obj.dateMatchUps;
}

// ----------------------------------------------------------------- cleanup
const MONGO_NOISE = new Set(['_id', '__v']);

function stripMongo(obj) {
  if (Array.isArray(obj)) return obj.map(stripMongo);
  if (obj === null || typeof obj !== 'object') return obj;
  const out = {};
  for (const k of Object.keys(obj)) {
    if (!MONGO_NOISE.has(k)) out[k] = stripMongo(obj[k]);
  }
  return out;
}

// MatchUps from CFS carry tons of derived context that does not belong on a
// stored matchUp; strip it so the record round-trips cleanly through factory.
const MATCHUP_CONTEXT_KEYS = new Set([
  'eventDrawsCount',
  'eventId',
  'eventName',
  'tournamentId',
  'drawId',
  'drawName',
  'drawType',
  'endDate',
  'gender',
  'category',
  'createdAt',
  'updatedAt',
  'hasContext',
  'readyToScore',
  'allParticipantsCheckedIn',
  'checkedInParticipantIds',
  'isRoundRobin',
  'roundFactor',
  'roundOfPlay',
  'preFeedRound',
  'feedRound',
  'roundName',
  'abbreviatedRoundName',
  'containerStructureId',
  'structureName',
]);

const SCHEDULE_KEYS = ['scheduledDate', 'scheduledTime', 'venueId', 'courtId', 'endTime'];

function cleanSchedule(sch) {
  const next = {};
  for (const k of SCHEDULE_KEYS) {
    if (sch[k]) next[k] = sch[k];
  }
  return next;
}

function trimSideParticipant(participant) {
  if (participant === null || typeof participant !== 'object') return undefined;
  const trimmed: Record<string, any> = {};
  if (participant.entryStage) trimmed.entryStage = participant.entryStage;
  if (participant.entryStatus) trimmed.entryStatus = participant.entryStatus;
  return Object.keys(trimmed).length > 0 ? trimmed : null;
}

function cleanMatchUpSide(s) {
  const ss = { ...s };
  if (!('participant' in ss)) return ss;
  const trimmed = trimSideParticipant(ss.participant);
  if (trimmed) {
    ss.participant = trimmed;
  } else {
    delete ss.participant;
  }
  return ss;
}

function cleanMatchUp(m) {
  const c = stripMongo(m);
  for (const k of MATCHUP_CONTEXT_KEYS) delete c[k];
  if (Array.isArray(c.sides)) c.sides = c.sides.map(cleanMatchUpSide);
  if (c.schedule !== null && typeof c.schedule === 'object') c.schedule = cleanSchedule(c.schedule);
  return c;
}

// Context fields the factory hydrates onto participants (and onto side
// participants / nested individualParticipants) but that do NOT belong on a
// canonical TODS participant record. Stripped on clean so every source —
// getParticipants, getEventData.participants, side fallbacks — converges on
// the same shape.
const PARTICIPANT_CONTEXT_KEYS = [
  'entryStatus',
  'entryStage',
  'individualParticipants',
  'groupParticipantIds',
  'teamParticipantIds',
  'pairParticipantIds',
  'groups',
  'teams',
];

function cleanParticipant(p) {
  const c = stripMongo(p);
  for (const k of PARTICIPANT_CONTEXT_KEYS) delete c[k];
  if (
    c.participantType === 'INDIVIDUAL' &&
    Array.isArray(c.individualParticipantIds) &&
    c.individualParticipantIds.length === 0
  ) {
    delete c.individualParticipantIds;
  }
  return c;
}

// ------------------------------------------------------ small shared utils
const dateOnly = (s) => (s ? String(s).split('T')[0] : undefined);

function walkStructures(structures, fn) {
  if (!Array.isArray(structures)) return undefined;
  for (const s of structures) {
    fn(s);
    walkStructures(s.structures, fn);
  }
  return undefined;
}

// Map<drawPosition, participantId> → sorted positionAssignment[]
function positionMapToAssignments(positions) {
  return [...positions.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([drawPosition, participantId]) => ({ drawPosition, participantId }));
}

// Walk a list of matchUps' sides and collect drawPosition → participantId.
// Optionally also accumulates into a passed-in "container" map.
function collectPositionsFromMatchUps(matchUps: any[], accumulator?: Map<any, any>) {
  const positions = new Map();
  for (const m of matchUps) {
    for (const s of m.sides ?? []) {
      if (s.drawPosition != null && s.participantId) {
        positions.set(s.drawPosition, s.participantId);
        accumulator?.set(s.drawPosition, s.participantId);
      }
    }
  }
  return positions;
}

// Bucket a flat matchUp list by its structureId (each group of a RR draw).
function bucketMatchUpsByStructure(matchUps) {
  const byStructure = new Map();
  for (const m of matchUps) {
    if (!m.structureId) continue;
    if (!byStructure.has(m.structureId)) {
      byStructure.set(m.structureId, {
        name: m.structureName,
        stage: m.stage,
        stageSequence: m.stageSequence,
        matchUps: [],
      });
    }
    byStructure.get(m.structureId).matchUps.push(m);
  }
  return byStructure;
}

function makeGroupStructureNode({ structureId, bucket, matchUpFormat, structureType }) {
  return {
    structureId,
    structureName: bucket.name,
    structureType: structureType ?? 'ITEM',
    stage: bucket.stage ?? 'MAIN',
    stageSequence: bucket.stageSequence ?? 1,
    matchUpFormat,
    positionAssignments: positionMapToAssignments(collectPositionsFromMatchUps(bucket.matchUps)),
    matchUps: bucket.matchUps.map(cleanMatchUp),
  };
}

// ----------------------------------------------------------- record builders
function buildEventScaffold(info) {
  return {
    eventId: info.eventId,
    eventName: info.eventName,
    eventType: info.eventType ?? info.matchUpType,
    gender: info.gender,
    category: info.category
      ? stripMongo({
          ageCategoryCode: info.category.ageCategoryCode,
          ballType: info.category.ballType,
          subType: info.category.subType,
          type: info.category.type,
        })
      : undefined,
    matchUpFormat: info.matchUpFormat,
    startDate: dateOnly(info.startDate),
    endDate: dateOnly(info.endDate),
    entries: [],
    drawDefinitions: [],
  };
}

function buildTournamentMetadata(eventDataDocs, matchUps) {
  const ti = eventDataDocs.find((d) => d.tournamentInfo)?.tournamentInfo;
  if (ti) {
    return {
      tournamentId: ti.tournamentId,
      tournamentName: ti.tournamentName,
      startDate: dateOnly(ti.startDate),
      endDate: dateOnly(ti.endDate),
      timeZone: ti.localTimeZone,
    };
  }
  const sample = matchUps.find((m) => m.tournamentId);
  return sample ? { tournamentId: sample.tournamentId } : {};
}

function buildVenues(eventDataDocs) {
  const ti = eventDataDocs.find((d) => d.tournamentInfo?.venues?.length)?.tournamentInfo;
  if (!ti) return [];
  return ti.venues.map((v) =>
    stripMongo({
      venueId: v.venueId,
      venueName: v.venueName,
      venueAbbreviation: v.venueAbbreviation,
      venueOtherIds: v.venueOtherIds,
      addresses: v.addresses,
      courts: (v.courts ?? []).map(toCourtSummary),
    }),
  );
}

function toCourtSummary(c) {
  return {
    courtId: c.courtId,
    courtName: c.courtName,
    surfaceCategory: c.surfaceCategory,
    dateAvailability: c.dateAvailability,
    onlineResources: c.onlineResources,
  };
}

function mergeParticipants({ participantDocs, eventDataDocs, matchUps }) {
  const map = new Map();
  const add = (p) => {
    if (!p?.participantId || map.has(p.participantId)) return;
    map.set(p.participantId, cleanParticipant(p));
  };
  for (const doc of participantDocs) for (const p of doc) add(p);
  for (const ed of eventDataDocs) for (const p of ed.participants ?? []) add(p);
  // Sides from schedule matchUps carry full participant data — use as fallback.
  // For doubles, side.participant is a PAIR with its underlying INDIVIDUALs
  // nested under `individualParticipants`; harvest both so matchups-only mode
  // doesn't silently drop the players. cleanParticipant strips the side
  // context fields uniformly so all sources converge on the same shape.
  for (const m of matchUps) {
    for (const s of m.sides ?? []) {
      const participant = s.participant;
      if (!s.participantId || !participant?.participantName) continue;
      add({ ...participant, participantId: s.participantId });
      for (const individual of participant.individualParticipants ?? []) {
        add(individual);
      }
    }
  }
  return [...map.values()];
}

// ------------------------------------------------ draw definition builders
// Walks `container.roundMatchUps` (object keyed by round) into a flat list.
function collectRoundMatchUps(container) {
  const rmu = container?.roundMatchUps;
  if (rmu === null || typeof rmu !== 'object') return [];
  const out: any[] = [];
  for (const round of Object.values(rmu)) {
    if (Array.isArray(round)) out.push(...round);
  }
  return out;
}

// Shared core for both draw-definition builders: turn a "bucketed by
// structureId" map into ITEM group structures and a positionAssignment map
// for the parent container.
function buildGroupStructures(byStructure: Map<any, any>, matchUpFormat?: any, containerId?: any, container?: any) {
  const groupStructures: any[] = [];
  const containerPositions = new Map();
  for (const [structureId, bucket] of byStructure) {
    collectPositionsFromMatchUps(bucket.matchUps, containerPositions);
    const isSelfReferencingContainer = structureId === containerId;
    const structureType = isSelfReferencingContainer ? (container?.structureType ?? 'ITEM') : 'ITEM';
    groupStructures.push(makeGroupStructureNode({ structureId, bucket, matchUpFormat, structureType }));
  }
  return { groupStructures, containerPositions };
}

// Given a draw from `drawsData`, materialize a proper drawDefinition.
// CFS responses include only the CONTAINER structure with `roundMatchUps`
// keyed by round number; the per-group ITEM structures must be derived
// from the matchUps' own `structureId`s.
function buildDrawDefinitionFromDrawData(draw) {
  const container = draw.structures?.[0];
  const matchUpFormat = draw.matchUpFormat;
  const allMatchUps = collectRoundMatchUps(container);
  const byStructure = bucketMatchUpsByStructure(allMatchUps);
  const containerId = container?.structureId;
  const { groupStructures, containerPositions } = buildGroupStructures(
    byStructure,
    matchUpFormat,
    containerId,
    container,
  );
  const containerPositionAssignments = preferredContainerPositions(container, containerPositions);

  if (!container) {
    return makeDrawShell(draw, matchUpFormat, groupStructures);
  }

  const isContainer = (container.structureType ?? 'CONTAINER') === 'CONTAINER';
  const sameAsContainer = byStructure.size === 1 && byStructure.has(containerId);

  if (sameAsContainer || !isContainer) {
    const node = groupStructures[0] ?? makeEmptyGroupNode(container, containerPositionAssignments, matchUpFormat);
    return makeDrawShell(draw, matchUpFormat, [node]);
  }

  return makeDrawShell(draw, matchUpFormat, [
    makeContainerNode({ container, containerId, matchUpFormat, containerPositionAssignments, groupStructures }),
  ]);
}

function preferredContainerPositions(container, fallbackPositions) {
  const sourcePositions = (container?.positionAssignments ?? []).filter((pa) => pa.participantId);
  if (sourcePositions.length > 0) {
    return sourcePositions.map((pa) => ({ drawPosition: pa.drawPosition, participantId: pa.participantId }));
  }
  return positionMapToAssignments(fallbackPositions);
}

function makeEmptyGroupNode(container, positionAssignments, matchUpFormat) {
  return {
    structureId: container.structureId,
    structureName: container.structureName ?? 'Main',
    structureType: container.structureType ?? 'ITEM',
    stage: container.stage ?? 'MAIN',
    stageSequence: container.stageSequence ?? 1,
    matchUpFormat,
    positionAssignments,
    matchUps: [],
  };
}

function makeContainerNode({ container, containerId, matchUpFormat, containerPositionAssignments, groupStructures }) {
  return {
    structureId: containerId,
    structureName: container.structureName ?? 'Main',
    structureType: 'CONTAINER',
    stage: container.stage ?? 'MAIN',
    stageSequence: container.stageSequence ?? 1,
    matchUpFormat,
    positionAssignments: containerPositionAssignments,
    structures: groupStructures,
  };
}

function makeDrawShell(draw, matchUpFormat, structures) {
  return {
    drawId: draw.drawId,
    drawName: draw.drawName,
    drawType: draw.drawType,
    matchUpFormat,
    entries: [],
    structures,
  };
}

// When we only have schedule matchUps (no drawsData), reconstruct the
// drawDefinition skeleton from matchUp context fields.
function buildDrawDefinitionFromMatchUps(drawId, matchUps) {
  const sample = matchUps[0];
  const matchUpFormat = sample.matchUpFormat;
  const byStructure = bucketMatchUpsByStructure(matchUps);
  const { groupStructures, containerPositions } = buildGroupStructures(byStructure, matchUpFormat);

  const containerStructureId = sample.containerStructureId;
  const drawShell = {
    drawId,
    drawName: sample.drawName,
    drawType: sample.drawType,
    matchUpFormat,
    entries: [],
  };

  if (containerStructureId && containerStructureId !== sample.structureId) {
    return {
      ...drawShell,
      structures: [
        {
          structureId: containerStructureId,
          structureName: 'Main',
          structureType: 'CONTAINER',
          stage: 'MAIN',
          stageSequence: 1,
          matchUpFormat,
          positionAssignments: positionMapToAssignments(containerPositions),
          structures: groupStructures,
        },
      ],
    };
  }
  return { ...drawShell, structures: groupStructures };
}

/**
 * Returns the matchUps it could NOT place.
 *
 * `insertMatchUpIntoStructure` reports whether it found a home; this used to compute that result and
 * discard it, so a matchUp whose `structureId` names no structure in the draw vanished with nothing
 * said. That is the hardest kind of loss to notice — no error, no empty structure, and a matchUp
 * count that still looks plausible. The draw is simply smaller than it should be.
 *
 * Deliberately does NOT invent a structure to hold them: that would trade a silent drop for a silent
 * fabrication, which is no better and harder to unpick later. The module's convention is to report
 * what it could not handle (`unknownCount`, `inferredLinks`); this now follows it.
 */
function augmentDrawWithMatchUps(drawDef, matchUps): any[] {
  const seen = collectSeenMatchUpIds(drawDef);
  const unplaced: any[] = [];
  for (const m of matchUps) {
    if (seen.has(m.matchUpId)) continue;
    if (insertMatchUpIntoStructure(drawDef, m)) {
      seen.add(m.matchUpId);
    } else {
      unplaced.push(m);
    }
  }
  return unplaced;
}

function collectSeenMatchUpIds(drawDef) {
  const seen = new Set();
  walkStructures(drawDef.structures, (s) => {
    for (const m of s.matchUps ?? []) seen.add(m.matchUpId);
  });
  return seen;
}

function insertMatchUpIntoStructure(drawDef, m) {
  let placed = false;
  walkStructures(drawDef.structures, (s) => {
    if (placed || s.structureId !== m.structureId) return undefined;
    if (!s.matchUps) s.matchUps = [];
    s.matchUps.push(cleanMatchUp(m));
    placed = true;
    return undefined;
  });
  return placed;
}

// ----------------------------------------------------------- event building
function buildEvents({
  eventDataDocs,
  matchUps,
  unplaced,
}: {
  eventDataDocs: any[];
  matchUps: any[];
  unplaced?: UnplacedMatchUp[];
}) {
  const events = new Map();
  seedEventsFromTournamentInfo(events, eventDataDocs);
  ingestDrawsDataIntoEvents(events, eventDataDocs);
  if (matchUps.length > 0) {
    // NOT `unplaced?.push(...ingest(...))` — optional chaining short-circuits the WHOLE expression,
    // so with no collector the ingest itself never runs and every matchUp silently disappears. The
    // ported contract suite caught it immediately, which is the argument for porting the tests with
    // the code.
    const unplacedHere = ingestMatchUpsIntoEvents(events, matchUps);
    if (unplaced) unplaced.push(...unplacedHere);
  }
  for (const event of events.values()) {
    for (const drawDef of event.drawDefinitions) {
      deriveDrawEntries(drawDef);
    }
    deriveEventEntries(event);
  }
  return [...events.values()];
}

function seedEventsFromTournamentInfo(events, eventDataDocs) {
  for (const ed of eventDataDocs) {
    const eiArr = Array.isArray(ed.tournamentInfo?.eventInfo) ? ed.tournamentInfo.eventInfo : [];
    for (const info of eiArr) {
      if (info?.eventId && !events.has(info.eventId)) {
        events.set(info.eventId, buildEventScaffold(info));
      }
    }
  }
}

function ingestDrawsDataIntoEvents(events, eventDataDocs) {
  for (const ed of eventDataDocs) {
    const info = ed.eventInfo;
    if (!info?.eventId) continue;
    if (!events.has(info.eventId)) events.set(info.eventId, buildEventScaffold(info));
    const event = events.get(info.eventId);
    for (const draw of ed.drawsData ?? []) {
      if (!draw?.drawId) continue;
      if (!event.drawDefinitions.some((d) => d.drawId === draw.drawId)) {
        event.drawDefinitions.push(buildDrawDefinitionFromDrawData(draw));
      }
    }
  }
}

function ingestMatchUpsIntoEvents(events, matchUps): UnplacedMatchUp[] {
  const unplaced: UnplacedMatchUp[] = [];
  const grouped = groupMatchUpsByEventAndDraw(matchUps);
  for (const [eventId, drawMap] of grouped) {
    const event = ensureEvent(events, eventId, drawMap);
    for (const [drawId, mList] of drawMap) {
      const existing = event.drawDefinitions.find((d) => d.drawId === drawId);
      if (existing) {
        for (const m of augmentDrawWithMatchUps(existing, mList)) {
          unplaced.push({ matchUpId: m?.matchUpId, eventId, drawId, structureId: m?.structureId });
        }
      } else {
        event.drawDefinitions.push(buildDrawDefinitionFromMatchUps(drawId, mList));
      }
    }
  }
  return unplaced;
}

function groupMatchUpsByEventAndDraw(matchUps) {
  const byEvent = new Map();
  for (const m of matchUps) {
    if (!m.eventId) continue;
    if (!byEvent.has(m.eventId)) byEvent.set(m.eventId, new Map());
    const drawMap = byEvent.get(m.eventId);
    const drawId = m.drawId ?? '__unknown__';
    if (!drawMap.has(drawId)) drawMap.set(drawId, []);
    drawMap.get(drawId).push(m);
  }
  return byEvent;
}

function ensureEvent(events, eventId, drawMap) {
  if (events.has(eventId)) return events.get(eventId);
  const sample = [...drawMap.values()][0][0];
  const scaffold = buildEventScaffold({
    eventId,
    eventName: sample.eventName,
    eventType: sample.matchUpType,
    gender: sample.gender,
    category: sample.category,
    endDate: sample.endDate,
    matchUpFormat: sample.matchUpFormat,
  });
  events.set(eventId, scaffold);
  return scaffold;
}

const DEFAULT_ENTRY_INFO = { entryStage: 'MAIN', entryStatus: 'DIRECT_ACCEPTANCE' };

// Populate drawDef.entries from this draw's positionAssignments, using side
// participants as the source for entryStage/entryStatus. Required so the
// factory's getParticipants query can resolve per-draw entries without
// crashing on missing arrays.
function deriveDrawEntries(drawDef) {
  const entryInfo = collectEntryInfoFromDrawSides(drawDef);
  const positions = selectPositionsForDraw(drawDef);
  const seen = new Set<any>();
  for (const pa of positions as any[]) {
    if (!pa.participantId || seen.has(pa.participantId)) continue;
    seen.add(pa.participantId);
    const info = entryInfo.get(pa.participantId) ?? DEFAULT_ENTRY_INFO;
    drawDef.entries.push({ participantId: pa.participantId, ...info });
  }
}

function deriveEventEntries(event) {
  const seen = new Set();
  for (const dd of event.drawDefinitions) {
    for (const entry of dd.entries ?? []) {
      if (!entry.participantId || seen.has(entry.participantId)) continue;
      seen.add(entry.participantId);
      event.entries.push({ ...entry });
    }
  }
}

function collectEntryInfoFromDrawSides(drawDef) {
  const entryInfo = new Map();
  walkStructures(drawDef.structures, (s) => {
    for (const m of s.matchUps ?? []) {
      for (const side of m.sides ?? []) {
        recordEntryInfo(entryInfo, side);
      }
    }
  });
  return entryInfo;
}

function recordEntryInfo(entryInfo, side) {
  if (!side.participantId || !side.participant) return;
  if (entryInfo.has(side.participantId)) return;
  entryInfo.set(side.participantId, {
    entryStage: side.participant.entryStage ?? 'MAIN',
    entryStatus: side.participant.entryStatus ?? 'DIRECT_ACCEPTANCE',
  });
}

// Prefer the CONTAINER's positionAssignments when present (they're the
// canonical "entered into this draw" set); otherwise fall through to whatever
// the ITEM structures contributed.
function selectPositionsForDraw(drawDef) {
  const container: any[] = [];
  const groups: any[] = [];
  walkStructures(drawDef.structures, (s) => {
    const target = s.structureType === 'CONTAINER' ? container : groups;
    target.push(...(s.positionAssignments ?? []));
  });
  return container.length > 0 ? container : groups;
}

// --------------------------------------------------------------- assembly
function dropEmpty(obj) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v === undefined || (Array.isArray(v) && v.length === 0)) {
      delete obj[k];
    }
  }
  return obj;
}

/**
 * Give every reconstructed draw the links it needs to be READ.
 *
 * This is the reason the module moved into the factory. A drawDefinition rebuilt from sources is
 * assembled from matchUps bucketed by `structureId`; nothing in that input carries links, because
 * links are a property of the draw and the sources are a projection of its matchUps. A draw with two
 * structures and no links is then REFUSED outright by `getDrawData`
 * (`ERR_MISSING_STRUCTURE_LINKS`) — the record still saves and still lists in a calendar, so the
 * failure is invisible until something asks for the draw.
 *
 * Deliberately applied by `buildFromSources` and NOT by `buildTournamentRecord`: the latter keeps
 * its existing behaviour exactly, so a caller assembling a record by hand is not silently altered.
 * Exported so such a caller can opt in.
 *
 * Never silent — every repair is returned, with the confidence `inferDrawLinks` assigned it.
 */
export function repairDrawLinks(record: Record<string, any>): BuildFromSourcesResult['inferredLinks'] {
  const report: BuildFromSourcesResult['inferredLinks'] = [];
  for (const event of record?.events ?? []) {
    for (const drawDefinition of event?.drawDefinitions ?? []) {
      const { links, inferred, alreadyLinked, issues } = inferDrawLinks({ drawDefinition });
      if (alreadyLinked || !links.length) continue;
      drawDefinition.links = [...(drawDefinition.links ?? []), ...links];
      report.push({ drawId: drawDefinition.drawId, inferred, issues });
    }
  }
  return report;
}

// ----------------------------------------------------------------- public
export function buildTournamentRecord({
  eventDataDocs = [],
  matchUpDocs = [],
  participantDocs = [],
  unplaced,
}: BuildTournamentRecordArgs = {}) {
  const record: Record<string, any> = buildTournamentMetadata(eventDataDocs, matchUpDocs);
  const participants = mergeParticipants({ participantDocs, eventDataDocs, matchUps: matchUpDocs });
  const venues = buildVenues(eventDataDocs);
  const events =
    eventDataDocs.length > 0 || matchUpDocs.length > 0
      ? buildEvents({ eventDataDocs, matchUps: matchUpDocs, unplaced })
      : [];

  if (participants.length > 0) record.participants = participants;
  if (venues.length > 0) record.venues = venues;
  if (events.length > 0) record.events = events;
  return dropEmpty(record);
}

// Auto-classifying convenience: pass an array of pasted-from-network-tab
// objects in any combination, get back a tournamentRecord.
//
//   dev.build([eventDataResponse, scheduleResponse])
//   dev.build([{ data: { tournamentPublicEventData: { ... } } }, ...])
//
// Returns { record, classification, unknownCount } so callers can surface
// "I skipped N sources I couldn't classify".
export function buildFromSources(sources?: any[]): BuildFromSourcesResult {
  const eventDataDocs: any[] = [];
  const matchUpDocs: any[] = [];
  const participantDocs: any[] = [];
  const classification: { index: number; kind: SourceKind }[] = [];
  let unknownCount = 0;

  const length = sources?.length ?? 0;
  for (let i = 0; i < length; i++) {
    const { kind, value } = classifySource((sources as any[])[i]);
    classification.push({ index: i, kind });
    if (kind === EVENT_DATA) eventDataDocs.push(extractEventData(value));
    else if (kind === MATCHUPS) matchUpDocs.push(...extractMatchUps(value));
    else if (kind === PARTICIPANTS) participantDocs.push(extractParticipants(value));
    else unknownCount += 1;
  }

  const unplacedMatchUps: UnplacedMatchUp[] = [];
  const record = buildTournamentRecord({ eventDataDocs, matchUpDocs, participantDocs, unplaced: unplacedMatchUps });
  // Repair before returning: a reconstructed draw that cannot be read is not a usable result, and
  // the caller should not have to know to ask.
  const inferredLinks = repairDrawLinks(record);
  return { record, classification, unknownCount, inferredLinks, unplacedMatchUps };
}
