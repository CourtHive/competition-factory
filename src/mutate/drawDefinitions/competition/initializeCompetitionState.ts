// Query
import { getCompetitionPolicy } from '@Query/drawDefinition/competition/getCompetitionPolicy';

// Generators
import { getAdHocRatings } from '@Generators/drawDefinitions/drawTypes/adHoc/drawMatic/getAdHocRatings';

// Mutate
import { addExtension } from '@Mutate/extensions/addExtension';

// Constants
import { MISSING_DRAW_DEFINITION, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { COMPETITION_STATE } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { DOUBLES } from '@Constants/eventConstants';

// Types
import type { CompetitionParticipantState, CompetitionState } from '@Types/competitionPolicyTypes';
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import type { ResultType } from '@Types/factoryTypes';

type InitializeCompetitionStateArgs = {
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  participantIds: string[];
  event?: Event;
};

type InitializeCompetitionStateResult = ResultType & {
  competitionState?: CompetitionState;
};

export function initializeCompetitionState(
  params: InitializeCompetitionStateArgs,
): InitializeCompetitionStateResult {
  const { tournamentRecord, drawDefinition, participantIds, event } = params;
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!participantIds?.length) return { error: MISSING_VALUE };

  const { competitionPolicy } = getCompetitionPolicy({ tournamentRecord, drawDefinition, event });
  if (!competitionPolicy) return { ...SUCCESS };

  const ratingPolicy = competitionPolicy.ratingPolicy;
  const scaleName = ratingPolicy.baselineRating.scaleName;
  const aggregation = ratingPolicy.ratingAggregation ?? 'AVERAGE';
  const eventType = event?.eventType;

  // Resolve baseline ratings using the same infrastructure as DrawMatic
  const adHocRatings = scaleName
    ? getAdHocRatings({ tournamentRecord, participantIds, scaleName, eventType })
    : {};

  const participantStates: Record<string, CompetitionParticipantState> = {};

  for (const participantId of participantIds) {
    const baselineRating = resolveBaselineRating({
      tournamentRecord,
      participantId,
      adHocRatings,
      aggregation,
      eventType,
    });

    participantStates[participantId] = {
      participantId,
      baselineRating,
      dynamicFormRating: baselineRating,
      pressureRating: 0,
      roundsPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      totalPointsWon: 0,
      totalPointsLost: 0,
      ratingHistory: [],
    };
  }

  const competitionState: CompetitionState = {
    participantStates,
    roundStates: {},
  };

  addExtension({
    element: drawDefinition,
    extension: { name: COMPETITION_STATE, value: competitionState },
  });

  return { competitionState, ...SUCCESS };
}

function resolveBaselineRating({
  tournamentRecord,
  participantId,
  adHocRatings,
  aggregation,
  eventType,
}: {
  tournamentRecord: Tournament;
  participantId: string;
  adHocRatings: Record<string, number>;
  aggregation: string;
  eventType?: string;
}): number {
  // Direct rating available
  if (adHocRatings[participantId] !== undefined) return adHocRatings[participantId];

  // For PAIR/TEAM participants, aggregate individual ratings
  if (eventType === DOUBLES) {
    const participant = tournamentRecord.participants?.find((p) => p.participantId === participantId);
    const individualIds = participant?.individualParticipantIds;
    if (individualIds?.length) {
      const individualRatings = individualIds.map((id) => adHocRatings[id] ?? 0);
      return aggregateRatings(individualRatings, aggregation);
    }
  }

  return 0;
}

function aggregateRatings(ratings: number[], method: string): number {
  if (!ratings.length) return 0;
  switch (method) {
    case 'MIN':
      return Math.min(...ratings);
    case 'MAX':
      return Math.max(...ratings);
    case 'SUM':
      return ratings.reduce((a, b) => a + b, 0);
    case 'AVERAGE':
    default:
      return ratings.reduce((a, b) => a + b, 0) / ratings.length;
  }
}
