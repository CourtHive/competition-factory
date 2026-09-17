import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import {
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  DOUBLE_ELIMINATION,
  SINGLE_ELIMINATION,
  CURTIS_CONSOLATION,
  COMPASS,
} from '@Constants/drawDefinitionConstants';

/**
 * A matchUp's hydrated sides depend on WHICH drawPositions it holds, never on HOW the array says so.
 *
 * `drawPositions` is positional, and the engine represents the same occupancy several ways depending
 * on which writer last touched it: `[5]`, `[5, undefined]`, `[undefined, 5]`, `[]`,
 * `[undefined, undefined]` and an absent key all occur. Those are five spellings of at most two
 * facts. Every one of them must hydrate to the same sides, because a consumer reads the sides and
 * has no idea which writer ran.
 *
 * ## Why this exists: they did not all agree
 *
 * `getOrderedDrawPositions` branched on `allNumeric(drawPositions)`, which is TRUE for a
 * one-element array — so a COMPACTED lone position never reached the feed-round branch below it and
 * fell through to the roundProfile pairing instead. The function's own DO NOT CHANGE banner says
 * *"when only one side is present in a feedRound, it is the fed position and fed positions are
 * always { sideNumber: 1 }"*, and the compacted spelling was the one that disobeyed it.
 *
 * Measured live, replaying both frozen census windows on both propagation arms — no hand-editing,
 * 2,400 seed-runs:
 *
 * | stored form | feed round | side 1 | side 2 |
 * |---|---|---:|---:|
 * | `[N]` compacted | FEED | 156,459 | **277** |
 * | `[N, null]` | FEED | 3,386 | 0 |
 *
 * 277 feed-round matchUps put their lone position on the wrong side, and which spelling they
 * carried was decided by which writer removed the other position: `removeSubsequentRoundsParticipant`
 * compacts, `releaseAdvancedDrawPosition` and `positionClear` leave the hole.
 *
 * ## The fixture is built by REMOVAL, because that is the only way to reach the state
 *
 * A generated draw never carries a lone position on a feed round that resolves wrongly — measured:
 * 98 of 98 across 60 generated draws are side 1. The disagreement only appears once a matchUp that
 * held two positions has had one taken away, which is what the mutation path does. So the test
 * rewrites ONE matchUp per reading — never several, because `roundProfile` is DERIVED from the
 * matchUps and editing them in bulk measures your own edit.
 */

function collectStructures(structures: any[], collected: any[] = []): any[] {
  for (const structure of structures ?? []) {
    collected.push(structure);
    if (structure.structures?.length) collectStructures(structure.structures, collected);
  }
  return collected;
}

type Candidate = {
  structureName: string;
  roundNumber: number;
  roundPosition: number;
  positions: number[];
  priorRoundPositions: number[];
};

/** the spellings of "this matchUp holds exactly these real positions" */
function spellings(positions: number[]): any[] {
  if (!positions.length) return [[], [undefined], [undefined, undefined], 'ABSENT'];
  if (positions.length === 1) {
    const [only] = positions;
    return [[only], [only, undefined], [undefined, only]];
  }
  const [low, high] = positions;
  return [
    [low, high],
    [high, low],
  ];
}

type Reading = {
  sideOf: (position: number) => number | undefined;
  spelling: string;
  feedRound: boolean;
  sides: string;
};

/** every stored matchUp beyond round 1 holding two real positions, with its prior round's positions */
function twoPositionCandidates(drawDefinition: any): Candidate[] {
  const candidates: Candidate[] = [];
  for (const structure of collectStructures(drawDefinition.structures)) {
    for (const matchUp of structure.matchUps ?? []) {
      const positions = (matchUp.drawPositions ?? []).filter(Boolean);
      if (matchUp.roundNumber < 2 || positions.length !== 2) continue;
      candidates.push({
        structureName: structure.structureName,
        roundNumber: matchUp.roundNumber,
        roundPosition: matchUp.roundPosition,
        positions: [...positions].sort((a: number, b: number) => a - b),
        priorRoundPositions: (structure.matchUps ?? [])
          .filter((prior: any) => prior.roundNumber === matchUp.roundNumber - 1)
          .flatMap((prior: any) => prior.drawPositions ?? [])
          .filter(Boolean) as number[],
      });
    }
  }
  return candidates;
}

function findStoredMatchUp(drawDefinition: any, candidate: Candidate): any {
  for (const structure of collectStructures(drawDefinition.structures)) {
    if (structure.structureName !== candidate.structureName) continue;
    for (const matchUp of structure.matchUps ?? []) {
      if (matchUp.roundNumber === candidate.roundNumber && matchUp.roundPosition === candidate.roundPosition) {
        return matchUp;
      }
    }
  }
  return undefined;
}

