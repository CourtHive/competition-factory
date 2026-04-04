import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { getPairedParticipant } from '@Query/participant/getPairedParticipant';
import { getParticipants } from '@Query/participants/getParticipants';
import { addParticipant } from '@Mutate/participants/addParticipant';
import { validateTieFormat } from '@Validators/validateTieFormat';
import { getParticipantId } from '@Functions/global/extractors';
import { addExtension } from '@Mutate/extensions/addExtension';
import { generateRange } from '@Tools/arrays';
import { isNumeric } from '@Tools/math';

// constants and types
import { CollectionAssignment, DrawDefinition, Event, TieFormat, Tournament } from '@Types/tournamentTypes';
import { DOUBLES_MATCHUP, SINGLES_MATCHUP } from '@Constants/matchUpTypes';
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { FEMALE, MALE } from '@Constants/genderConstants';
import { ResultType, LineUp } from '@Types/factoryTypes';
import { COMPETITOR } from '@Constants/participantRoles';
import { DESCENDING } from '@Constants/sortingConstants';
import { LINEUPS } from '@Constants/extensionConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { PAIR } from '@Constants/participantConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { RANKING } from '@Constants/scaleConstants';
import {
  DRAW_DEFINITION_NOT_FOUND,
  INVALID_EVENT_TYPE,
  INVALID_TIE_FORMAT,
  INVALID_VALUES,
  MISSING_TOURNAMENT_RECORD,
} from '@Constants/errorConditionConstants';
import { coercedGender } from '@Helpers/coercedGender';
import { isGendered } from '@Validators/isGendered';
import { isMixed } from '@Validators/isMixed';

type GenerateLineUpsArgs = {
  useDefaultEventRanking?: boolean;
  tournamentRecord: Tournament;
  drawDefinition?: DrawDefinition;
  scaleAccessor: any;
  singlesOnly?: boolean;
  tieFormat?: TieFormat;
  attach?: boolean;
  event: Event;
};

