import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { AD_HOC, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

const DRAW_SIZE = 6;
const ROUNDS_PER_ENCOUNTER = DRAW_SIZE - 1;
const MATCHUPS_PER_ROUND = DRAW_SIZE / 2;

function generateShapedDraw(params: any) {
  mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: DRAW_SIZE }, setState: true });
  const participantIds = tournamentEngine.getParticipants().participants.map(({ participantId }) => participantId);
  tournamentEngine.addEvent({ event: { eventName: 'Shaped event', eventId: 'eventId' } });
  tournamentEngine.addEventEntries({ eventId: 'eventId', participantIds });

  const result: any = tournamentEngine.generateDrawDefinition({
    drawType: AD_HOC,
    drawSize: DRAW_SIZE,
    eventId: 'eventId',
    automated: true,
    ...params,
  });

  const matchUps = (result.drawDefinition?.structures ?? []).flatMap(({ matchUps }) => matchUps ?? []);
  const meetings = matchUps.map(({ sides }) =>
    sides
      .map(({ participantId }) => participantId)
      .sort((a, b) => a.localeCompare(b))
      .join('|'),
  );

  return {
    error: result.error,
    roundsGenerated: new Set(matchUps.map(({ roundNumber }) => roundNumber)).size,
    matchUpsCount: matchUps.length,
    uniqueMeetings: new Set(meetings).size,
    meetings,
  };
}

describe('generateDrawDefinition pairingProfile', () => {
  it('generates a full single round robin schedule', () => {
    const result = generateShapedDraw({ pairingProfile: { shape: ROUND_ROBIN } });

    expect(result.error).toBeUndefined();
    expect(result.roundsGenerated).toEqual(ROUNDS_PER_ENCOUNTER);
    expect(result.matchUpsCount).toEqual(ROUNDS_PER_ENCOUNTER * MATCHUPS_PER_ROUND);
    // every entrant meets every other entrant exactly once — the property drawMatic cannot guarantee
    expect(result.uniqueMeetings).toEqual((DRAW_SIZE * (DRAW_SIZE - 1)) / 2);
    expect(result.uniqueMeetings).toEqual(result.matchUpsCount);
  });

  it('generates a double round robin', () => {
    const result = generateShapedDraw({ pairingProfile: { shape: ROUND_ROBIN, encounters: 2 } });

    expect(result.error).toBeUndefined();
    expect(result.roundsGenerated).toEqual(ROUNDS_PER_ENCOUNTER * 2);
    expect(result.matchUpsCount).toEqual(ROUNDS_PER_ENCOUNTER * 2 * MATCHUPS_PER_ROUND);
    // each meeting occurs exactly twice
    expect(result.uniqueMeetings).toEqual(result.matchUpsCount / 2);
  });

  it('generates a triple round robin', () => {
    const result = generateShapedDraw({ pairingProfile: { shape: ROUND_ROBIN, encounters: 3 } });

    expect(result.error).toBeUndefined();
    expect(result.roundsGenerated).toEqual(ROUNDS_PER_ENCOUNTER * 3);
    expect(result.uniqueMeetings).toEqual(result.matchUpsCount / 3);
  });

  it('generates a partial round robin when roundsCount truncates the schedule', () => {
    const result = generateShapedDraw({ pairingProfile: { shape: ROUND_ROBIN }, roundsCount: 2 });

    expect(result.error).toBeUndefined();
    expect(result.roundsGenerated).toEqual(2);
    expect(result.matchUpsCount).toEqual(2 * MATCHUPS_PER_ROUND);
    // a partial schedule materializes only the meetings that occur, with no repeats
    expect(result.uniqueMeetings).toEqual(result.matchUpsCount);
  });

  it('reports a roundsCount the shape cannot supply', () => {
    const result = generateShapedDraw({
      pairingProfile: { shape: ROUND_ROBIN },
      roundsCount: ROUNDS_PER_ENCOUNTER + 1,
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.matchUpsCount).toEqual(0);
  });

  it('reports an unrecognized shape', () => {
    const result = generateShapedDraw({ pairingProfile: { shape: 'NOT_A_SHAPE' } });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.matchUpsCount).toEqual(0);
  });
});
