import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and fixtures
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { SINGLES } from '@Constants/eventConstants';

let result;

it('can add events to a tournament record', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    startDate: '2020-01-01',
    endDate: '2020-01-06',
  });
  const { participants } = tournamentRecord;

  tournamentEngine.setState(tournamentRecord);

  const eventName = 'Test Event';
  const event = {
    eventName,
    eventType: SINGLES,
  };

  result = tournamentEngine.addEvent({ event });
  const { event: eventResult, success } = result;
  const { eventId } = eventResult;
  expect(success).toEqual(true);

  const participantIds = participants.map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  const matchUpFormat = 'SET5-S:4/TB7';
  const values = {
    automated: true,
    drawSize: 32,
    eventId,
    event: eventResult,
    matchUpFormat,
  };
  const { drawDefinition } = tournamentEngine.generateDrawDefinition(values);
  expect(drawDefinition.matchUpFormat).toEqual(matchUpFormat);

  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  expect(result.success).toEqual(true);

  const { drawId } = drawDefinition;
  const defaultMatchUpFormat = FORMAT_STANDARD;
  result = tournamentEngine.setMatchUpFormat({
    matchUpFormat: defaultMatchUpFormat,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.modificationsCount).toEqual(1);
  const { tournamentRecord: updatedTournamentRecord } = tournamentEngine.getTournament();
  expect(updatedTournamentRecord.events[0].drawDefinitions[0].matchUpFormat).toEqual(defaultMatchUpFormat);
});
