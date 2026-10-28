import { announceDrawChange, attributesSnapshot } from '@Mutate/drawDefinitions/announceDrawChange';
import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { getPairedParticipant } from '@Query/participant/getPairedParticipant';
import { getTeamMemberships } from '@Mutate/matchUps/lineUps/teamMembership';
import { resolveScaleValueNumber } from '@Query/scales/resolveScaleValue';
import { getParticipants } from '@Query/participants/getParticipants';
import { addParticipant } from '@Mutate/participants/addParticipant';
import { validateTieFormat } from '@Validators/validateTieFormat';
import { getParticipantId } from '@Functions/global/extractors';
import { generateRange } from '@Tools/arrays';

// constants and types
import { CollectionAssignment, DrawDefinition, Event, TieFormat, Tournament } from '@Types/tournamentTypes';
import { DOUBLES_MATCHUP, SINGLES_MATCHUP } from '@Constants/matchUpTypes';
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { FEMALE, MALE } from '@Constants/genderConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import { DESCENDING } from '@Constants/sortingConstants';
import { ResultType, LineUp } from '@Types/factoryTypes';
import { LINEUPS } from '@Constants/extensionConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { PAIR } from '@Constants/participantConstants';
import { coercedGender } from '@Helpers/coercedGender';
import { SUCCESS } from '@Constants/resultConstants';
import { RANKING } from '@Constants/scaleConstants';
import { isGendered } from '@Validators/isGendered';
import { isMixed } from '@Validators/isMixed';
import {
  DRAW_DEFINITION_NOT_FOUND,
  INVALID_EVENT_TYPE,
  INVALID_TIE_FORMAT,
  INVALID_VALUES,
  MISSING_TOURNAMENT_RECORD,
} from '@Constants/errorConditionConstants';

type GenerateLineUpsArgs = {
  useDefaultEventRanking?: boolean;
  /** a player fills at most one SINGLES position: two singles collections get two different players. Doubles
   * collections are left alone, where one player in (say) men's and mixed doubles is ordinary */
  exclusiveSingles?: boolean;
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
    exclusiveSingles,
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
      // Returned the raw accessor value, so an unrated player's '' reached the
      // comparator, where `'' - 11.2` coerces to 0 and floats them to the top of
      // an ascending lineup. Resolve, then fall back explicitly.
      const resolved = resolveScaleValueNumber(scaleValue, { accessor, scaleName });
      if (resolved !== undefined) return resolved;
    }
    // No usable value: sink rather than lead, in either sort direction.
    return sortOrder === DESCENDING ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
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
  // one player, one team, per event: a player who belongs to another team of the event (by roster or by a
  // lineUp in any of its draws) is not placed, so overlapping rosters leave the shared player out of both
  const memberships = getTeamMemberships({ tournamentRecord, event });
  for (const teamParticipant of teamParticipants) {
    const ownPlayers = (teamParticipant.individualParticipants ?? []).filter(({ participantId }) =>
      [...(memberships.get(participantId) ?? [])].every((teamId) => teamId === teamParticipant.participantId),
    );
    const singlesSort = ownPlayers.toSorted(singlesScaleSort);
    const doublesSort = singlesOnly ? singlesSort : ownPlayers.toSorted(doublesScaleSort);
    // the players already placed in an earlier singles collection (`exclusiveSingles`)
    const singlesPlaced: string[] = [];

    const participantAssignments: { [key: string]: CollectionAssignment[] } = {};
    for (const collectionDefinition of collectionDefinitions) {
      const { collectionId, matchUpCount, matchUpType, gender } = collectionDefinition;
      // a player is placed once per collection, and with `exclusiveSingles` once across the singles collections
      const singlesType = isMatchUpEventType(SINGLES_MATCHUP)(matchUpType);
      const collectionParticipantIds: string[] = exclusiveSingles && singlesType ? singlesPlaced : [];
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
    if (drawDefinition) {
      const attributes = ['lineUps'];
      const before = attributesSnapshot(drawDefinition, attributes);
      setFirstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS, value: lineUps });
      announceDrawChange({ tournamentRecord, drawDefinition, attributes, before, event });
    }
  }

  return { ...SUCCESS, lineUps, participantsToAdd };
}
