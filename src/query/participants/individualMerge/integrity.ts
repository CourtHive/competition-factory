import { getTournamentInconsistencies } from '@Query/tournaments/getTournamentInconsistencies';
import { collectParticipantReferences } from './references';
import { canonicalJson } from '@Tools/canonicalJson';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import type { IndividualMergeBlocker } from '@Types/individualParticipantMerge';
import type { Tournament } from '@Types/tournamentTypes';

/** Additional collisions outside draw entry lists, including standalone matchUps and ungenerated flights. */
export function checkIndividualMergeIntegrity(
  record: Tournament,
  targetId: string,
  blockers: IndividualMergeBlocker[],
) {
  const byId = new Map(record.participants?.map((p) => [p.participantId, p]));
  const individuals = (value: unknown) => {
    const ids = collectParticipantReferences(value);
    for (const id of [...ids]) for (const member of byId.get(id)?.individualParticipantIds ?? []) ids.add(member);
    return ids;
  };
  const visit = (value: unknown, path: string) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}/${index}`));
      return;
    }
    if (!value || typeof value !== 'object') return;
    const object = value as Record<string, unknown>;
    if (Array.isArray(object.sides)) {
      const count = object.sides.filter((side) => individuals(side).has(targetId)).length;
      if (count > 1) blockers.push({ code: 'OPPOSING_SIDES', path });
    }
    if (Array.isArray(object.lineUp)) {
      const count = object.lineUp.filter((item) => individuals(item).has(targetId)).length;
      if (count > 1) blockers.push({ code: 'DUPLICATE_LINEUP', path });
    }
    if (Array.isArray(object.flights)) {
      const count = object.flights.filter((flight) => individuals(flight).has(targetId)).length;
      if (count > 1) blockers.push({ code: 'FLIGHT_CONFLICT', path });
    }
    for (const [key, item] of Object.entries(object)) {
      if (key !== 'extensions' && key !== 'person') visit(item, `${path}/${key}`);
    }
  };
  visit(record, '');
  for (const event of record.events ?? []) {
    const entrantsByStage = new Map<string, Set<string>>();
    for (const entry of event.entries ?? []) {
      if (!individuals(entry).has(targetId)) continue;
      const stage = entry.entryStage ?? '';
      const entrants = entrantsByStage.get(stage) ?? new Set<string>();
      entrants.add(entry.participantId);
      entrantsByStage.set(stage, entrants);
    }
    if ([...entrantsByStage.values()].some((entrants) => entrants.size > 1))
      blockers.push({
        code: 'ENTRY_GROUPING_CONFLICT',
        path: `/events/${event.eventId}/entries`,
        eventId: event.eventId,
      });
  }
  for (const participant of record.participants ?? []) {
    const members = new Set(participant.individualParticipantIds);
    if (participant.contactParticipantIds?.some((id) => !members.has(id))) {
      blockers.push({
        code: 'INVALID_CONTACT_MEMBER',
        path: `/participants/${participant.participantId}/contactParticipantIds`,
      });
    }
  }
}

/** Compare complete findings, not just counts: a new defect cannot replace an old one unnoticed. */
export function checkMergeConsistency(
  before: Tournament,
  after: Tournament,
  sourceId: string,
  targetId: string,
  blockers: IndividualMergeBlocker[],
) {
  const baseline = getTournamentInconsistencies({ tournamentRecord: makeDeepCopy(before) }).inconsistencies ?? [];
  const candidate = getTournamentInconsistencies({ tournamentRecord: makeDeepCopy(after) }).inconsistencies ?? [];
  const comparable = (finding: Record<string, unknown>) => {
    const { message: _message, fingerprint: _fingerprint, ...detail } = finding;
    // Findings are diagnostic data, not the tournament record. Normalize exact ID values for identity-only differences.
    return canonicalJson(detail).replaceAll(JSON.stringify(sourceId), JSON.stringify(targetId));
  };
  const held = new Set(baseline.map(comparable));
  for (const finding of candidate) {
    if (finding.severity === 'error' && !held.has(comparable(finding))) {
      blockers.push({
        code: 'INTEGRITY_CONFLICT',
        path: finding.structureId ?? finding.drawId ?? finding.eventId ?? '/',
        drawId: finding.drawId,
        eventId: finding.eventId,
      });
    }
  }
}
