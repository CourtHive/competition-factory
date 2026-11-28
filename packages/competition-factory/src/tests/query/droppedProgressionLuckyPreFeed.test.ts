import { DROPPED_PROGRESSION } from '@Query/drawDefinition/getDrawInconsistencies';
import { getOutcomePipeline, setOutcomePipeline } from '@Tests/testHarness/outcomeModes';
import { afterEach, describe, expect, it } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants
import { ADAPTIVE, COMPASS } from '@Constants/drawDefinitionConstants';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Tests/testHarness/outcomeModes';

/**
 * A LOSER WAITING FOR A LUCKY ROUND'S ADVANCEMENT IS NOT A DROPPED PROGRESSION.
 *
 * In a lucky-based draw (LUCKY_DRAW, ADAPTIVE) a round of odd size sends nobody on by its results: its winners and its
 * losers wait for `luckyDrawAdvancement`, which sends the winners and the lucky loser chosen on in the source
 * structure, and places in the linked structure only the losers it discards. `getDrawInconsistencies` read the LOSER
 * link alone, so every loser of such a round was reported `DROPPED_PROGRESSION` from the moment its result was entered,
 * and the lucky loser for good. Found 2026-11-17 on ADAPTIVE 12 played out with no double exit.
 *
 * The exemption is as narrow as the rule. The controls hold the rest: the same record read as another draw type
 * reports every one of those losers, and a loser the advancement discarded who is not in the linked structure is
 * reported.
 *
 * Every case runs under each outcome pipeline: the draw is played by `setMatchUpStatus`, and what the detector reads
 * is what that pipeline left.
 */

const DRAW_ID = 'lucky-pre-feed';
const MODES = [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const;

const ambient = getOutcomePipeline();
afterEach(() => {
  setOutcomePipeline(ambient);
});

const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const matchUps = (): any[] => tournamentEngine.allDrawMatchUps({ inContext: true, drawId: DRAW_ID }).matchUps ?? [];
const occupants = (matchUp: any) => (matchUp.sides ?? []).filter((side: any) => side?.participantId);
const findings = (): any[] => tournamentEngine.getDrawInconsistencies({ drawId: DRAW_ID }).inconsistencies ?? [];

/** the matchUps reported `DROPPED_PROGRESSION`, as `structure|round|position`, sorted */
function droppedAt(): string[] {
  const all = matchUps();
  return findings()
    .filter((finding) => finding.issueType === DROPPED_PROGRESSION)
    .map((finding) => key(all.find((matchUp) => matchUp.matchUpId === finding.matchUpId)))
    .sort((a, b) => a.localeCompare(b));
}

function generate(drawSize: number) {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: DRAW_ID, drawSize, drawType: ADAPTIVE }],
    setState: true,
    nonRandom: 1,
  });
}

/** every matchUp holding two participants and no result, played to side 1; nothing is reported after any of them */
function playOut(expectNoneDropped = true): number {
  let total = 0;
  for (let played = 1; played;) {
    played = 0;
    for (const matchUp of matchUps()) {
      if (matchUp.winningSide || occupants(matchUp).length !== 2) continue;
      if (matchUp.matchUpStatus && matchUp.matchUpStatus !== TO_BE_PLAYED) continue;
      const result: any = tournamentEngine.setMatchUpStatus({
        matchUpId: matchUp.matchUpId,
        outcome: { winningSide: 1 },
        drawId: DRAW_ID,
      });
      expect(result.success, key(matchUp)).toEqual(true);
      if (expectNoneDropped) expect(droppedAt(), `after ${key(matchUp)}`).toEqual([]);
      played += 1;
    }
    total += played;
  }
  return total;
}

type Advanced = { structureId: string; structureName: string; roundNumber: number; luckyLoserId: string };

