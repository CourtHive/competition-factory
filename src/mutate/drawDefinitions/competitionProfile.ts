import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { isCompetitionProfile } from '@Validators/competitionProfile';
import { matchUpsOf, structuresOf } from '@Acquire/structureMembers';
import { canonicalJson } from '@Tools/canonicalJson';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { MISSING_DRAW_DEFINITION, INVALID_VALUES, EXISTING_MATCHUPS } from '@Constants/errorConditionConstants';
import type { DrawDefinition, Event, Structure, Tournament } from '@Types/tournamentTypes';
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
  if (hasMatchUps(drawDefinition))
    return { error: EXISTING_MATCHUPS, info: 'competitionProfile is locked once matchUps exist' };
  drawDefinition.competitionProfile = makeDeepCopy(competitionProfile, undefined, true);
  modifyDrawNotice({ drawDefinition, tournamentId: tournamentRecord?.tournamentId, eventId: event?.eventId });
  return { ...SUCCESS };
}

export function removeCompetitionProfile({ drawDefinition, tournamentRecord, event }: ProfileContext): ResultType {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!drawDefinition.competitionProfile) return { ...SUCCESS };
  if (hasMatchUps(drawDefinition))
    return { error: EXISTING_MATCHUPS, info: 'competitionProfile is locked once matchUps exist' };
  delete drawDefinition.competitionProfile;
  modifyDrawNotice({ drawDefinition, tournamentId: tournamentRecord?.tournamentId, eventId: event?.eventId });
  return { ...SUCCESS };
}
