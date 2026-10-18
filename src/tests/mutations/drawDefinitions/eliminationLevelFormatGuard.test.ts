import { formatCanEndTied, parsedFormatCanEndTied } from '@Validators/tiedFormatCompatibility';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { ROUND_ROBIN_WITH_PLAYOFF, SINGLE_ELIMINATION, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { INTENNSE_2026 } from '@Constants/tieFormatConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

const TIE_CAPABLE = 'tie-capable formats are not allowed in elimination structures';

// Scoring-engine spec § 9.7 rule 4 (CA 2026-10-18: "yes, extend the check"): a timed, aggregate or
// exactly-N format that declares no decider ends COMPLETED with no winner, which a structure that
// advances a winner cannot direct.
const CAN_END_LEVEL = [
  'SET1-S:P16', // combined total, even n (the guard before the extension)
  'SET3-S:T10', // timed sets, no tiebreak at time
  'SET1-S:T10P', // one points-based timed segment
  'T90', // standalone timed
  'SET3-S:6/TB7-F:T10', // the deciding set closes level
  'SET2XA-S:T10', // exactly-N aggregate with no -F: decider
  'SET1A-S:T10', // aggregate of one timed segment
  'SET3A-S:TB11', // best-of aggregate: the total can be level, and -F: is one of the N
  'HAL2A-S:T45', // two halves, aggregate
  'SET3XA-S:T10-F:T10P', // the declared decider is timed and can itself close level
  'HAL2X-S:TB11', // exactly two: a level count of halves
  'SET4X-S:T20P-F:T20', // exactly an even N
];

const CANNOT_END_LEVEL = [
  'SET3-S:6/TB7',
  'SET3-S:6/TB7-F:TB10',
  'SET1-S:P15', // combined total, odd n
  'SET1-S:P16DP', // a tie takes a deciding rally
  'SET3-S:T10/TB7', // every timed set takes a tiebreak at time
  'SET1-S:T10P/TB1',
  'SET3XA-S:T10-F:TB1', // exactly-N aggregate with its sudden-death decider (§ 9.4)
  'SET3XA-S:T10-F:TB1NOAD',
  'SET3-S:TB10', // tiebreak-only sets always have a winner
];

describe('formatCanEndTied: every format that can end level', () => {
  it.each(CAN_END_LEVEL)('%s can end level', (matchUpFormat) => {
    expect(formatCanEndTied(matchUpFormat)).toEqual(true);
  });
  it.each(CANNOT_END_LEVEL)('%s always has a winner', (matchUpFormat) => {
    expect(formatCanEndTied(matchUpFormat)).toEqual(false);
  });
  // Parsed shapes, not codes: the conformance matrix harvests every code a test names as a format to
  // score, and these combinations of segment kinds have no matrix cell of their own.
  it('one level set and an even split of the rest is a level count', () => {
    const timed = { timed: true, minutes: 10 };
    const timedTiebreak = { ...timed, tiebreakFormat: { tiebreakTo: 7 } };
    const matchTiebreak = { tiebreakSet: { tiebreakTo: 10 } };
    // ordinary sets can close level, the deciding set cannot: level, side 1, side 2
    expect(parsedFormatCanEndTied({ bestOf: 3, setFormat: timed, finalSetFormat: matchTiebreak })).toEqual(true);
    expect(parsedFormatCanEndTied({ bestOf: 3, setFormat: timed, finalSetFormat: timedTiebreak })).toEqual(true);
    expect(parsedFormatCanEndTied({ exactly: 3, setFormat: timed, finalSetFormat: matchTiebreak })).toEqual(true);
    // every set decided
    expect(parsedFormatCanEndTied({ bestOf: 3, setFormat: timedTiebreak, finalSetFormat: matchTiebreak })).toEqual(
      false,
    );
    expect(parsedFormatCanEndTied({ exactly: 3, setFormat: timedTiebreak, finalSetFormat: timedTiebreak })).toEqual(
      false,
    );
  });

  it('an unparseable or absent format is not judged here', () => {
    expect(formatCanEndTied(undefined)).toEqual(false);
    expect(formatCanEndTied('nonsense')).toEqual(false);
  });
});

function setup(eventMatchUpFormat?: string) {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventName: 'E', participantsProfile: { participantsCount: 8 } }],
  });
  tournamentEngine.setState(tournamentRecord);
  const participantIds = tournamentEngine.getParticipants().participants.map(({ participantId }) => participantId);
  expect(tournamentEngine.addEventEntries({ eventId, participantIds }).success).toEqual(true);
  if (eventMatchUpFormat) {
    const result = tournamentEngine.setMatchUpFormat({ eventId, matchUpFormat: eventMatchUpFormat });
    expect(result.success).toEqual(true);
  }
  return eventId;
}