/** the first complete round of odd size that has not sent anybody on is advanced, its first eligible loser chosen */
function advanceOne(): Advanced | undefined {
  const { drawDefinition } = tournamentEngine.getEvent({ drawId: DRAW_ID });
  for (const structure of drawDefinition.structures) {
    const { structureId, structureName } = structure;
    const status: any = tournamentEngine.getLuckyDrawRoundStatus({ drawId: DRAW_ID, structureId });
    for (const round of status.rounds ?? []) {
      const luckyLoserId = round.needsLuckySelection && round.eligibleLosers?.[0]?.participantId;
      if (!luckyLoserId) continue;
      const result: any = tournamentEngine.luckyDrawAdvancement({
        roundNumber: round.roundNumber,
        participantId: luckyLoserId,
        drawId: DRAW_ID,
        structureId,
      });
      expect(result.success, `${structureName} round ${round.roundNumber}`).toEqual(true);
      return { structureId, structureName, roundNumber: round.roundNumber, luckyLoserId };
    }
  }
  return undefined;
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

const losersOf = (structureName: string, roundNumber: number): string[] =>
  matchUps()
    .filter((matchUp) => matchUp.structureName === structureName && matchUp.roundNumber === roundNumber)
    .map((matchUp) => matchUp.sides.find((side: any) => side.sideNumber !== matchUp.winningSide)?.participantId);

const heldIn = (structureId: string): string[] =>
  matchUps()
    .filter((matchUp) => matchUp.structureId === structureId)
    .flatMap((matchUp) => occupants(matchUp).map((side: any) => side.participantId));

describe.each(MODES)('OUTCOME_PIPELINE=%s', (mode) => {
  // 6, 10 and 14 open on a round of odd size; 12's rounds of three are East's second and West's first
  it.each([6, 10, 12, 14])('ADAPTIVE %i: played out and advanced, no loser is ever reported dropped', (drawSize) => {
    setOutcomePipeline(mode);
    generate(drawSize);

    let advancements = 0;
    let played = playOut();
    while (played) {
      const advanced = advanceOne();
      if (!advanced) break;
      advancements += 1;
      // the lucky loser went on in the structure they lost in; the losers discarded stand in the linked structure
      expect(droppedAt(), `after advancing ${advanced.structureName} ${advanced.roundNumber}`).toEqual([]);
      expect(heldIn(advanced.structureId).filter((id) => id === advanced.luckyLoserId).length).toBeGreaterThan(1);
      played = playOut();
    }

    expect(advancements).toBeGreaterThan(0);
    expect(droppedAt()).toEqual([]);
    expect(tournamentEngine.getDrawInconsistencies({ drawId: DRAW_ID }).valid).toEqual(true);
  });

  // CONTROL: the exemption is the draw type's. The record a round of odd size left before its advancement, read as
  // any other draw type, reports every loser of that round
  it('CONTROL: the same record read as a draw that is not lucky-based reports every loser of the round', () => {
    setOutcomePipeline(mode);
    generate(6);
    playOut();
    expect(droppedAt()).toEqual([]);

    rewriteStored((drawDefinition) => (drawDefinition.drawType = COMPASS));
    expect(droppedAt()).toEqual(['East|1|1', 'East|1|2', 'East|1|3']);
    expect(tournamentEngine.getDrawInconsistencies({ drawId: DRAW_ID }).valid).toEqual(false);
  });

  // CONTROL: once the round has sent its winners on, a loser who neither went on with them nor stands in the linked
  // structure was dropped, and is reported
  it('CONTROL: a discarded loser taken out of the linked structure after the advancement is reported', () => {
    setOutcomePipeline(mode);
    generate(6);
    playOut();
    const advanced = advanceOne();
    expect(advanced?.structureName).toEqual('East');
    expect(droppedAt()).toEqual([]);

    const discarded = losersOf('East', 1).filter((participantId) => participantId !== advanced?.luckyLoserId);
    expect(discarded.length).toEqual(2);
    rewriteStored((drawDefinition) => {
      for (const structure of drawDefinition.structures) {
        if (structure.structureId === advanced?.structureId) continue;
        for (const assignment of structure.positionAssignments ?? [])
          if (assignment.participantId === discarded[0]) delete assignment.participantId;
      }
    });
    const dropped = findings().filter((finding) => finding.issueType === DROPPED_PROGRESSION);
    expect(dropped.map((finding) => finding.participantId)).toEqual([discarded[0]]);
  });
});
