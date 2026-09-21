import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_ELIMINATION, FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';

/**
 * A FEED ROUND and a round that RESERVES a fed drawPosition are two different facts, and the engine
 * had only one flag for both.
 *
 * `feedRound` is inferred from matchUpsCount equality, because a round pairing an arrival with an
 * advancer does not halve. As a SIDE-ORDERING fact that inference is right everywhere, including
 * `DOUBLE_ELIMINATION`'s Main final: the Backdraw winner arriving over the link takes side 1 and the
 * undefeated main-bracket winner sits on side 2.
 *
 * As a RESERVED-SLOT fact it is wrong there, and only there. Main is generated as a feed-in of
 * `drawSize + 1` with `linkFedFinishingRoundNumbers: [1]`; link-fed positions are subtracted from the
 * local allocation, so the extra matchUp exists and the extra drawPosition does not, and the Backdraw
 * winner returns at whichever Main drawPosition they already held. See
 * `documentation/docs/concepts/draw-positions.md` § 4a. `getSide` nonetheless published an empty side
 * 1 as `participantFed` for a slot that does not exist, and `doubleExitAdvancement` read that back as
 * half of a live decision.
 *
 * `hasFedDrawPosition` is the reserved-slot fact, derived by excluding rounds a WINNER link targets.
 */

const isPosition = (drawPosition: any) => drawPosition !== undefined && drawPosition !== null;

const DRAW_TYPES = [
  'SINGLE_ELIMINATION',
  'DOUBLE_ELIMINATION',
  'FIRST_MATCH_LOSER_CONSOLATION',
  'FIRST_ROUND_LOSER_CONSOLATION',
  'MODIFIED_FEED_IN_CHAMPIONSHIP',
  'FEED_IN_CHAMPIONSHIP_TO_SF',
  'FEED_IN_CHAMPIONSHIP_TO_QF',
  'FEED_IN_CHAMPIONSHIP_TO_R16',
  'FEED_IN_CHAMPIONSHIP',
  'CURTIS_CONSOLATION',
  'FEED_IN',
  'COMPASS',
  'OLYMPIC',
  'ROUND_ROBIN_WITH_PLAYOFF',
  'PAGE_PLAYOFF',
  'PLAYOFF',
];

// 6, 12, 24 and 48 matter: they are where FEED_IN reserves feed slots fed from the draw's own
// ENTRIES, in a structure that has no links at all. A link-derived answer misses exactly those.
const DRAW_SIZES = [4, 6, 8, 12, 16, 24, 32, 48];

type Round = { label: string; hasFedDrawPosition: boolean; feedRound: boolean; slots: boolean; held: boolean[] };

function surveyRounds(): Round[] {
  const rounds: Round[] = [];
  let drawIndex = 0;

  for (const drawType of DRAW_TYPES) {
    for (const drawSize of DRAW_SIZES) {
      setSubscriptions({});
      const drawId = `fed-reservation-${drawIndex++}`;
      try {
        // participantsCount === drawSize on purpose: with no BYES nothing has advanced at
        // generation, so a drawPosition held in a round > 1 IS a reserved feed slot. With BYES the
        // two are indistinguishable — see the homogeneity control below, which relies on that.
        const { drawIds } = mocksEngine.generateTournamentRecord({
          drawProfiles: [{ participantsCount: drawSize, drawSize, drawType, drawId }],
          nonRandom: 500000 + drawIndex,
          setState: true,
        });
        if (!drawIds?.includes(drawId)) continue;
      } catch {
        continue; // a draw type that cannot be generated at this size contributes nothing
      }

      const { drawDefinition } = tournamentEngine.getEvent({ drawId });
      const { matchUps } = tournamentEngine.allDrawMatchUps({ inContext: true, drawId });

      for (const structure of drawDefinition.structures ?? []) {
        const structureMatchUps = (matchUps ?? []).filter(
          (matchUp: any) => matchUp.structureId === structure.structureId && !matchUp.matchUpTieId,
        );
        const roundNumbers = [...new Set(structureMatchUps.map((matchUp: any) => matchUp.roundNumber))].filter(
          (roundNumber: any) => roundNumber > 1,
        );

        for (const roundNumber of roundNumbers) {
          const roundMatchUps = structureMatchUps.filter((matchUp: any) => matchUp.roundNumber === roundNumber);
          const held = roundMatchUps.map((matchUp: any) => !!(matchUp.drawPositions ?? []).filter(isPosition).length);
          rounds.push({
            label: `${drawType}/${drawSize} ${structure.structureName}|r${roundNumber}`,
            hasFedDrawPosition: !!roundMatchUps[0]?.hasFedDrawPosition,
            feedRound: !!roundMatchUps[0]?.feedRound,
            slots: held.some(Boolean),
            held,
          });
        }
      }
    }
  }
  return rounds;
}

