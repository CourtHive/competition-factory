import { isRotatingPartnerScoringVariant, sameScoringVariant } from '@Validators/rotatingPartnerScoringPolicy';
import { getRotatingPartnerScoringPolicy } from '@Query/drawDefinition/getRotatingPartnerScoringPolicy';
import { validateRotatingPartnerEntrants } from '@Validators/rotatingPartnerDraw';
import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { isCompetitionProfile } from '@Validators/competitionProfile';
import { matchUpsOf, structuresOf } from '@Acquire/structureMembers';
import { canonicalJson } from '@Tools/canonicalJson';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { MISSING_DRAW_DEFINITION, INVALID_VALUES, EXISTING_MATCHUPS } from '@Constants/errorConditionConstants';
import type { DrawDefinition, Event, Structure, Tournament } from '@Types/tournamentTypes';
import type { RotatingPartnerScoringVariant } from '@Types/rotatingPartnerScoring';
import type { CompetitionProfile } from '@Types/competitionProfile';
import { AD_HOC, LADDER } from '@Constants/drawDefinitionConstants';
import type { ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { DOUBLES } from '@Constants/eventConstants';

type ProfileContext = {
  drawDefinition?: DrawDefinition;
  tournamentRecord?: Tournament;
  event?: Event;
};

function structureHasMatchUps(structure: Structure): boolean {
  return !!matchUpsOf(structure)?.length || !!structuresOf(structure)?.some(structureHasMatchUps);
}

function hasMatchUps(draw: DrawDefinition): boolean {
  return !!draw.matchUps?.length || !!draw.structures?.some(structureHasMatchUps);
}

export function setCompetitionProfile(params: ProfileContext & { competitionProfile: CompetitionProfile }): ResultType {
  const { drawDefinition, competitionProfile, tournamentRecord, event } = params;
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!isCompetitionProfile(competitionProfile)) return { error: INVALID_VALUES, info: 'invalid competitionProfile' };
  const drawType = competitionProfile.format === 'LADDER' ? LADDER : AD_HOC;
  if (drawDefinition.drawType !== drawType)
    return { error: INVALID_VALUES, info: 'competitionProfile drawType mismatch' };
  if (competitionProfile.format !== 'LADDER' && (drawDefinition.matchUpType ?? event?.eventType) !== DOUBLES) {
    return { error: INVALID_VALUES, info: 'rotating-partner profiles require doubles' };
  }
  if (
    drawDefinition.competitionProfile &&
    canonicalJson(drawDefinition.competitionProfile) === canonicalJson(competitionProfile)
  )
    return { ...SUCCESS };
  if (competitionProfile.format !== 'LADDER' && drawDefinition.entries?.length) {
    const validation = validateRotatingPartnerEntrants({
      participantIds: drawDefinition.entries.map((entry) => entry.participantId),
      tournamentRecord,
    });
    if (validation.error) return validation;
  }
  if (hasMatchUps(drawDefinition))
    return { error: EXISTING_MATCHUPS, info: 'competitionProfile is locked once matchUps exist' };
  if (competitionProfile.format !== 'LADDER') {
    const validation = getRotatingPartnerScoringPolicy({
      tournamentRecord,
      event,
      drawDefinition: { ...drawDefinition, competitionProfile },
    });
    if (validation.error) return validation;
  }
  drawDefinition.competitionProfile = makeDeepCopy(competitionProfile, undefined, true);
  modifyDrawNotice({ drawDefinition, tournamentId: tournamentRecord?.tournamentId, eventId: event?.eventId });
  return { ...SUCCESS };
}

export function removeCompetitionProfile({ drawDefinition, tournamentRecord, event }: ProfileContext): ResultType {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!drawDefinition.competitionProfile) return { ...SUCCESS };
  if (hasMatchUps(drawDefinition))
    return { error: EXISTING_MATCHUPS, info: 'competitionProfile is locked once matchUps exist' };
  if (drawDefinition.competitionProfile.format !== 'LADDER' && drawDefinition.entries?.length)
    return { error: INVALID_VALUES, info: 'remove individual draw entries before removing the rotating profile' };
  delete drawDefinition.competitionProfile;
  modifyDrawNotice({ drawDefinition, tournamentId: tournamentRecord?.tournamentId, eventId: event?.eventId });
  return { ...SUCCESS };
}

/** Save a policy-approved default or explicit choice before matchUps exist. */
export function setRotatingPartnerScoring(
  params: ProfileContext & {
    selectedVariant?: RotatingPartnerScoringVariant;
  },
): ResultType {
  const { drawDefinition } = params;
  const existing = drawDefinition?.competitionProfile;
  if (
    isCompetitionProfile(existing) &&
    existing.format !== 'LADDER' &&
    existing.scoring.selectedVariant &&
    (params.selectedVariant === undefined ||
      (isRotatingPartnerScoringVariant(params.selectedVariant) &&
        sameScoringVariant(existing.scoring.selectedVariant, params.selectedVariant)))
  ) {
    return setCompetitionProfile({ ...params, competitionProfile: existing });
  }
  const resolved = getRotatingPartnerScoringPolicy(params);
  if (resolved.error) return resolved;
  const profile = drawDefinition?.competitionProfile;
  if (!profile || profile.format === 'LADDER' || !resolved.contract) return { error: INVALID_VALUES };
  const { combinedPointTotal, ...selectedVariant } = resolved.contract;
  return setCompetitionProfile({
    ...params,
    competitionProfile: { ...profile, scoring: { combinedPointTotal, selectedVariant } },
  });
}