/** PROPERTY ONE — every spelling of the same occupancy hydrates identically */
function spellingsDisagree(anchor: string, positions: number[], readings: Reading[]): string[] {
  if (new Set(readings.map((reading) => reading.sides)).size <= 1) return [];
  return [
    `${anchor} holding ${JSON.stringify(positions)}: ` +
      readings.map((reading) => `${reading.spelling} -> [${reading.sides}]`).join('  |  '),
  ];
}

/**
 * PROPERTY TWO — and the side they agree on is the RIGHT one.
 *
 * On a feed round a lone position is on side 2 if it ADVANCED here (it appears in the prior round of
 * this structure) and side 1 if it was FED. Agreement alone would be satisfied by all three
 * spellings being wrong together, so this is what stops the test passing vacuously.
 */
function sideIsWrong(anchor: string, positions: number[], readings: Reading[], candidate: Candidate): string[] {
  if (positions.length !== 1 || !readings[0]?.feedRound) return [];
  const [only] = positions;
  const expected = candidate.priorRoundPositions.includes(only) ? 2 : 1;
  const role = expected === 2 ? 'ADVANCED' : 'FED';
  return readings
    .filter((reading) => reading.sideOf(only) !== expected)
    .map(
      (reading) =>
        `${anchor} holding [${only}] (${role}, prior round ${JSON.stringify(candidate.priorRoundPositions)}): ` +
        `${reading.spelling} put it on side ${reading.sideOf(only) ?? 'NONE'}, expected ${expected}`,
    );
}

it.each([
  { drawType: DOUBLE_ELIMINATION, drawSize: 16, participantsCount: 16 },
  { drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8, participantsCount: 7 },
  { drawType: CURTIS_CONSOLATION, drawSize: 32, participantsCount: 29 },
  { drawType: FEED_IN_CHAMPIONSHIP_TO_SF, drawSize: 16, participantsCount: 16 },
  { drawType: MODIFIED_FEED_IN_CHAMPIONSHIP, drawSize: 16, participantsCount: 16 },
  { drawType: SINGLE_ELIMINATION, drawSize: 16, participantsCount: 16 },
  { drawType: COMPASS, drawSize: 16, participantsCount: 16 },
])('$drawType $drawSize/$participantsCount: sides never depend on the spelling', (profile) => {
  const drawId = 'representation';
  const { tournamentRecord: base }: any = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ ...profile, drawId }],
    completeAllMatchUps: true,
    nonRandom: 1,
  });

  const baseDraw = base.events[0].drawDefinitions.find((draw: any) => draw.drawId === drawId);
  const candidates = twoPositionCandidates(baseDraw);

  // control: a draw with no two-position matchUps beyond round 1 would make everything below vacuous
  expect(candidates.length).toBeGreaterThan(0);

  /** rewrite ONE matchUp to this spelling and report its hydrated sides */
  const sidesFor = (candidate: Candidate, drawPositions: any): string => {
    const record = structuredClone(base);
    const drawDefinition = record.events[0].drawDefinitions.find((draw: any) => draw.drawId === drawId);
    const target = findStoredMatchUp(drawDefinition, candidate);
    expect(target).toBeDefined(); // control: the single edit landed where it was aimed

    if (drawPositions === 'ABSENT') delete target.drawPositions;
    else target.drawPositions = drawPositions;
    target.matchUpStatus = TO_BE_PLAYED;
    target.winningSide = undefined;
    target.score = undefined;

    tournamentEngine.setState(record);
    const { matchUps } = tournamentEngine.allDrawMatchUps({ inContext: true, drawId });
    const hydrated = (matchUps ?? []).find(
      (matchUp: any) =>
        matchUp.structureName === candidate.structureName &&
        matchUp.roundNumber === candidate.roundNumber &&
        matchUp.roundPosition === candidate.roundPosition,
    );
    return {
      sides: (hydrated?.sides ?? []).map((side: any) => `${side?.sideNumber}=${side?.drawPosition ?? '-'}`).join(','),
      sideOf: (position: number) =>
        (hydrated?.sides ?? []).find((side: any) => side?.drawPosition === position)?.sideNumber,
      feedRound: !!hydrated?.feedRound,
    };
  };

  const offences: string[] = [];
  let compared = 0;

  for (const candidate of candidates) {
    const [low, high] = candidate.positions;
    for (const positions of [[], [low], [high], [low, high]]) {
      const readings = spellings(positions).map((spelling) => {
        const reading = sidesFor(candidate, spelling);
        return { spelling: spelling === 'ABSENT' ? 'ABSENT' : JSON.stringify(spelling), ...reading };
      });
      compared++;
      const anchor = `${candidate.structureName}|${candidate.roundNumber}|${candidate.roundPosition}`;

      offences.push(...spellingsDisagree(anchor, positions, readings));
      offences.push(...sideIsWrong(anchor, positions, readings, candidate));
    }
  }

  expect(compared).toBeGreaterThan(0);
  expect(offences).toEqual([]);
});
