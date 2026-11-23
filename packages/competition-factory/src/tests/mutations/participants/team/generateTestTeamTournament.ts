import mocksEngine from '@Assemblies/engines/mock';
import { generateRange } from '@Tools/arrays';

// constants and fixtures
import { FORMAT_ATP_DOUBLES, FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';

const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

export function generateTeamTournament(params?) {
  const {
    drawType = SINGLE_ELIMINATION,
    attachScoringPolicy = true,
    drawProfilesCount = 1,
    doublesCount = 1,
    singlesCount = 2,
    drawSize = 8,
  } = params || {};
  const valueGoal = Math.ceil((doublesCount + singlesCount) / 2);
  const tieFormat = {
    winCriteria: { valueGoal },
    collectionDefinitions: [
      {
        collectionId: 'doublesCollectionId',
        matchUpFormat: FORMAT_ATP_DOUBLES,
        matchUpCount: doublesCount,
        collectionName: 'Doubles',
        matchUpType: DOUBLES,
        matchUpValue: 1,
      },
      {
        collectionId: 'singlesCollectionId',
        matchUpFormat: FORMAT_STANDARD,
        matchUpCount: singlesCount,
        collectionName: 'Singles',
        matchUpType: SINGLES,
        matchUpValue: 1,
      },
    ],
  };

  const drawProfiles = generateRange(0, drawProfilesCount).map((i) => ({
    drawName: `Main Draw ${i + 1}`,
    tieFormat,
    drawType,
    drawSize,
  }));

  const eventProfiles = [
    {
      eventName: 'Test Team Event',
      eventType: TEAM_EVENT,
      drawProfiles,
      tieFormat,
    },
  ];

  const {
    drawIds,
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    policyDefinitions: attachScoringPolicy ? policyDefinitions : undefined,
    participantsProfile: { idPrefix: 'xxx' },
    eventProfiles,
  });

  const [drawId] = drawIds;

  return { tournamentRecord, eventId, drawId, drawIds, valueGoal };
}