it('hasFedDrawPosition names every round that reserves a fed drawPosition, and no other', () => {
  const rounds = surveyRounds();

  // CONTROLS. A survey that generated nothing, or that found no reserving round and no
  // non-reserving round, would satisfy the assertions below vacuously.
  expect(rounds.length).toBeGreaterThan(300);
  expect(rounds.filter((round) => round.slots).length).toBeGreaterThan(30);
  expect(rounds.filter((round) => !round.slots).length).toBeGreaterThan(50);

  const wrong = rounds.filter((round) => round.hasFedDrawPosition !== round.slots);
  expect(wrong.map((round) => `${round.label} hasFedDrawPosition=${round.hasFedDrawPosition}`)).toEqual([]);

  // The rounds `feedRound` gets wrong as a reserved-slot answer are a POSITIVE CONTROL for the
  // discriminator: without them the two flags would be indistinguishable and this file would be
  // asserting nothing. Every one is a DOUBLE_ELIMINATION Main final, and each says `feedRound=true`
  // over a round that reserves nothing — the direction matters, so it is asserted rather than just
  // the count.
  const feedRoundWrong = rounds.filter((round) => round.feedRound !== round.slots);
  expect(feedRoundWrong.length).toBeGreaterThan(0);
  expect(
    feedRoundWrong.filter(
      (round) => !(round.label.startsWith('DOUBLE_ELIMINATION') && round.label.includes('Main|r') && round.feedRound),
    ),
  ).toEqual([]);

  // And it is a ROUND fact, not a per-matchUp one: no round reserves a slot for some of its
  // matchUps and not others. (Measured 2026-09-18 over this survey; the same measurement over draws
  // WITH byes reports 337 heterogeneous matchUps, because a round-1 bye advances a participant into
  // round 2 at generation — which is why this survey is byeless.)
  const heterogeneous = rounds.filter((round) => new Set(round.held).size > 1);
  expect(heterogeneous.map((round) => round.label)).toEqual([]);
});

it('marks a reserved feed slot participantFed, and the DE Main final not at all', () => {
  setSubscriptions({});
  const drawId = 'fed-reservation-marks';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount: 8, drawSize: 8, drawType: DOUBLE_ELIMINATION, drawId }],
    nonRandom: 1,
    setState: true,
  });
  const { matchUps } = tournamentEngine.allDrawMatchUps({ inContext: true, drawId });
  const find = (structureName: string, roundNumber: number, roundPosition: number): any =>
    matchUps.find(
      (matchUp: any) =>
        matchUp.structureName === structureName &&
        matchUp.roundNumber === roundNumber &&
        matchUp.roundPosition === roundPosition,
    );

  // A genuine feed round: the Backdraw's round 2 receives Main round-2 losers at a reserved slot.
  const backdrawFeed = find('Backdraw', 2, 1);
  expect(backdrawFeed.feedRound).toEqual(true);
  expect(backdrawFeed.hasFedDrawPosition).toEqual(true);
  expect(backdrawFeed.sides[0].participantFed).toEqual(true);
  expect(backdrawFeed.sides[1].participantAdvanced).toEqual(true);

  // The Main final orders its sides the same way and reserves nothing.
  const mainFinal = find('Main', 4, 1);
  expect(mainFinal.feedRound).toEqual(true);
  expect(mainFinal.hasFedDrawPosition).toEqual(false);
  expect(mainFinal.sides.some((side: any) => side.participantFed || side.participantAdvanced)).toEqual(false);
});

it('marks a consolation feed round, which has a reserved slot at every round it is fed', () => {
  setSubscriptions({});
  const drawId = 'fed-reservation-fic';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount: 16, drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP, drawId }],
    nonRandom: 1,
    setState: true,
  });
  const { matchUps } = tournamentEngine.allDrawMatchUps({ inContext: true, drawId });
  const consolationFeedRounds = matchUps.filter(
    (matchUp: any) => matchUp.structureName === 'Consolation' && matchUp.feedRound,
  );

  expect(consolationFeedRounds.length).toBeGreaterThan(0);
  expect(consolationFeedRounds.every((matchUp: any) => matchUp.hasFedDrawPosition)).toEqual(true);
  expect(consolationFeedRounds.every((matchUp: any) => matchUp.sides[0].participantFed)).toEqual(true);
});