describe('draw generation refuses a format that can end level in an elimination draw', () => {
  it.each(['SET3-S:T10', 'SET2XA-S:T10', 'SET3A-S:TB11', 'HAL2X-S:TB11', 'T90'])('%s is refused', (matchUpFormat) => {
    const eventId = setup();
    for (const drawType of [SINGLE_ELIMINATION, ROUND_ROBIN_WITH_PLAYOFF]) {
      const result = tournamentEngine.generateDrawDefinition({ eventId, drawType, matchUpFormat });
      expect(result.error).toEqual(INVALID_VALUES);
      expect(result.info).toEqual(TIE_CAPABLE);
    }
  });

  it.each(['SET3-S:T10/TB7', 'SET3XA-S:T10-F:TB1', 'SET1-S:T10P/TB1'])('%s declares a decider', (matchUpFormat) => {
    const eventId = setup();
    const result = tournamentEngine.generateDrawDefinition({ eventId, drawType: SINGLE_ELIMINATION, matchUpFormat });
    expect(result.success).toEqual(true);
  });

  it('round robin allows a level result', () => {
    const eventId = setup();
    for (const matchUpFormat of ['SET3-S:T10', 'SET2XA-S:T10', 'HAL2X-S:TB11']) {
      const result = tournamentEngine.generateDrawDefinition({
        eventId,
        drawType: ROUND_ROBIN,
        drawSize: 8,
        matchUpFormat,
      });
      expect(result.success).toEqual(true);
    }
  });

  it('a draw inheriting the event format is judged by it', () => {
    const eventId = setup('SET3-S:T10');
    const result = tournamentEngine.generateDrawDefinition({ eventId, drawType: SINGLE_ELIMINATION });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.info).toEqual(TIE_CAPABLE);
    const roundRobin = tournamentEngine.generateDrawDefinition({ eventId, drawType: ROUND_ROBIN, drawSize: 8 });
    expect(roundRobin.success).toEqual(true);
  });
});

describe('a format change is refused; a stored draw is untouched', () => {
  it('setMatchUpFormat refuses the change in elimination and allows it in round robin', () => {
    const {
      tournamentRecord,
      drawIds: [eliminationDrawId, roundRobinDrawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        { drawSize: 8, drawType: SINGLE_ELIMINATION, matchUpFormat: 'SET3-S:T10/TB7' },
        { drawSize: 8, drawType: ROUND_ROBIN, matchUpFormat: 'SET3-S:T10/TB7' },
      ],
    });
    tournamentEngine.setState(tournamentRecord);

    let result: any = tournamentEngine.setMatchUpFormat({ drawId: eliminationDrawId, matchUpFormat: 'SET3-S:T10' });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.info).toEqual(TIE_CAPABLE);

    const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId: eliminationDrawId, inContext: true });
    result = tournamentEngine.setMatchUpFormat({
      drawId: eliminationDrawId,
      matchUpId: matchUps[0].matchUpId,
      structureId: matchUps[0].structureId,
      matchUpFormat: 'SET2XA-S:T10',
    });
    expect(result.error).toEqual(INVALID_VALUES);

    result = tournamentEngine.setMatchUpFormat({ drawId: roundRobinDrawId, matchUpFormat: 'SET3-S:T10' });
    expect(result.success).toEqual(true);
  });

  it('a stored elimination draw with an undecided format scores on, its own format re-submitted', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, drawType: SINGLE_ELIMINATION, matchUpFormat: 'SET3-S:T10/TB7' }],
    });
    // A draw stored before the guard was extended: its format can end level.
    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
    drawDefinition.matchUpFormat = 'SET3-S:T10';
    for (const structure of drawDefinition.structures) structure.matchUpFormat = undefined;
    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, matchUpFilters: { roundNumbers: [1] } });
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      matchUpFormat: 'SET3-S:T10',
      scoreString: '3-2 4-1',
      winningSide: 1,
    });
    const result = tournamentEngine.setMatchUpStatus({
      outcome: { ...outcome, matchUpFormat: 'SET3-S:T10' },
      matchUpId: matchUps[0].matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
    const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId: matchUps[0].matchUpId });
    expect(matchUp.matchUpStatus).toEqual(COMPLETED);
  });
});

describe('TEAM: the tieFormat decides the dual', () => {
  it('INTENNSE tieMatchUps may end level inside an elimination draw', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        { drawSize: 4, eventType: TEAM_EVENT, drawType: SINGLE_ELIMINATION, tieFormatName: INTENNSE_2026 },
      ],
    });
    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
    const tieMatchUp = matchUps.find((matchUp) => matchUp.collectionId && matchUp.matchUpFormat === 'SET2XA-S:T10');
    expect(tieMatchUp).toBeDefined();
    expect(formatCanEndTied('SET2XA-S:T10')).toEqual(true);

    for (const matchUpFormat of ['SET2XA-S:T10', 'SET1A-S:T10']) {
      const result = tournamentEngine.setMatchUpFormat({ drawId, matchUpId: tieMatchUp.matchUpId, matchUpFormat });
      expect(result.success).toEqual(true);
    }
  });
});
