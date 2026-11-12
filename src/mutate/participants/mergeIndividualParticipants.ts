import { modifyEventEntriesNotice, modifyDrawEntriesNotice } from '@Mutate/notifications/entriesNotifications';
import { modifyMatchUpNotice, modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { modifyParticipantsNotice } from '@Mutate/notifications/participantNotifications';
import { matchUpsOf, structuresOf } from '@Helpers/drawTopology/structureMembers';
import { planIndividualMerge } from '@Query/participants/individualMerge/plan';
import { modifyEventNotice } from '@Mutate/notifications/eventNotifications';
import { addNotice } from '@Global/state/globalState';
import { canonicalJson } from '@Tools/canonicalJson';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { INDIVIDUAL_MERGE_BLOCKED, INDIVIDUAL_MERGE_STALE } from '@Constants/errorConditionConstants';
import type { IndividualMergeArgs, IndividualMergeResult } from '@Types/individualParticipantMerge';
import type { DrawDefinition, Event, Structure } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  MERGE_INDIVIDUAL_PARTICIPANTS,
  DELETE_PARTICIPANTS,
  MODIFY_TOURNAMENT_DETAIL,
} from '@Constants/topicConstants';

export function mergeIndividualParticipants(
  args: IndividualMergeArgs & { expectedFingerprint: string },
): IndividualMergeResult {
  const { preview, next } = planIndividualMerge(args);
  if (preview.error) return preview;
  if (!args.expectedFingerprint || args.expectedFingerprint !== preview.fingerprint)
    return { error: INDIVIDUAL_MERGE_STALE };
  if (!preview.canMerge || !next) return { error: INDIVIDUAL_MERGE_BLOCKED, context: preview };
  const { tournamentRecord, sourceParticipantId, targetParticipantId } = args;
  const tournamentId = tournamentRecord.tournamentId;
  const before = new Map(tournamentRecord.participants?.map((p) => [p.participantId, canonicalJson(p)]));
  const oldEvents = new Map(tournamentRecord.events?.map((event) => [event.eventId, canonicalJson(event)]));
  const mergeReceipt = {
    sourceParticipantId,
    targetParticipantId,
    resolutions: makeDeepCopy(args.resolutions ?? {}),
    beforeFingerprint: preview.fingerprint,
    before: mergeSnapshot(tournamentRecord, next, sourceParticipantId, preview.changedPaths ?? []),
  };
  // All validation and reference rewriting succeeded on a private copy; nothing below can refuse.
  Object.assign(tournamentRecord, next);
  modifyParticipantsNotice({
    tournamentId,
    participants: (next.participants ?? []).filter(
      (p) => p.participantId === targetParticipantId || before.get(p.participantId) !== canonicalJson(p),
    ),
  });
  addNotice({ topic: DELETE_PARTICIPANTS, payload: { tournamentId, participantIds: [sourceParticipantId] } });
  for (const event of tournamentRecord.events ?? []) {
    const affectedDrawIds = new Set(preview.affectedDrawIds);
    if (
      oldEvents.get(event.eventId) === canonicalJson(event) &&
      !event.drawDefinitions?.some((d) => affectedDrawIds.has(d.drawId))
    )
      continue;
    modifyEventNotice({ tournamentId, event });
    modifyEventEntriesNotice({ tournamentId, event });
    for (const drawDefinition of event.drawDefinitions ?? []) {
      if (!affectedDrawIds.has(drawDefinition.drawId)) continue;
      modifyDrawNotice({ tournamentId, eventId: event.eventId, drawDefinition });
      modifyDrawEntriesNotice({ tournamentId, eventId: event.eventId, drawDefinition });
      for (const matchUp of drawDefinition.matchUps ?? [])
        modifyMatchUpNotice({ tournamentId, event, drawDefinition, matchUp });
      announceStructures(drawDefinition.structures ?? [], { tournamentId, event, drawDefinition });
    }
  }
  for (const matchUp of tournamentRecord.matchUps ?? []) modifyMatchUpNotice({ tournamentId, matchUp });
  addNotice({
    topic: MERGE_INDIVIDUAL_PARTICIPANTS,
    payload: { tournamentId, sourceParticipantId, targetParticipantId, drawIds: preview.affectedDrawIds ?? [] },
  });
  addNotice({ topic: MODIFY_TOURNAMENT_DETAIL, payload: { tournamentId, extensions: tournamentRecord.extensions } });
  return { ...SUCCESS, sourceParticipantId, targetParticipantId, changedPaths: preview.changedPaths, mergeReceipt };
}

function announceStructures(
  structures: Structure[],
  context: { tournamentId: string; event: Event; drawDefinition: DrawDefinition },
) {
  for (const structure of structures) {
    for (const matchUp of matchUpsOf(structure) ?? []) {
      modifyMatchUpNotice({ ...context, matchUp, structureId: structure.structureId });
    }
    announceStructures(structuresOf(structure) ?? [], context);
  }
}

/** Kept in the server's protected durable command receipt, never in public notices or the tournament ledger. */
function mergeSnapshot(
  before: IndividualMergeArgs['tournamentRecord'],
  after: IndividualMergeArgs['tournamentRecord'],
  sourceId: string,
  paths: string[],
) {
  const nextParticipants = new Map(after.participants?.map((p) => [p.participantId, canonicalJson(p)]));
  const nextEvents = new Map(after.events?.map((event) => [event.eventId, canonicalJson(event)]));
  const rootKeys = new Set(
    paths.map((path) => path.split('/')[1]).filter((key) => key !== 'participants' && key !== 'events'),
  );
  const root = before as unknown as Record<string, unknown>;
  return makeDeepCopy({
    participants: before.participants?.filter(
      (p) => p.participantId === sourceId || nextParticipants.get(p.participantId) !== canonicalJson(p),
    ),
    events: before.events?.filter((event) => nextEvents.get(event.eventId) !== canonicalJson(event)),
    extensions: before.extensions,
    other: Object.fromEntries([...rootKeys].map((key) => [key, root[key]])),
  });
}
