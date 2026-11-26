import { playStalledChain, STALLED_CHAIN } from '@Tests/testHarness/exitPropagation/stalledChain';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { getOutcomePipeline, setOutcomePipeline } from '@Global/state/globalState';
import { afterEach, describe, expect, it } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants
import { ADAPTIVE, LUCKY_DRAW, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { COMPLETED, DOUBLE_DEFAULT, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

/**
 * A SEAT LEFT OPEN BEHIND A LUCKY DRAW'S DOUBLE EXIT IS NOT A STALL.
 *
 * In a lucky draw a double exit advances nobody; nothing is produced downstream. A lucky draw is exempt (the open seat
 * is the intended state, not a `STALLED_POSITION`), and ADAPTIVE draws follow the same rule (both are
 * `isLuckyBasedDraw`).
 *
 * The exemption is as narrow as the ruling. It covers the matchUps a lucky double exit feeds and what those feed in
 * turn while they hold no winner, in a lucky-based draw. The controls below hold the rest: the same record read as
 * any other draw type reports every one of those seats, and a lucky draw's open seat that no double exit left is
 * reported.
 *
 * Every case runs under each outcome pipeline: the draw is played by `setMatchUpStatus`, and what the detector reads
 * is what that pipeline left.
 */

const DRAW_ID = 'lucky-double-exit';
const MODES = [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const;
const DOUBLE_EXITS = [DOUBLE_WALKOVER, DOUBLE_DEFAULT];

const ambient = getOutcomePipeline();
afterEach(() => {
  setOutcomePipeline(ambient);
});

const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const byKey = (a: string, b: string) => a.localeCompare(b);
const matchUps = (): any[] => tournamentEngine.allDrawMatchUps({ inContext: true, drawId: DRAW_ID }).matchUps ?? [];
const at = (name: string) => matchUps().find((matchUp) => key(matchUp) === name);
const occupants = (matchUp: any) => (matchUp.sides ?? []).filter((side: any) => side?.participantId);

const findings = (structureId?: string): any[] =>
  tournamentEngine.getDrawInconsistencies({ drawId: DRAW_ID, structureId }).inconsistencies ?? [];

function stalledAt(structureId?: string): string[] {
  const all = matchUps();
  return findings(structureId)
    .filter((finding) => finding.issueType === STALLED_POSITION)
    .map((finding) => key(all.find((matchUp) => matchUp.matchUpId === finding.matchUpId)))
    .sort(byKey);
}

/** one participant, no winner, not itself a double exit: the shape the detector reports when nothing is playable */
const waitingAt = (): string[] =>
  matchUps()
    .filter(
      (matchUp) =>
        !matchUp.winningSide && occupants(matchUp).length === 1 && !DOUBLE_EXITS.includes(matchUp.matchUpStatus),
    )
    .filter((matchUp) => !(matchUp.sides ?? []).some((side: any) => side?.bye))
    .map(key)
    .sort(byKey);

/** every matchUp holding two participants and no result, played to side 1, until none is left */
function playOut() {
  for (let played = 1; played;) {
    played = 0;
    for (const matchUp of matchUps()) {
      if (matchUp.winningSide || occupants(matchUp).length !== 2) continue;
      if (matchUp.matchUpStatus && matchUp.matchUpStatus !== 'TO_BE_PLAYED') continue;
      const result: any = tournamentEngine.setMatchUpStatus({
        matchUpId: matchUp.matchUpId,
        outcome: { winningSide: 1 },
        drawId: DRAW_ID,
      });
      expect(result.success, key(matchUp)).toEqual(true);
      played += 1;
    }
  }
}

/** the draw, a double exit entered on `origin` before anything is played, then everything playable played */
function play(args: { drawType: string; drawSize: number; origin: string; matchUpStatus: string }) {
  const { drawType, drawSize, origin, matchUpStatus } = args;
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: DRAW_ID, drawSize, drawType }],
    setState: true,
    nonRandom: 1,
  });
  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: at(origin).matchUpId,
    outcome: { matchUpStatus },
    drawId: DRAW_ID,
  });
  expect(result.success).toEqual(true);
  playOut();
  expect(at(origin).matchUpStatus).toEqual(matchUpStatus);
  expect(at(origin).winningSide).toBeUndefined();
}

/** a change written onto the stored record, for a state no call leaves */
function rewriteStored(change: (drawDefinition: any) => void) {
  const { tournamentRecord } = tournamentEngine.getTournament();
  const drawDefinition = tournamentRecord.events
    .flatMap((event: any) => event.drawDefinitions ?? [])
    .find((candidate: any) => candidate.drawId === DRAW_ID);
  change(drawDefinition);
  tournamentEngine.setState(tournamentRecord);
}

const storedMatchUp = (drawDefinition: any, matchUpId: string) =>
  drawDefinition.structures
    .flatMap((structure: any) => structure.matchUps ?? [])
    .find((matchUp: any) => matchUp.matchUpId === matchUpId);

// LUCKY_DRAW 16: every round even, so the open seat is followed to the final
const LUCKY_16_WAITING = ['Main|2|1', 'Main|3|1', 'Main|4|1'];

// ADAPTIVE 16: the double exit sends no winner on in East and no loser into West, and each matchUp left waiting owes
// its own winner and loser seats in turn, across every structure
const ADAPTIVE_16_WAITING = [
  'East|2|1',
  'East|3|1',
  'East|4|1',
  'North|1|1',
  'North|2|1',
  'Northeast|1|1',
  'Northwest|1|1',
  'South|1|1',
  'South|2|1',
  'Southeast|1|1',
  'Southwest|1|1',
  'West|1|1',
  'West|2|1',
  'West|3|1',
].sort(byKey);

