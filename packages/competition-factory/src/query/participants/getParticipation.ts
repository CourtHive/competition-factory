import { INDIVIDUAL, TEAM } from '@Constants/participantConstants';

// types
import { Tournament } from '@Types/tournamentTypes';

export type ParticipationSubjectType = 'TEAM' | 'PERSON';

export type ParticipationEntry = {
  /** the grain the subject is identified at */
  subjectType: ParticipationSubjectType;
  /** the id an organisation ISSUED for this subject — stable across tournamentRecords */
  subjectId: string;
  /** the organisation that issued `subjectId`; two bodies may both number the same competitor */
  organisationId?: string;
  /** this record's own id for the competitor — tournament-local, never a subject key */
  participantId: string;
  tournamentId: string;
  tournamentName?: string;
  startDate?: string;
  endDate?: string;
  eventCount: number;
  providerId?: string;
};

/**
 * Derive what a tournamentRecord asserts about WHO TOOK PART — the rows a participation index is
 * built from, without loading anything but this record.
 *
 * The counterpart to {@link getTournamentCalendarEntry}, and the reason both live here. A calendar
 * entry answers *what does this provider own*; participation answers *what did this competitor take
 * part in*. They are different relations and a calendar cannot express the second: a record lives in
 * exactly ONE provider's calendar, while a team fixture belongs to the seasons of BOTH sides, so
 * ownership can only ever name one of them.
 *
 * That is also why participation reads both sides of every fixture and needs no notion of a host —
 * useful, because a source that states who hosted is the exception rather than the rule.
 *
 * ## Subject identity comes from the issued id, never from `participantId`
 *
 * A `participantId` is tournament-local: the same competitor carries a different one in every record
 * it appears in. Keyed on that, a competitor's history would be exactly one entry long per record —
 * plausible-looking, and wrong in a way nothing errors on. So the subject is read from
 * `participantOtherIds` (TEAM) and `person.personOtherIds` (PERSON), which carry the issuing
 * organisation's own id and are stable by construction.
 *
 * **A competitor stating no issued id contributes no entry.** That is a recorded gap — this record
 * does not say who the competitor is in any durable sense — and manufacturing one from the local id
 * would produce precisely the wrong answer described above. Callers wanting to detect the gap can
 * compare the entry count against the competitors they expected.
 *
 * A competitor issued ids by two organisations yields one entry per organisation, which is correct:
 * each is a distinct claim about identity, and a consumer indexes whichever body it speaks for.
 *
 * Pure: reads only the record. Storage keys, timestamps and server-specific projections are the
 * caller's concern, not the factory's.
 */
export function getParticipation({ tournamentRecord }: { tournamentRecord: Tournament }): ParticipationEntry[] {
  const tournamentId = tournamentRecord?.tournamentId;
  if (!tournamentId) return [];

  const shared = {
    tournamentId,
    tournamentName: tournamentRecord.tournamentName,
    startDate: tournamentRecord.startDate,
    endDate: tournamentRecord.endDate,
    eventCount: tournamentRecord.events?.length ?? 0,
    providerId: tournamentRecord.parentOrganisation?.organisationId,
  };

  const entries: ParticipationEntry[] = [];
  // One entry per (subjectType, subjectId, participantId). A competitor entered twice under one
  // issued id is one participation, and a consumer's natural key would reject the duplicate anyway.
  const seen = new Set<string>();

  const add = (subjectType: ParticipationSubjectType, issued: any, participantId?: string) => {
    const subjectId = subjectType === TEAM ? issued?.participantId : issued?.personId;
    if (!subjectId || !participantId) return;
    const key = `${subjectType}|${subjectId}|${participantId}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({
      subjectType,
      subjectId,
      organisationId: issued?.organisationId,
      participantId,
      ...shared,
    });
  };

  for (const participant of tournamentRecord.participants ?? []) {
    if (participant?.participantType === TEAM) {
      for (const issued of participant.participantOtherIds ?? []) add('TEAM', issued, participant.participantId);
    } else if (participant?.participantType === INDIVIDUAL) {
      for (const issued of participant.person?.personOtherIds ?? []) add('PERSON', issued, participant.participantId);
    }
  }

  return entries;
}
