import { afterAll, describe, it, expect, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants
import { SINGLES_EVENT } from '@Constants/eventConstants';
import { RATING } from '@Constants/scaleConstants';
import { ELO } from '@Constants/ratingConstants';

describe('should mock console.log', () => {
  const consoleMock = vi.spyOn(console, 'log').mockImplementation(() => undefined);

  afterAll(() => {
    consoleMock.mockReset();
  });

  it('should log `sample output`', () => {
    console.log('sample output');
    expect(consoleMock).toHaveBeenCalledOnce();
    expect(consoleMock).toHaveBeenLastCalledWith('sample output');
  });

  it('can capture logged errors', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
    });
    tournamentEngine.setState(tournamentRecord);
    tournamentEngine.devContext({ errors: true });
    tournamentEngine.getEvent();
    expect(consoleMock).toHaveBeenCalledTimes(2);
    expect(consoleMock).toHaveBeenLastCalledWith(
      'sync',
      expect.objectContaining({
        method: 'getEvent',
        result: expect.objectContaining({
          error: expect.objectContaining({
            message: 'Missing event / eventId',
            code: 'ERR_MISSING_EVENT_ID',
          }),
        }),
      }),
    );
    tournamentEngine.devContext({ errors: false });
    tournamentEngine.getEvent();
    expect(consoleMock).toHaveBeenCalledTimes(2);

    tournamentEngine.devContext({ errors: ['getEvent'] });
    tournamentEngine.getEvent();
    expect(consoleMock).toHaveBeenCalledTimes(3);

    tournamentEngine.devContext({ result: ['getEvent'] });
    tournamentEngine.getEvent();
    expect(consoleMock).toHaveBeenCalledTimes(4);

    tournamentEngine.devContext({ result: ['participantScaleItem'] });
    tournamentEngine.getEvent();
    expect(consoleMock).toHaveBeenCalledTimes(4);

    consoleMock.mockReset();
    expect(consoleMock).toHaveBeenCalledTimes(0);
  });

  it('can exlude methods from logging', () => {
    const ratingType = ELO;
    const participantsCount = 44;
    const {
      eventIds: [eventId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventName: 'QTest', category: { categoryName: 'U18' } }],
      participantsProfile: {
        scaledParticipantsCount: participantsCount,
        category: { ratingType },
        participantsCount,
      },
    });

    tournamentEngine.devContext({ params: true }).setState(tournamentRecord);
    expect(consoleMock).toHaveBeenCalledTimes(0);

    const participants = tournamentEngine.getParticipants().participants;
    expect(consoleMock).toHaveBeenCalledTimes(1);
    expect(participants.length).toEqual(participantsCount);

    const scaledParticipants = participants.filter(({ timeItems }) => timeItems);
    expect(scaledParticipants.length).toEqual(participantsCount);

    const scaleAttributes = {
      eventType: SINGLES_EVENT,
      scaleType: RATING,
      scaleName: ELO,
    };
    let result = tournamentEngine.participantScaleItem({
      participant: scaledParticipants[0],
      scaleAttributes,
    });
    expect(consoleMock).toHaveBeenCalledTimes(2);
    expect(result.scaleItem.scaleName).toEqual(ratingType);

    tournamentEngine.devContext({
      exclude: ['participantScaleItem'],
      params: true,
    });

    result = tournamentEngine.participantScaleItem({
      participant: scaledParticipants[0],
      scaleAttributes,
    });
    expect(consoleMock).toHaveBeenCalledTimes(2);
    expect(result.scaleItem.scaleName).toEqual(ratingType);

    tournamentEngine.getEvent({ eventId });
    expect(consoleMock).toHaveBeenCalledTimes(3);
  });
});
