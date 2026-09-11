import tieFormatDefaults from '../templates/tieFormatDefaults';
import { processTieFormat } from './processTieFormat';

// constants
import { FEMALE, MIXED, OTHER, MALE, ANY } from '@Constants/genderConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { QUALIFYING } from '@Constants/drawDefinitionConstants';
import { DOUBLES, TEAM } from '@Constants/eventConstants';

export function getParticipantsCount({ participantsProfile, eventProfiles, drawProfiles }) {
  let { participantsCount, participantType = INDIVIDUAL } = participantsProfile ?? {};
  const specifiedParicipantsCount = participantsCount || 0; // capture this to ensure calculated participantsCount is not below

  const gendersCount = {
    [FEMALE]: 0,
    [MIXED]: 0,
    [OTHER]: 0,
    [MALE]: 0,
    [ANY]: 0,
  };
  let largestDoublesDraw = 0,
    largestSinglesDraw = 0,
    largestTeamSize = 0,
    largestTeamDraw = 0,
    uniqueParticipantsCount = 0;

  const processDrawProfile = ({
    alternatesCount = 0,
    uniqueParticipants,
    tieFormatName,
    drawSize = 0,
    eventType,
    tieFormat,
    category,
    gender,
    stage,
  }) => {
    const isDoubles = eventType === DOUBLES;
    const isTeam = eventType === TEAM;
    // `gender: ANY` is a sentinel for "no gender constraint" — treat it the
    // same as an unset gender so it doesn't trigger per-draw unique-pool
    // synthesis on top of any caller-supplied participantsProfile.
    const requiresUniqueParticipants = Boolean(
      uniqueParticipants || stage === QUALIFYING || category || (gender && gender !== ANY),
    );

    if (isTeam) {
      largestTeamDraw = Math.max(largestTeamDraw, drawSize + alternatesCount);

      tieFormat = typeof tieFormat === 'object' ? tieFormat : tieFormatDefaults({ namedFormat: tieFormatName });

      const { teamSize, maxDoublesDraw, maxSinglesDraw, genders } = processTieFormat({
        alternatesCount,
        tieFormatName,
        tieFormat,
        drawSize,
      });
      largestTeamSize = Math.max(largestTeamSize, teamSize);
      largestSinglesDraw = Math.max(largestSinglesDraw, maxSinglesDraw);
      if (!requiresUniqueParticipants) {
        largestDoublesDraw = Math.max(largestDoublesDraw, maxDoublesDraw);
      }
      Object.keys(genders).forEach((key) => (gendersCount[key] += genders[key]));
    } else if (isDoubles) {
      if (requiresUniqueParticipants) {
        const additionalParticipantsCount = (drawSize + alternatesCount) * 2;
        uniqueParticipantsCount += additionalParticipantsCount;
        if (gender) gendersCount[gender] += additionalParticipantsCount;
      } else if (drawSize + alternatesCount && drawSize + alternatesCount > largestDoublesDraw) {
        largestDoublesDraw = drawSize + alternatesCount;
      }
    } else if (requiresUniqueParticipants) {
      const additionalParticipantsCount = drawSize + alternatesCount;
      if (gender) gendersCount[gender] += additionalParticipantsCount;
      uniqueParticipantsCount += additionalParticipantsCount;
    } else if (drawSize && drawSize > largestSinglesDraw) {
      largestSinglesDraw = drawSize + alternatesCount;
    }
  };

  eventProfiles?.forEach((eventProfile) => {
    const {
      tieFormatName: eventTieFormatName,
      tieFormat: eventTieFormat,
      drawProfiles,
      eventType,
      category,
      gender,
    } = eventProfile;

    if (drawProfiles) {
      for (const drawProfile of drawProfiles) {
        const { tieFormatName, tieFormat } = drawProfile;

        processDrawProfile({
          ...drawProfile,
          tieFormatName: tieFormatName || eventTieFormatName,
          tieFormat: tieFormat || eventTieFormat,
          eventType,
          category,
          gender,
        });
      }
    } else {
      /*
       * if (category) categories.push(category);
       */
    }
  });

  if (Array.isArray(drawProfiles)) {
    for (const drawProfile of drawProfiles) {
      processDrawProfile(drawProfile);
    }
  }
  const individualCompetitorsCount = Math.max(
    largestTeamDraw * largestTeamSize,
    largestDoublesDraw * 2,
    largestSinglesDraw,
  );

  if (largestDoublesDraw) participantType = PAIR;
  if ((participantsCount || specifiedParicipantsCount) < individualCompetitorsCount)
    participantsCount = individualCompetitorsCount;

  if (participantsCount && largestDoublesDraw && [PAIR, TEAM].includes(participantType)) {
    // if we are generating PAIRs or TEAMs...
    if (largestSinglesDraw && Math.floor(largestSinglesDraw / 2) > largestDoublesDraw) {
      // if the half the singles draw is still larger than doubles draw
      participantsCount = Math.floor(largestSinglesDraw / 2);
    } else if (!largestSinglesDraw || largestDoublesDraw * 2 >= largestSinglesDraw) {
      // otherwise participantsCount can be cut in half
      participantsCount = Math.ceil(participantsCount / 2);
    }
  }

  if (participantsCount === undefined) {
    participantsCount = !eventProfiles?.length && !drawProfiles?.length ? 32 : 0;
  }
  if (participantsCount < specifiedParicipantsCount) participantsCount = specifiedParicipantsCount;

  return {
    uniqueParticipantsCount,
    participantsCount,
    largestTeamDraw,
    largestTeamSize,
    participantType,
    gendersCount,
  };
}
