import { validateTieFormat } from '@Validators/validateTieFormat';
import tieFormatConstants from '@Constants/tieFormatConstants';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, test } from 'vitest';

import { TEAM } from '@Constants/eventConstants';

const tieKeys = [
  { key: tieFormatConstants.COLLEGE_D3, collectionsCount: 2 },
  { key: tieFormatConstants.COLLEGE_DEFAULT, collectionsCount: 2 },
  { key: tieFormatConstants.COLLEGE_JUCO, collectionsCount: 2 },
  { key: tieFormatConstants.DOMINANT_DUO, collectionsCount: 2 },
  { key: tieFormatConstants.DOMINANT_DUO_MIXED, collectionsCount: 3 },
  { key: tieFormatConstants.LAVER_CUP, collectionsCount: 6 },
  {
    key: tieFormatConstants.TEAM_DOUBLES_3_AGGREGATION,
    tieFormatName: 'Doubles Shuffle',
    collectionsCount: 3,
  },
  { key: tieFormatConstants.USTA_BREWER_CUP, collectionsCount: 6 },
  { key: tieFormatConstants.USTA_OZAKI_CUP, collectionsCount: 20 },
  { key: tieFormatConstants.USTA_COLLEGE, collectionsCount: 2 },
  { key: tieFormatConstants.USTA_GOLD_TEAM_CHALLENGE, collectionsCount: 5 },
  { key: tieFormatConstants.USTA_INTERSECTIONAL, collectionsCount: 5 },
  { key: tieFormatConstants.USTA_LEVEL_1, collectionsCount: 4 },
  { key: tieFormatConstants.USTA_SECTION_BATTLE, collectionsCount: 5 },
  { key: tieFormatConstants.USTA_SOUTHERN_LEVEL_5, collectionsCount: 3 },
  { key: tieFormatConstants.USTA_WTT_ITT, collectionsCount: 7 },
  { key: tieFormatConstants.USTA_TOC, collectionsCount: 6 },
  { key: tieFormatConstants.USTA_ZONAL, collectionsCount: 5 },
];

it.each(tieKeys)('can generate all exported tieFormatConstants', (tieKey) => {
  const { key, collectionsCount, tieFormatName } = tieKey;
  const { eventIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM, drawSize: 2, tieFormatName: key }],
    eventProfiles: [{ eventType: TEAM }],
  });

  tournamentEngine.setState(tournamentRecord);

  const tieFormat = tournamentRecord.events[0].tieFormat;

  let result: any = validateTieFormat({ tieFormat });
  expect(result.valid).toEqual(true);

  if (tieFormatName) {
    expect(tieFormat.tieFormatName).toEqual(tieFormatName);
  }
  expect(tieFormat.collectionDefinitions.length).toEqual(collectionsCount);

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM] },
  });
  const participantIds = participants.map((p) => p.participantId);

  const eventId = eventIds[1];
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  result = tournamentEngine.generateDrawDefinition({
    tieFormatName: key,
    eventId,
  });
  expect(result.success).toEqual(true);

  const drawDefinition = result.drawDefinition;

  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  expect(result.success).toEqual(true);

  const { drawId } = drawDefinition;
  const { tieFormat: foundTieFormat } = tournamentEngine.getTieFormat({
    eventId,
    drawId,
  });
  if (tieFormatName) {
    expect(foundTieFormat.tieFormatName).toEqual(tieFormatName);
  }
});

test('timed sets can be COMPLETED with tied score', () => {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        tieFormatName: tieFormatConstants.USTA_TOC,
        eventType: TEAM,
        drawSize: 2,
      },
    ],
  });

  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const { tieFormat } = tournamentEngine.getTieFormat({ eventId });
  const collectionId = tieFormat.collectionDefinitions.find(
    ({ collectionName }) => collectionName === 'Overtime',
  ).collectionId;
  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { collectionIds: [collectionId] },
  });
  expect(matchUps.length).toEqual(1);

  const three3 = '3-3';
  const outcome = {
    score: {
      scoreStringSide1: three3,
      scoreStringSide2: three3,
      sets: [
        {
          side1Score: 3,
          side2Score: 3,
          setNumber: 1,
        },
      ],
    },
    matchUpFormat: 'SET1-S:T20',
    matchUpStatus: 'COMPLETED',
  };

  result = tournamentEngine.setMatchUpStatus({
    matchUpId: matchUps[0].matchUpId,
    drawId: matchUps[0].drawId,
    outcome,
  });
  expect(result.success).toEqual(true);

  const { matchUp } = tournamentEngine.findMatchUp({
    matchUpId: matchUps[0].matchUpId,
  });
  expect(matchUp.score.scoreStringSide1).toEqual(three3);

  const { matchUp: dualMatchUp } = tournamentEngine.findMatchUp({
    matchUpId: matchUps[0].matchUpTieId,
  });
  expect(dualMatchUp.score.scoreStringSide1).toEqual(three3);
});
