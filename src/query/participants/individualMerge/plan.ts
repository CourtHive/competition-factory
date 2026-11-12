import { readIndividualMergeLedger, retiredParticipantCheck, resolveMergedParticipantId } from './aliases';
import { generatePairParticipantName } from '@Functions/participants/generatePairParticipantName';
import { collectParticipantReferences, rewriteIndividualReferences } from './references';
import { checkMergeConsistency, checkIndividualMergeIntegrity } from './integrity';
import { isFactoryUuid } from '@Query/readModel/personRule';
import { canonicalJson } from '@Tools/canonicalJson';
import { mergeIndividualProfile } from './profile';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { INDIVIDUAL_PARTICIPANT_MERGES } from '@Constants/extensionConstants';
import type { Participant, Tournament } from '@Types/tournamentTypes';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import {
  INVALID_VALUES,
  INVALID_PARTICIPANT_TYPE,
  PARTICIPANT_NOT_FOUND,
  MISSING_TOURNAMENT_RECORD,
} from '@Constants/errorConditionConstants';
import type {
  IndividualMergeArgs,
  IndividualMergePreview,
  IndividualMergeBlocker,
} from '@Types/individualParticipantMerge';

export function planIndividualMerge(args: IndividualMergeArgs): { preview: IndividualMergePreview; next?: Tournament } {
  const { tournamentRecord, sourceParticipantId: sourceId, targetParticipantId: targetId, resolutions = {} } = args;
  if (!tournamentRecord) return { preview: { error: MISSING_TOURNAMENT_RECORD } };
  if (!sourceId || !targetId || sourceId === targetId || !validResolutions(resolutions)) {
    return { preview: { error: INVALID_VALUES } };
  }
  const retired = retiredParticipantCheck(tournamentRecord, [sourceId, targetId]);
  if (retired) return { preview: retired };
  const participants = tournamentRecord.participants ?? [];
  const source = participants.find((p) => p.participantId === sourceId);
  const target = participants.find((p) => p.participantId === targetId);
  if (!source || !target) return { preview: { error: PARTICIPANT_NOT_FOUND } };
  if (source.participantType !== INDIVIDUAL || target.participantType !== INDIVIDUAL) {
    return { preview: { error: INVALID_PARTICIPANT_TYPE } };
  }
  const profile = mergeIndividualProfile(makeDeepCopy(source), makeDeepCopy(target), resolutions);
  const trustedIds = [
    ...new Set(
      [source.personId, source.person?.personId, target.personId, target.person?.personId].filter(
        (id): id is string => !!id && !isFactoryUuid(id),
      ),
    ),
  ];
  if (trustedIds.length > 1) profile.blockers.push({ code: 'PERSON_ID_CONFLICT', path: '/person/personId' });
  alignPersonId(profile.participant, trustedIds[0]);
  const blockers = profile.blockers;
  for (const participant of [source, target]) {
    if (participant.personId && participant.person?.personId && participant.personId !== participant.person.personId)
      blockers.push({ code: 'PERSON_ID_CONFLICT', path: `/participants/${participant.participantId}/personId` });
  }
  if (source.participantRole !== target.participantRole)
    blockers.push({ code: 'ROLE_CONFLICT', path: '/participantRole' });
  const affectedDrawIds = checkDraws(tournamentRecord, sourceId, targetId, blockers);
  const context = {
    source: sourceId,
    target: targetId,
    blockers,
    changedPaths: [] as string[],
    retiredPersonIds: [source.personId, source.person?.personId].filter(
      (id): id is string => !!id && id !== profile.participant.person?.personId,
    ),
  };
  const copy = makeDeepCopy(tournamentRecord);
  // Source profile identities are data, not references. Transfer profile fields through the profile planner.
  copy.participants = participants
    .filter((p) => p.participantId !== sourceId)
    .map((p) => makeDeepCopy(p.participantId === targetId ? profile.participant : p));
  const next = rewriteIndividualReferences(copy, '', context) as Tournament;
  checkIndividualMergeIntegrity(next, targetId, blockers);
  checkPairs(next.participants ?? [], sourceId, targetId, participants, blockers);
  const ledger = makeDeepCopy(readIndividualMergeLedger(tournamentRecord));
  for (const alias of Object.keys(ledger.aliases)) {
    if (resolveMergedParticipantId({ tournamentRecord, participantId: alias }) === sourceId)
      ledger.aliases[alias] = targetId;
  }
  ledger.aliases = { ...ledger.aliases, [sourceId]: targetId };
  next.extensions = (next.extensions ?? []).filter(({ name }) => name !== INDIVIDUAL_PARTICIPANT_MERGES);
  next.extensions.push({ name: INDIVIDUAL_PARTICIPANT_MERGES, value: ledger });
  const unresolved = profile.conflicts.filter(({ path }) => !Object.hasOwn(resolutions, path));
  if (!blockers.length && !unresolved.length)
    checkMergeConsistency(tournamentRecord, next, sourceId, targetId, blockers);
  return {
    next,
    preview: {
      success: true,
      canMerge: !blockers.length && !unresolved.length,
      fingerprint: mergeFingerprint(tournamentRecord),
      participant: next.participants?.find((p) => p.participantId === targetId),
      blockers,
      conflicts: profile.conflicts,
      changedPaths: context.changedPaths,
      affectedDrawIds,
    },
  };
}

