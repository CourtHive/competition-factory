import { getEliminationDrawSize } from '@Query/participants/getEliminationDrawSize';
import { getStageEntries } from '@Query/drawDefinition/getStageEntries';
import { getSeedsCount } from '@Query/drawDefinition/getSeedsCount';
import { decorateResult } from '@Functions/global/decorateResult';

// constants and types
import { DrawDefinition, Event, Entry, StageTypeUnion } from '@Types/tournamentTypes';
import { ErrorType, MISSING_EVENT } from '@Constants/errorConditionConstants';
import { PolicyDefinitions } from '@Types/factoryTypes';

type GetEntriesAndSeedsCountArgs = {
  policyDefinitions: PolicyDefinitions;
  drawDefinition: DrawDefinition;
  stage: StageTypeUnion;
  drawSize?: number;
  drawId?: string;
  event: Event;
};
export function getEntriesAndSeedsCount({
  policyDefinitions,
  drawDefinition,
  drawSize,
  drawId,
  event,
  stage,
}: GetEntriesAndSeedsCountArgs): {
  stageEntries?: Entry[];
  seedsCount?: number;
  entries?: Entry[];
  error?: ErrorType;
} {
  if (!event) return { error: MISSING_EVENT };

  const { entries, stageEntries } = getStageEntries({
    drawDefinition,
    drawId,
    stage,
    event,
  });
  const participantsCount = stageEntries.length;

  const { drawSize: eliminationDrawSize } = getEliminationDrawSize({
    participantsCount,
  });
  const result = getSeedsCount({
    drawSize: drawSize ?? eliminationDrawSize,
    participantsCount,
    policyDefinitions,
  });
  if (result.error) return decorateResult({ result, stack: 'getEntriesAndSeedsCount' });

  const { seedsCount } = result;
  return { entries, seedsCount, stageEntries };
}
