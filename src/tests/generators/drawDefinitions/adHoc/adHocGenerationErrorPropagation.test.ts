import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { AD_HOC } from '@Constants/drawDefinitionConstants';

const DRAW_SIZE = 8;
const SINGLE_ROBIN_ROUNDS = DRAW_SIZE - 1;

function generateAdHocDraw(params: any) {
  mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: DRAW_SIZE }, setState: true });
  const participantIds = tournamentEngine.getParticipants().participants.map(({ participantId }) => participantId);
  tournamentEngine.addEvent({ event: { eventName: 'AD_HOC event', eventId: 'eventId' } });
  tournamentEngine.addEventEntries({ eventId: 'eventId', participantIds });

  let result: any = tournamentEngine.generateDrawDefinition({
    drawType: AD_HOC,
    drawSize: DRAW_SIZE,
    automated: true,
    eventId: 'eventId',
    ...params,
  });

  const matchUps = (result.drawDefinition?.structures ?? []).flatMap(({ matchUps }) => matchUps ?? []);
  return { error: result.error, matchUpsCount: matchUps.length };
}

describe('generateDrawDefinition AD_HOC error propagation', () => {
  // regression: generateNewDrawDefinition discarded generateAdHoc's result, so drawMatic's
  // 'Not enough participants for roundsCount' was swallowed and the caller received a
  // well-formed drawDefinition with ZERO matchUps and no error
  it('surfaces the error when roundsCount exceeds what the entrants can pair', () => {
    const { error, matchUpsCount } = generateAdHocDraw({ roundsCount: SINGLE_ROBIN_ROUNDS + 1 });
    expect(error).toEqual(INVALID_VALUES);
    expect(matchUpsCount).toEqual(0);
  });

  it('generates a full single round robin without error', () => {
    const { error, matchUpsCount } = generateAdHocDraw({ roundsCount: SINGLE_ROBIN_ROUNDS });
    expect(error).toBeUndefined();
    expect(matchUpsCount).toEqual((SINGLE_ROBIN_ROUNDS * DRAW_SIZE) / 2);
  });

  it('generates a double round robin when enableDoubleRobin is set', () => {
    const roundsCount = SINGLE_ROBIN_ROUNDS * 2;
    const { error, matchUpsCount } = generateAdHocDraw({ roundsCount, enableDoubleRobin: true });
    expect(error).toBeUndefined();
    expect(matchUpsCount).toEqual((roundsCount * DRAW_SIZE) / 2);
  });
});
