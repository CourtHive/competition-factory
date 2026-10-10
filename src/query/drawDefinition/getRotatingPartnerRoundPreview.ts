import { generateAmericanoPairings } from '@Generators/drawDefinitions/drawTypes/adHoc/rotatingPartners/generateAmericanoPairings';
import { generateMexicanoPairings } from '@Generators/drawDefinitions/drawTypes/adHoc/rotatingPartners/generateMexicanoPairings';
import { getAvailableMatchUpsCount } from '@Generators/drawDefinitions/drawTypes/adHoc/getAvailableMatchUpsCount';
import { appliedRotatingPartnerRoundsAreIntact } from '@Validators/appliedRotatingPartnerRoundsAreIntact';
import { isRotatingPartnerDraw, validateRotatingPartnerEntrants } from '@Validators/rotatingPartnerDraw';
import { getRotatingPartnerScoringContract } from './getRotatingPartnerScoringContract';
import { getRotatingPartnerTallyPolicy } from './getRotatingPartnerTallyPolicy';
import { getRotatingPartnerStandings } from './getRotatingPartnerStandings';
import { checkValidEntries } from '@Validators/checkValidEntries';
import { matchUpsOf } from '@Acquire/structureMembers';
import { canonicalJson } from '@Tools/canonicalJson';

// constants and types
import type { RotatingPartnerRound } from '@Generators/drawDefinitions/drawTypes/adHoc/rotatingPartners/rotatingPartnerTypes';
import type { RotatingPartnerScoreContract } from '@Types/rotatingPartnerScoring';
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import type { RotatingPartnerTallyPolicy } from '@Types/rotatingPartnerTally';
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
  tallyContract?: RotatingPartnerTallyPolicy;
  standingsThroughRoundNumber?: number;
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
  const participantIds = entries
    .map((entry) => entry.participantId)
    .sort((a, b) => {
      if (a === b) return 0;
      return a < b ? -1 : 1;
    });
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
  const structure = drawDefinition.structures?.find((candidate) => candidate.structureId === structureId);
  const tally = getRotatingPartnerTallyPolicy({ ...params, structure });
  if (tally.error) return tally;
  let standingsSnapshot = participantIds.map((participantId) => ({ participantId, pointsScored: 0 }));
  if (profile.format === 'MEXICANO' && roundNumber > 1) {
    const standings = getRotatingPartnerStandings({ ...params, throughRoundNumber: roundNumber - 1 });
    if (standings.error) return standings;
    if (standings.unresolved?.length)
      return { error: INVALID_VALUES, info: 'prior Mexicano rounds have unresolved results' };
    standingsSnapshot = standings.standings!.map(({ participantId, pointsScored }) => ({
      participantId,
      pointsScored,
    }));
  }
  const generated =
    profile.format === 'AMERICANO'
      ? generateAmericanoPairings({ participantIds, seed: profile.pairing.seed })
      : generateMexicanoPairings({
          standings: standingsSnapshot,
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
    ...(profile.format === 'MEXICANO' ? { standingsSnapshot, standingsThroughRoundNumber: roundNumber - 1 } : {}),
    tallyContract: tally.tallyPolicy,
    scoringContract: scoring.contract,
    seedUsed: generated.seedUsed,
  };
}

export { appliedRotatingPartnerRoundsAreIntact } from '@Validators/appliedRotatingPartnerRoundsAreIntact';
