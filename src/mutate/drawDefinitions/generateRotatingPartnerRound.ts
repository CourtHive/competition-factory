import { generateAdHocMatchUps } from '@Generators/drawDefinitions/drawTypes/adHoc/generateAdHocMatchUps';
import { stringifyCombinedPointFormat } from '@Helpers/matchUpFormatCode/combinedPointFormat';
import { addMatchUpsNotice, modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { checkMutationLock } from '@Assemblies/engines/parts/checkMutationLock';
import { addAdHocMatchUps } from '@Mutate/structures/addAdHocMatchUps';
import { addParticipant } from '@Mutate/participants/addParticipant';
import { matchUpsOf } from '@Acquire/structureMembers';
import { addNotice } from '@Global/state/globalState';
import {
  appliedRotatingPartnerRoundsAreIntact,
  getRotatingPartnerRoundPreview,
} from '@Query/drawDefinition/getRotatingPartnerRoundPreview';

// constants and types
import type { RotatingPartnerRound } from '@Generators/drawDefinitions/drawTypes/adHoc/rotatingPartners/rotatingPartnerTypes';
import type { RotatingPartnerRoundArgs } from '@Query/drawDefinition/getRotatingPartnerRoundPreview';
import type { RotatingPartnerScoreContract } from '@Types/rotatingPartnerScoring';
import type { RotatingPartnerRoundRecord } from '@Types/rotatingPartnerRound';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { ADD_PARTICIPANTS } from '@Constants/topicConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import { PAIR } from '@Constants/participantConstants';
import type { MatchUp } from '@Types/tournamentTypes';
import type { ResultType } from '@Types/factoryTypes';
import { canonicalJson } from '@Tools/canonicalJson';
import { SUCCESS } from '@Constants/resultConstants';

export function generateRotatingPartnerRound(
  params: RotatingPartnerRoundArgs & {
    requestId: string;
    expectedPairings: RotatingPartnerRound;
    expectedScoringContract: RotatingPartnerScoreContract;
    lockToken?: string;
  },
): ResultType & { roundRecord?: RotatingPartnerRoundRecord; matchUps?: MatchUp[]; existingRound?: boolean } {
  const { tournamentRecord, drawDefinition, event, requestId, expectedPairings, expectedScoringContract, roundNumber } =
    params;
  if (
    typeof requestId !== 'string' ||
    !requestId.trim() ||
    !Array.isArray(expectedPairings) ||
    !expectedScoringContract
  )
    return { error: INVALID_VALUES, info: 'requestId, expectedPairings and expectedScoringContract required' };
  if (!drawDefinition || !tournamentRecord || !event) return { error: INVALID_VALUES };
  const prior = drawDefinition.competitionRounds?.find((round) => round.requestId === requestId);
  if (prior) {
    if (
      prior.roundNumber !== roundNumber ||
      canonicalJson(prior.pairings) !== canonicalJson(expectedPairings) ||
      canonicalJson(prior.scoringContract) !== canonicalJson(expectedScoringContract) ||
      (params.structureId && params.structureId !== prior.structureId)
    )
      return { error: INVALID_VALUES, info: 'requestId already used for a different round request' };
    const matches = (drawDefinition.structures ?? [])
      .flatMap((structure) => matchUpsOf(structure) ?? [])
      .filter((matchUp) => prior.matchUpIds.includes(matchUp.matchUpId));
    if (matches.length !== prior.matchUpIds.length || !appliedRotatingPartnerRoundsAreIntact(params))
      return { error: INVALID_VALUES, info: 'previously applied round has been removed or changed' };
    return { ...SUCCESS, existingRound: true, roundRecord: copyRoundData(prior), matchUps: copyRoundData(matches) };
  }
  const preview = getRotatingPartnerRoundPreview(params);
  if (preview.error) return preview;
  if (
    canonicalJson(preview.round) !== canonicalJson(expectedPairings) ||
    canonicalJson(preview.scoringContract) !== canonicalJson(expectedScoringContract)
  )
    return { error: INVALID_VALUES, info: 'stale rotating-partner round preview' };
  const staged = copyRoundData(tournamentRecord);
  const stagedEvent = staged.events?.find((candidate) => candidate.eventId === event.eventId);
  const stagedDraw = stagedEvent?.drawDefinitions?.find((candidate) => candidate.drawId === drawDefinition.drawId);
  if (!stagedEvent || !stagedDraw)
    return { error: INVALID_VALUES, info: 'draw must belong to the supplied tournament and event' };
  const originalCount = staged.participants?.length ?? 0;
  const pairings: { participantIds: [string, string] }[] = [];
  let pairIndex = 0;
  for (const match of preview.round!) {
    const sides: string[] = [];
    for (const members of match) {
      const result = addParticipant({
        tournamentRecord: staged,
        participant: {
          participantId: `${drawDefinition.drawId}-rp-${requestId}-${roundNumber}-p${pairIndex++}`,
          participantType: PAIR,
          participantRole: COMPETITOR,
          individualParticipantIds: [...members],
        },
        returnParticipant: true,
        disableNotice: true,
      });
      if (result.error) return result;
      if (!result.participant?.participantId) return { error: INVALID_VALUES };
      sides.push(result.participant.participantId);
    }
    pairings.push({ participantIds: [sides[0], sides[1]] });
  }
  const generated = generateAdHocMatchUps({
    tournamentRecord: staged,
    drawDefinition: stagedDraw,
    event: stagedEvent,
    structureId: preview.structureId,
    roundNumber,
    participantIdPairings: pairings,
    matchUpIds: pairings.map((_, index) => `${drawDefinition.drawId}-rp-${requestId}-${roundNumber}-m${index}`),
  });
  if (generated.error) return generated;
  const matchUps = generated.matchUps!;
  const segment = stringifyCombinedPointFormat(preview.scoringContract!);
  if (!segment) return { error: INVALID_VALUES };
  matchUps.forEach((matchUp) => {
    matchUp.matchUpFormat = `SET1-S:${segment}`;
  });
  const inserted = addAdHocMatchUps({
    tournamentRecord: staged,
    drawDefinition: stagedDraw,
    event: stagedEvent,
    structureId: preview.structureId,
    matchUps,
    suppressNotifications: true,
  });
  if (inserted.error) return inserted;
  const profile = drawDefinition.competitionProfile!;
  if (profile.format === 'LADDER') return { error: INVALID_VALUES };
  const roundRecord: RotatingPartnerRoundRecord = {
    version: 1,
    requestId,
    roundNumber,
    structureId: preview.structureId!,
    format: profile.format,
    algorithmVersion: 1,
    baseSeed: profile.pairing.seed,
    seedUsed: preview.seedUsed!,
    pairings: preview.round!,
    matchUpIds: matchUps.map((matchUp) => matchUp.matchUpId),
    tallyContract: preview.tallyContract!,
    scoringContract: preview.scoringContract!,
    ...(preview.standingsSnapshot
      ? {
          standingsSnapshot: preview.standingsSnapshot,
          standingsThroughRoundNumber: preview.standingsThroughRoundNumber,
        }
      : {}),
  };
  // All fallible validation ran against isolated state. Commit once, then publish notices.
  const participants = staged.participants!.slice(originalCount);
  if (participants.length) {
    const locked = checkMutationLock(
      'addParticipant',
      { ...params, drawDefinition: stagedDraw, event: stagedEvent },
      staged,
    );
    if (locked) return locked;
  }
  tournamentRecord.participants ??= [];
  tournamentRecord.participants.push(...participants);
  const target = drawDefinition.structures!.find((structure) => structure.structureId === preview.structureId)!;
  matchUpsOf(target)!.push(...matchUps);
  drawDefinition.competitionRoster ??= [...preview.participantIds!];
  drawDefinition.competitionRounds ??= [];
  drawDefinition.competitionRounds.push(roundRecord);
  if (participants.length)
    addNotice({ topic: ADD_PARTICIPANTS, payload: { tournamentId: tournamentRecord.tournamentId, participants } });
  addMatchUpsNotice({ tournamentId: tournamentRecord.tournamentId, eventId: event.eventId, drawDefinition, matchUps });
  modifyDrawNotice({ drawDefinition, structureIds: [preview.structureId!] });
  return { ...SUCCESS, roundRecord: copyRoundData(roundRecord), matchUps: copyRoundData(matchUps) };
}

/** Atomic staging must remain isolated even when engine query copying is disabled. */
function copyRoundData<T>(value: T): T {
  return structuredClone(value);
}
