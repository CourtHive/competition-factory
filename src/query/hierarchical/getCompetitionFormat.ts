import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { resolveFromParameters } from '@Helpers/parameters/resolveFromParameters';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { MISSING_DRAW_ID, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { competitionFormat } from '@Types/competitionFormat';
import { SUCCESS } from '@Constants/resultConstants';
import {
  ANY_OF,
  DRAW_ID,
  ERROR,
  EVENT,
  MATCHUP,
  MATCHUP_ID,
  PARAM,
  STRUCTURE_ID,
  TOURNAMENT_RECORD,
} from '@Constants/attributeConstants';

type GetCompetitionFormatArgs = {
  tournamentRecord: Tournament;
  drawDefinition?: DrawDefinition;
  structureId?: string;
  matchUpId?: string;
  eventId?: string;
  drawId?: string;
  event?: Event;
};

export function getCompetitionFormat(params: GetCompetitionFormatArgs): {
  structureDefaultCompetitionFormat?: competitionFormat;
  drawDefaultCompetitionFormat?: competitionFormat;
  eventDefaultCompetitionFormat?: competitionFormat;
  competitionFormat?: competitionFormat;
  error?: any;
  success?: boolean;
} {
  const { structureId, matchUpId, event } = params;
  let drawDefinition = params.drawDefinition;

  const paramCheck = checkRequiredParameters(params, [
    { [TOURNAMENT_RECORD]: true },
    {
      [ANY_OF]: {
        [STRUCTURE_ID]: false,
        [MATCHUP_ID]: false,
        [DRAW_ID]: false,
        [EVENT]: false,
      },
    },
  ]);
  if (paramCheck[ERROR]) return paramCheck;

  const resolutions = resolveFromParameters(params, [{ [PARAM]: MATCHUP, [ERROR]: MISSING_VALUE }]);
  const matchUpResult = resolutions?.matchUp;

  if (matchUpId && matchUpResult?.error) {
    return matchUpResult;
  } else if (!drawDefinition && matchUpResult?.drawDefinition) {
    drawDefinition = matchUpResult?.drawDefinition;
  }

  let structure = matchUpResult?.structure;
  if (!structure && structureId && !matchUpId) {
    if (!drawDefinition) return { error: MISSING_DRAW_ID };
    const structureResult = findStructure({ drawDefinition, structureId });
    if (structureResult.error) return structureResult;
    structure = structureResult.structure;
  }

  const structureDefaultCompetitionFormat = structure?.competitionFormat;
  const drawDefaultCompetitionFormat = drawDefinition?.competitionFormat;
  const eventDefaultCompetitionFormat = event?.competitionFormat;

  const competitionFormat =
    structureDefaultCompetitionFormat || drawDefaultCompetitionFormat || eventDefaultCompetitionFormat;

  return {
    ...SUCCESS,
    structureDefaultCompetitionFormat,
    drawDefaultCompetitionFormat,
    eventDefaultCompetitionFormat,
    competitionFormat,
  };
}
