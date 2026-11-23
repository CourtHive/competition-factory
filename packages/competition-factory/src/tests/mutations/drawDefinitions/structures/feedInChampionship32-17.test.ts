import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { getDrawStructures } from '@Acquire/findStructure';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and fixtures
import { CONSOLATION, FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { BYE } from '@Constants/matchUpStatusConstants';
import { SINGLES } from '@Constants/eventConstants';

it('correctly assigns BYE positions in consolation structure', () => {
  const drawSize = 32;
  const participantsCount = 17;
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount },
  });
  const { participants } = tournamentRecord;
  tournamentEngine.setState(tournamentRecord);

  const event = {
    eventName: 'Feed In Championship',
    eventType: SINGLES,
  };

  let result = tournamentEngine.addEvent({ event });
  const { event: createdEvent } = result;
  const { eventId } = createdEvent;

  const participantIds = participants.map((p) => p.participantId);
  tournamentEngine.addEventEntries({ eventId, participantIds });

  const { drawDefinition } = tournamentEngine.generateDrawDefinition({
    matchUpFormat: FORMAT_STANDARD,
    drawType: FEED_IN_CHAMPIONSHIP,
    drawSize,
    eventId,
  });
  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  expect(result.success).toEqual(true);

  const {
    structures: [consolationStructure],
  } = getDrawStructures({ drawDefinition, stage: CONSOLATION });

  const { roundMatchUps } = getRoundMatchUps(consolationStructure);
  const round1ByeCount = roundMatchUps?.[1].map((matchUp) => matchUp.matchUpStatus === BYE).length;
  expect(round1ByeCount).toEqual(8);
  const round2ByeCount = roundMatchUps?.[2].map((matchUp) => matchUp.matchUpStatus === BYE).length;
  expect(round2ByeCount).toEqual(8);
});