function validResolutions(value: unknown): value is IndividualMergeArgs['resolutions'] {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every((choice) => choice === 'source' || choice === 'target')
  );
}
function alignPersonId(participant: Participant, trustedId?: string) {
  const personId = trustedId ?? participant.person?.personId ?? participant.personId;
  if (!personId) return;
  if (participant.person) participant.person.personId = personId;
  if (participant.personId !== undefined) participant.personId = personId;
}
function checkDraws(record: Tournament, source: string, target: string, blockers: IndividualMergeBlocker[]) {
  const affectedDrawIds: string[] = [];
  const byId = new Map(record.participants?.map((p) => [p.participantId, p]));
  for (const event of record.events ?? []) {
    for (const draw of event.drawDefinitions ?? []) {
      const ids = collectParticipantReferences(draw);
      for (const id of [...ids]) {
        for (const individualId of byId.get(id)?.individualParticipantIds ?? []) ids.add(individualId);
      }
      if (ids.has(source) || ids.has(target)) affectedDrawIds.push(draw.drawId);
      if (ids.has(source) && ids.has(target))
        blockers.push({
          code: 'SHARED_DRAW',
          eventId: event.eventId,
          drawId: draw.drawId,
          path: `/events/${event.eventId}/drawDefinitions/${draw.drawId}`,
        });
    }
  }
  return affectedDrawIds;
}

function checkPairs(
  next: Participant[],
  source: string,
  target: string,
  before: Participant[],
  blockers: IndividualMergeBlocker[],
) {
  const original = new Map(before.map((p) => [p.participantId, p]));
  const pairs = new Map<string, string>();
  for (const participant of next) {
    if (participant.participantType !== PAIR) continue;
    const members = participant.individualParticipantIds ?? [];
    const changed = original.get(participant.participantId)?.individualParticipantIds?.includes(source);
    if (changed && (members.length !== 2 || new Set(members).size !== 2)) {
      blockers.push({ code: 'PAIR_COLLAPSE', path: `/participants/${participant.participantId}` });
    }
    const key = canonicalJson(members.toSorted((a, b) => a.localeCompare(b, 'en')));
    const prior = pairs.get(key);
    if (prior && (changed || original.get(prior)?.individualParticipantIds?.includes(source))) {
      blockers.push({ code: 'DUPLICATE_PAIR', path: `/participants/${participant.participantId}` });
    }
    pairs.set(key, participant.participantId);
    if (changed && members.includes(target))
      participant.participantName = generatePairParticipantName({
        individualParticipants: members
          .map((id) => next.find((p) => p.participantId === id))
          .filter((p): p is Participant => !!p),
      });
  }
}

/** Staleness detector, never an authorization token. Ignore volatile entity stamps shared clients may apply at different times. */
export function mergeFingerprint(record: Tournament): string {
  const json = canonicalJson(withoutStamps(record));
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < json.length; index++)
    hash = BigInt.asUintN(64, (hash ^ BigInt(json.charCodeAt(index))) * 0x100000001b3n);
  return `v1-${hash.toString(16)}`;
}
function withoutStamps(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(withoutStamps);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'updatedAt')
        .map(([key, item]) => [key, withoutStamps(item)]),
    );
  return value;
}
