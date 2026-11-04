import { formatCanEndTied, parsedFormatCanEndTied } from '@Validators/tiedFormatCompatibility';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { FEED_IN_CHAMPIONSHIP, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { INTENNSE_2026 } from '@Constants/tieFormatConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

// Scoring-engine spec § 9.7 rule 4 (CA 2026-10-18: "yes, extend the check"): a timed, aggregate or
// exactly-N format that declares no decider can end COMPLETED with no winner. Where a structure advances
// a winner, that level result needs a decision made outside the score (CA 2026-11-04).
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

// Standings phase 2 § 1.1 (CA 2026-11-04, "allow, decider required"): an elimination structure accepts a format that
// can end level. A level result there names its winner and how it was decided, and is refused without one
// (`decidedResults.test.ts`), so generation and a format change no longer refuse the format itself.
describe('elimination accepts a format that can end level', () => {
  it.each(['SET3-S:T10', 'SET2XA-S:T10', 'SET3A-S:TB11', 'HAL2X-S:TB11', 'T90'])('%s is accepted', (matchUpFormat) => {
    const eventId = setup();
    for (const drawType of [SINGLE_ELIMINATION, FEED_IN_CHAMPIONSHIP]) {
      const result = tournamentEngine.generateDrawDefinition({ eventId, drawType, matchUpFormat });
      expect(result.success).toEqual(true);
    }
  });

  it('a draw inheriting the event format is generated with it', () => {
    const eventId = setup('SET3-S:T10');
    const result = tournamentEngine.generateDrawDefinition({ eventId, drawType: SINGLE_ELIMINATION });
    expect(result.success).toEqual(true);
    expect(result.drawDefinition.matchUpFormat ?? tournamentEngine.getEvent({ eventId }).event.matchUpFormat).toEqual(
      'SET3-S:T10',
    );
  });

  it('setMatchUpFormat changes an elimination draw, or one of its matchUps, to a format that can end level', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION, matchUpFormat: 'SET3-S:T10/TB7' }],
    });
    tournamentEngine.setState(tournamentRecord);

    let result: any = tournamentEngine.setMatchUpFormat({ drawId, matchUpFormat: 'SET3-S:T10' });
    expect(result.success).toEqual(true);

    const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
    result = tournamentEngine.setMatchUpFormat({
      drawId,
      matchUpId: matchUps[0].matchUpId,
      structureId: matchUps[0].structureId,
      matchUpFormat: 'SET2XA-S:T10',
    });
    expect(result.success).toEqual(true);
    expect(tournamentEngine.findMatchUp({ drawId, matchUpId: matchUps[0].matchUpId }).matchUp.matchUpFormat).toEqual(
      'SET2XA-S:T10',
    );
  });

  it('a decided format still scores a winner on', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, drawType: SINGLE_ELIMINATION, matchUpFormat: 'SET3-S:T10' }],
    });
    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, matchUpFilters: { roundNumbers: [1] } });
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      matchUpFormat: 'SET3-S:T10',
      scoreString: '3-2 4-1',
      winningSide: 1,
    });
    const result = tournamentEngine.setMatchUpStatus({ outcome, matchUpId: matchUps[0].matchUpId, drawId });
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