describe.each(MODES)('OUTCOME_PIPELINE=%s', (mode) => {
  describe.each(DOUBLE_EXITS)('a first-round %s', (matchUpStatus) => {
    it('LUCKY_DRAW 16: whoever waits behind it, up to the final, is not reported', () => {
      setOutcomePipeline(mode);
      play({ drawType: LUCKY_DRAW, drawSize: 16, origin: 'Main|1|1', matchUpStatus });

      expect(waitingAt()).toEqual(LUCKY_16_WAITING);
      expect(stalledAt()).toEqual([]);
      expect(tournamentEngine.getDrawInconsistencies({ drawId: DRAW_ID }).valid).toEqual(true);
    });

    it('LUCKY_DRAW 12: the double exit feeds a round of odd size, and whoever waits there is not reported', () => {
      setOutcomePipeline(mode);
      play({ drawType: LUCKY_DRAW, drawSize: 12, origin: 'Main|1|1', matchUpStatus });

      // the round of three is never complete, so nobody is chosen to go on from it and round 3 holds nobody
      expect(waitingAt()).toEqual(['Main|2|1']);
      expect(stalledAt()).toEqual([]);
      expect(tournamentEngine.getDrawInconsistencies({ drawId: DRAW_ID }).valid).toEqual(true);
    });

    it('ADAPTIVE 16: the winner seat and the loser seat it leaves open, in every structure, are not reported', () => {
      setOutcomePipeline(mode);
      play({ drawType: ADAPTIVE, drawSize: 16, origin: 'East|1|1', matchUpStatus });

      expect(waitingAt()).toEqual(ADAPTIVE_16_WAITING);
      expect(stalledAt()).toEqual([]);
      expect(tournamentEngine.getDrawInconsistencies({ drawId: DRAW_ID }).valid).toEqual(true);
      // asked of one structure, as TMX's draw audit asks
      expect(stalledAt(at('West|1|1').structureId)).toEqual([]);
    });

    // CONTROL: the exemption is the draw type's. The record the lucky draw left, read as any other draw type, reports
    // every seat the lucky draw is excused
    it('CONTROL: the same record read as a SINGLE_ELIMINATION draw reports every one of those seats', () => {
      setOutcomePipeline(mode);
      play({ drawType: LUCKY_DRAW, drawSize: 16, origin: 'Main|1|1', matchUpStatus });
      expect(stalledAt()).toEqual([]);

      rewriteStored((drawDefinition) => (drawDefinition.drawType = SINGLE_ELIMINATION));
      expect(stalledAt()).toEqual(LUCKY_16_WAITING);
      expect(tournamentEngine.getDrawInconsistencies({ drawId: DRAW_ID }).valid).toEqual(false);
    });

    it('CONTROL: the same record read as a draw that is not ADAPTIVE reports every one of those seats', () => {
      setOutcomePipeline(mode);
      play({ drawType: ADAPTIVE, drawSize: 16, origin: 'East|1|1', matchUpStatus });
      expect(stalledAt()).toEqual([]);

      rewriteStored((drawDefinition) => (drawDefinition.drawType = SINGLE_ELIMINATION));
      expect(stalledAt()).toEqual(ADAPTIVE_16_WAITING);
    });

    // CONTROL: the open seats are excused by the double exit, not by the draw being lucky. With the double exit
    // rewritten as a result whose winner was never sent on, the same seats are open and no double exit left them so
    it('CONTROL: a lucky draw whose open seats no double exit left reports them', () => {
      setOutcomePipeline(mode);
      play({ drawType: LUCKY_DRAW, drawSize: 16, origin: 'Main|1|1', matchUpStatus });
      const { matchUpId } = at('Main|1|1');

      rewriteStored((drawDefinition) => {
        const stored = storedMatchUp(drawDefinition, matchUpId);
        stored.matchUpStatus = COMPLETED;
        stored.winningSide = 1;
      });
      expect(waitingAt()).toEqual(LUCKY_16_WAITING);
      expect(stalledAt()).toEqual(LUCKY_16_WAITING);
    });

    // CONTROL: a matchUp holding a winner ends the walk. `Main|2|1` given a winner who was never sent on: the seat open
    // in `Main|3|1` is owed by that result, not by the double exit, and it and what it feeds are reported
    it('CONTROL: past a matchUp that holds a winner, an open seat in a lucky draw is reported', () => {
      setOutcomePipeline(mode);
      play({ drawType: LUCKY_DRAW, drawSize: 16, origin: 'Main|1|1', matchUpStatus });
      const waiting = at('Main|2|1');

      rewriteStored((drawDefinition) => {
        const stored = storedMatchUp(drawDefinition, waiting.matchUpId);
        stored.matchUpStatus = COMPLETED;
        stored.winningSide = occupants(waiting)[0].sideNumber;
      });
      expect(stalledAt()).toEqual(['Main|3|1', 'Main|4|1']);
    });
  });

  // CONTROL: a draw that is not lucky, with a seat left open behind a double exit, is reported as ever
  it('CONTROL: a SINGLE_ELIMINATION draw reports the seats left open behind a double exit', () => {
    setOutcomePipeline(mode);
    playStalledChain(DRAW_ID);
    expect(stalledAt()).toEqual(STALLED_CHAIN);

    // and the same record read as a lucky draw does not
    rewriteStored((drawDefinition) => (drawDefinition.drawType = LUCKY_DRAW));
    expect(stalledAt()).toEqual([]);
  });
});
