import { generateAmericanoPairings } from '@Generators/drawDefinitions/drawTypes/adHoc/rotatingPartners/generateAmericanoPairings';
import { generateMexicanoPairings } from '@Generators/drawDefinitions/drawTypes/adHoc/rotatingPartners/generateMexicanoPairings';
import { getAvailableMatchUpsCount } from '@Generators/drawDefinitions/drawTypes/adHoc/getAvailableMatchUpsCount';
import { isRotatingPartnerDraw, validateRotatingPartnerEntrants } from '@Validators/rotatingPartnerDraw';
import { stringifyCombinedPointFormat } from '@Helpers/matchUpFormatCode/combinedPointFormat';
import { getRotatingPartnerScoringContract } from './getRotatingPartnerScoringContract';
import { checkValidEntries } from '@Validators/checkValidEntries';
import { matchUpsOf } from '@Acquire/structureMembers';
import { PAIR } from '@Constants/participantConstants';
import { canonicalJson } from '@Tools/canonicalJson';

// constants and types
import type { RotatingPartnerRound } from '@Generators/drawDefinitions/drawTypes/adHoc/rotatingPartners/rotatingPartnerTypes';
import type { RotatingPartnerScoreContract } from '@Types/rotatingPartnerScoring';
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { STRUCTURE_SELECTED_STATUSES } from '@Constants/entryStatusConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

export type RotatingPartnerRoundArgs = {
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  event: Event;
  roundNumber: number;
  structureId?: string;
};

export function getRotatingPartnerRoundPreview(params: RotatingPartnerRoundArgs): ResultType & {
  round?: RotatingPartnerRound;
  standingsSnapshot?: { participantId: string; pointsScored: number }[];
  scoringContract?: RotatingPartnerScoreContract;
  participantIds?: string[];
  seedUsed?: number;
  structureId?: string;
} {
  const { drawDefinition, tournamentRecord, event, roundNumber } = params;
  const profile = drawDefinition?.competitionProfile;
  if (!isRotatingPartnerDraw(drawDefinition, event) || !profile || profile.format === 'LADDER')
    return { error: INVALID_VALUES, info: 'configured rotating-partner draw required' };
  if (!Number.isSafeInteger(roundNumber) || roundNumber < 1)
    return { error: INVALID_VALUES, info: 'positive integer roundNumber required' };
  if (drawDefinition.tieFormat || event.tieFormat || event.tieFormats?.length)
    return { error: INVALID_VALUES, info: 'rotating-partner rounds do not support tieFormat' };
  const structureId =
    params.structureId ??
    (drawDefinition.structures?.length === 1 ? drawDefinition.structures[0].structureId : undefined);
  const capacity = getAvailableMatchUpsCount({ drawDefinition, structureId });
  if (capacity.error) return capacity;
  if (!appliedRotatingPartnerRoundsAreIntact({ drawDefinition, tournamentRecord }))
    return { error: INVALID_VALUES, info: 'applied round membership or provenance has changed' };
  const existing = (drawDefinition.structures ?? []).flatMap((structure) => matchUpsOf(structure) ?? []);
  const lastRound = existing.reduce((last, matchUp) => Math.max(last, matchUp.roundNumber ?? 0), 0);
  if (roundNumber !== lastRound + 1)
    return { error: INVALID_VALUES, info: 'only the next logical round may be generated' };
  const entries = (drawDefinition.entries ?? []).filter(
    (entry) => entry.entryStatus !== undefined && STRUCTURE_SELECTED_STATUSES.includes(entry.entryStatus),
  );
  const validation = checkValidEntries({ tournamentRecord, drawDefinition, event, consideredEntries: entries });
  if (validation.error) return validation;
  const participantIds = entries.map((entry) => entry.participantId).sort((a, b) => a.localeCompare(b));
  if (participantIds.length > 128) return { error: INVALID_VALUES, info: 'round exceeds the 32-matchUp cap' };
  const entrants = validateRotatingPartnerEntrants({ tournamentRecord, participantIds });
  if (entrants.error) return entrants;
  const priorRoster = drawDefinition.competitionRoster;
  if (priorRoster && canonicalJson(priorRoster) !== canonicalJson(participantIds))
    return { error: INVALID_VALUES, info: 'roster differs from the applied competition roster' };
  if (
    existing.length &&
    existing.some(
      (matchUp) => !drawDefinition.competitionRounds?.some((round) => round.matchUpIds.includes(matchUp.matchUpId)),
    )
  )
    return { error: INVALID_VALUES, info: 'existing matches have no rotating-partner provenance' };
  const scoring = getRotatingPartnerScoringContract({ drawDefinition });
  if (scoring.error) return scoring;
  if (profile.format === 'MEXICANO' && roundNumber > 1)
    return {
      error: INVALID_VALUES,
      info: 'later Mexicano rounds require authoritative individual standings (not yet available)',
    };
  const generated =
    profile.format === 'AMERICANO'
      ? generateAmericanoPairings({ participantIds, seed: profile.pairing.seed })
      : generateMexicanoPairings({
          standings: participantIds.map((participantId) => ({ participantId, pointsScored: 0 })),
          seed: profile.pairing.seed,
          roundNumber,
        });
  if (generated.error) return generated;
  let round: RotatingPartnerRound | undefined;
  if ('rounds' in generated) round = generated.rounds?.[roundNumber - 1];
  else if ('round' in generated) round = generated.round;
  if (!round || (profile.format === 'MEXICANO' && roundNumber > profile.completion.rounds))
    return { error: INVALID_VALUES, info: 'competition round limit reached' };
  if (round.length > 32) return { error: INVALID_VALUES, info: 'round exceeds the 32-matchUp cap' };
  return {
    ...SUCCESS,
    round,
    structureId,
    participantIds,
    ...(profile.format === 'MEXICANO'
      ? { standingsSnapshot: participantIds.map((participantId) => ({ participantId, pointsScored: 0 })) }
      : {}),
    scoringContract: scoring.contract,
    seedUsed: generated.seedUsed,
  };
}