// by default if there are no scaleValues matching the scaleAccessor then participants will be assigned in the array order of [team].individidualParticipantIds
export function generateLineUps(params: GenerateLineUpsArgs): ResultType & {
  lineUps?: { [key: string]: LineUp };
  participantsToAdd?: any[];
} {
  let { tieFormat } = params;
  const {
    useDefaultEventRanking,
    tournamentRecord,
    drawDefinition,
    scaleAccessor, // e.g. { scaleType: 'RANKINGS', scaleName: 'U18', accessor: 'wtnRating', sortOrder: 'ASC' }
    singlesOnly, // use singles scale for doubles events
    attach, // boolean - when true attach LINEUPS extension to drawDefinition and add new PAIR participants (where necessary)
    event,
  } = params;

  if (event?.eventType !== TEAM_EVENT) return { error: INVALID_EVENT_TYPE };
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!tieFormat && !drawDefinition) return { error: DRAW_DEFINITION_NOT_FOUND };

  tieFormat = tieFormat ?? resolveTieFormat({ drawDefinition, event })?.tieFormat;

  if (validateTieFormat({ tieFormat }).error) return { error: INVALID_TIE_FORMAT };

  if (typeof scaleAccessor !== 'object' && !useDefaultEventRanking)
    return { error: INVALID_VALUES, context: { scaleAccessor } };

  const lineUps: { [key: string]: LineUp } = {};

  const targetEntries = (drawDefinition?.entries ?? event?.entries ?? []).filter(
    (entry) => entry?.entryStatus === DIRECT_ACCEPTANCE,
  );

  const participantIds = targetEntries.map(getParticipantId);
  const { participants = [] } = getParticipants({
    withIndividualParticipants: true,
    withScaleValues: true,
    tournamentRecord,
  });

  const teamParticipants = participants.filter(({ participantId }) => participantIds.includes(participantId));

  const formatScaleType = (type) => (type === RANKING ? 'rankings' : 'ratings');

  const defaultScaleName = event?.category?.categoryName ?? event?.category?.ageCategoryCode;
  const { scaleName = defaultScaleName, scaleType = RANKING, sortOrder, accessor } = scaleAccessor ?? {};

  const formattedScaleType = formatScaleType(scaleType);
  const getScaleValue = (individualParticipant, matchUpType) => {
    let matchUpTypeScales = individualParticipant[formattedScaleType]?.[matchUpType];

    // if { userDefaultEventRanking: true } fallback to SINGLES if no values for DOUBLES
    if (!matchUpTypeScales && useDefaultEventRanking) {
      matchUpTypeScales = individualParticipant[formattedScaleType]?.[SINGLES_MATCHUP];
    }

    if (Array.isArray(matchUpTypeScales)) {
      const scaleValue = matchUpTypeScales.find((scale) => scale.scaleName === scaleName)?.scaleValue;
      if (isNumeric(scaleValue)) {
        return scaleValue;
      } else if (accessor && typeof scaleValue === 'object') return scaleValue[accessor];
    }
    return 0;
  };

  const sortMethod = (a, b, matchUpType) => {
    const x = sortOrder === DESCENDING ? b : a;
    const y = sortOrder === DESCENDING ? a : b;
    return getScaleValue(x, matchUpType) - getScaleValue(y, matchUpType);
  };
  const singlesScaleSort = (a, b) => sortMethod(a, b, SINGLES_MATCHUP);
  const doublesScaleSort = (a, b) => sortMethod(a, b, DOUBLES_MATCHUP);

  const participantIdPairs: string[][] = [];
  const collectionDefinitions = tieFormat?.collectionDefinitions ?? [];
  for (const teamParticipant of teamParticipants) {
    const singlesSort = teamParticipant.individualParticipants?.sort(singlesScaleSort) ?? [];
    const doublesSort = singlesOnly
      ? singlesSort
      : (teamParticipant.individualParticipants?.sort(doublesScaleSort) ?? []);

    const participantAssignments: { [key: string]: CollectionAssignment[] } = {};
    for (const collectionDefinition of collectionDefinitions) {
      const collectionParticipantIds: string[] = [];
      const { collectionId, matchUpCount, matchUpType, gender } = collectionDefinition;
      const singlesMatchUp = isMatchUpEventType(SINGLES_MATCHUP)(matchUpType);

      generateRange(0, matchUpCount).forEach((i) => {
        const typeSort = singlesMatchUp ? singlesSort : (doublesSort ?? []);
        const collectionPosition = i + 1;

        const participantIds: string[] = [];
        generateRange(0, singlesMatchUp ? 1 : 2).forEach((i) => {
          const nextParticipantId = typeSort?.find((participant) => {
            const coerced = coercedGender(gender);
            const targetGender = coerced && ((isGendered(gender) && coerced) || (isMixed(gender) && [MALE, FEMALE][i]));
            return (
              (!targetGender || targetGender === participant.person?.sex) &&
              !collectionParticipantIds.includes(participant.participantId)
            );
          })?.participantId;

          // keep track of participantIds which have already been assigned
          if (nextParticipantId) {
            participantIds.push(nextParticipantId);
            collectionParticipantIds.push(nextParticipantId);
            if (!participantAssignments[nextParticipantId]) participantAssignments[nextParticipantId] = [];
            participantAssignments[nextParticipantId].push({
              collectionPosition,
              collectionId,
            });
          }
        });
        if (!singlesMatchUp) participantIdPairs.push(participantIds);
      });
    }

    const lineUp: LineUp = Object.keys(participantAssignments).map((participantId) => ({
      collectionAssignments: participantAssignments[participantId],
      participantId,
    }));

    lineUps[teamParticipant.participantId] = lineUp;
  }

  const participantsToAdd: any[] = [];
  for (const pairParticipantIds of participantIdPairs) {
    const { participant: existingPairParticipant } = getPairedParticipant({
      tournamentParticipants: participants,
      participantIds: pairParticipantIds,
    });
    if (!existingPairParticipant) {
      const newPairParticipant = {
        individualParticipantIds: pairParticipantIds,
        participantRole: COMPETITOR,
        participantType: PAIR,
      };
      participantsToAdd.push(newPairParticipant);
    }
  }

  if (attach) {
    while (participantsToAdd.length) {
      addParticipant({
        participant: participantsToAdd.pop(),
        tournamentRecord,
      });
    }
    const extension = { name: LINEUPS, value: lineUps };
    addExtension({ element: drawDefinition, extension });
  }

  return { ...SUCCESS, lineUps, participantsToAdd };
}
