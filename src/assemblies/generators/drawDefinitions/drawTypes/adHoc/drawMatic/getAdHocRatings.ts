import { participantScaleItem } from '@Query/participant/participantScaleItem';
import { getRatingConvertedToELO } from '@Generators/scales/eloConversions';
import ratingsParameters from '@Fixtures/ratings/ratingsParameters';
import { isObject } from '@Tools/objects';

// constants and types
import { EventTypeUnion, Participant } from '@Types/tournamentTypes';
import { DYNAMIC, RATING } from '@Constants/scaleConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import { ScaleAttributes } from '@Types/factoryTypes';
import { ELO } from '@Constants/ratingConstants';

export function getAdHocRatings(params) {
  const { tournamentRecord, participantIds, scaleName, eventType, convertToELO, adHocRatings = {} } = params;

  const scaleAccessor = params.scaleAccessor ?? ratingsParameters[scaleName]?.accessor;

  const tournamentParticipants = tournamentRecord.participants ?? [];
  for (const participantId of participantIds ?? []) {
    const participant = tournamentParticipants?.find((participant) => participant.participantId === participantId);

    let scaleValue;

    // When convertToELO, first check for existing ELO.DYNAMIC values (round 2+)
    if (convertToELO) {
      scaleValue = getScaleValue({
        scaleName: `${ELO}.${DYNAMIC}`,
        participant,
        eventType,
      });
    }

    // Then check for source-scale dynamic values (backward compat / non-ELO mode)
    if (!scaleValue) {
      scaleValue = getScaleValue({
        scaleName: `${scaleName}.${DYNAMIC}`,
        participant,
        eventType,
      });
      // If found a source-scale dynamic value while in convertToELO mode,
      // convert it to ELO (handles mixed state from pre-conversion tournaments)
      if (scaleValue && convertToELO && scaleName !== ELO) {
        scaleValue = getRatingConvertedToELO({ sourceRatingType: scaleName, sourceRating: scaleValue });
      }
    }

    // Fall back to base scale value
    if (!scaleValue && scaleName) {
      scaleValue = getScaleValue({
        scaleAccessor,
        participant,
        scaleName,
        eventType,
      });
      // Convert initial rating to ELO when convertToELO is enabled
      if (scaleValue && convertToELO && scaleName !== ELO) {
        scaleValue = getRatingConvertedToELO({ sourceRatingType: scaleName, sourceRating: scaleValue });
      }
    }

    if (scaleValue && !adHocRatings[participantId]) adHocRatings[participantId] = scaleValue;
  }

  return adHocRatings;
}

type GetScaleValueArgs = {
  eventType?: EventTypeUnion;
  scaleAccessor?: string;
  scaleType?: string;
  scaleName: string;
  participant: Participant | undefined;
};

function getScaleValue({ scaleType = RATING, scaleAccessor, participant, scaleName, eventType }: GetScaleValueArgs) {
  const scaleAttributes: ScaleAttributes = {
    eventType: eventType ?? SINGLES_EVENT,
    scaleType,
    scaleName,
  };
  const result =
    participant &&
    participantScaleItem({
      scaleAttributes,
      participant,
    });

  const scaleValue = result?.scaleItem?.scaleValue;
  return scaleAccessor && isObject(scaleValue) ? scaleValue[scaleAccessor] : scaleValue;
}