/** Membership snapshots prevent deleted or edited rounds from silently changing the rotation. */
export function appliedRotatingPartnerRoundsAreIntact({
  drawDefinition,
  tournamentRecord,
}: Pick<RotatingPartnerRoundArgs, 'drawDefinition' | 'tournamentRecord'>): boolean {
  const rounds = drawDefinition.competitionRounds ?? [];
  if (rounds.length && !drawDefinition.competitionRoster?.length) return false;
  const profile = drawDefinition.competitionProfile;
  const scoring = getRotatingPartnerScoringContract({ drawDefinition });
  if (rounds.length && (!profile || profile.format === 'LADDER' || scoring.error)) return false;
  const participants = new Map(
    (tournamentRecord.participants ?? []).map((participant) => [participant.participantId, participant]),
  );
  for (const round of rounds) {
    if (
      !profile ||
      profile.format === 'LADDER' ||
      round.format !== profile.format ||
      round.baseSeed !== profile.pairing.seed ||
      canonicalJson(round.scoringContract) !== canonicalJson(scoring.contract)
    )
      return false;
    const structure = drawDefinition.structures?.find((candidate) => candidate.structureId === round.structureId);
    const matches = new Map((matchUpsOf(structure) ?? []).map((matchUp) => [matchUp.matchUpId, matchUp]));
    if (!Array.isArray(round.pairings) || round.matchUpIds.length !== round.pairings.length) return false;
    for (const [index, id] of round.matchUpIds.entries()) {
      const matchUp = matches.get(id);
      if (matchUp?.roundNumber !== round.roundNumber || matchUp.sides?.length !== 2) return false;
      if (matchUp.matchUpFormat !== `SET1-S:${stringifyCombinedPointFormat(round.scoringContract)}`) return false;
      for (let sideNumber = 1; sideNumber <= 2; sideNumber++) {
        const side = matchUp.sides.find((candidate) => candidate.sideNumber === sideNumber);
        const pair = participants.get(side?.participantId ?? '');
        const members = pair?.individualParticipantIds;
        if (
          pair?.participantType !== PAIR ||
          !Array.isArray(members) ||
          canonicalJson(members.toSorted()) !== canonicalJson(round.pairings[index][sideNumber - 1].toSorted())
        )
          return false;
      }
    }
  }
  return true;
}
