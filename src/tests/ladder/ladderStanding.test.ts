import { expect, test, describe } from 'vitest';

import { getLadderStanding } from '@Query/ladder/getLadderStanding';

import { DYNAMIC, RATING as RATING_SCALE, SCALE } from '@Constants/scaleConstants';
import { POLICY_TYPE_LADDER } from '@Constants/policyConstants';
import { LADDER } from '@Constants/drawDefinitionConstants';
import { ELO, UTR, WTN } from '@Constants/ratingConstants';
import { RANK, RATING } from '@Constants/ladderConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';

// A scale item lives on the participant as a timeItem keyed
// `SCALE.<scaleType>.<eventType>.<scaleName>` — see participantScaleItem.
const scaleTimeItem = (scaleName: string, itemValue: any) => ({
  itemType: `${SCALE}.${RATING_SCALE}.${SINGLES_EVENT}.${scaleName}`,
  itemValue,
});

const rated = (participantId: string, scaleName: string, scaleValue: any) => ({
  participantId,
  participantType: 'INDIVIDUAL',
  timeItems: [scaleTimeItem(scaleName, scaleValue)],
});

const ratedBoth = (participantId: string, published: number, dynamic: number) => ({
  participantId,
  participantType: 'INDIVIDUAL',
  timeItems: [scaleTimeItem(ELO, published), scaleTimeItem(`${ELO}.${DYNAMIC}`, dynamic)],
});

// Stored positions are DELIBERATELY the reverse of merit, so a derived standing cannot accidentally
// match by echoing what was already there.
const setup = ({ policy, participants }: any) => {
  const structure: any = {
    structureId: 's1',
    positionAssignments: participants.map((p: any, i: number) => ({
      drawPosition: i + 1,
      participantId: p.participantId,
    })),
  };
  const drawDefinition: any = {
    drawId: 'd1',
    drawType: LADDER,
    structures: [structure],
    extensions: [{ name: 'appliedPolicies', value: { [POLICY_TYPE_LADDER]: policy } }],
  };
  return { drawDefinition, structure, tournamentRecord: { participants } };
};

const order = (standing: any[]) => standing.map((s) => s.participantId);

describe('RANK ordering returns the stored standing', () => {
  test('positionAssignments as maintained by the movement rules', () => {
    const params = setup({
      policy: { ordering: RANK },
      participants: [rated('a', UTR, 5), rated('b', UTR, 9)],
    });
    expect(order(getLadderStanding(params))).toEqual(['a', 'b']);
  });
});

describe('RATING ordering reads the DIRECTION rather than assuming it', () => {
  test('UTR is higher-is-better, so the biggest rating is rank 1', () => {
    const params = setup({
      policy: { ordering: RATING, ratingType: UTR },
      participants: [rated('low', UTR, 4.2), rated('mid', UTR, 8.1), rated('high', UTR, 12.5)],
    });
    expect(order(getLadderStanding(params))).toEqual(['high', 'mid', 'low']);
  });

  test('WTN is LOWER-is-better, so the same numbers invert', () => {
    // The failure this guards is silent: hardcoding "higher wins" puts every WTN position exactly
    // backwards and raises no error at all.
    const params = setup({
      policy: { ordering: RATING, ratingType: WTN },
      participants: [rated('low', WTN, 4.2), rated('mid', WTN, 8.1), rated('high', WTN, 12.5)],
    });
    expect(order(getLadderStanding(params))).toEqual(['low', 'mid', 'high']);
  });

  test('positions are renumbered 1..n and carry the rating that produced them', () => {
    const params = setup({
      policy: { ordering: RATING, ratingType: UTR },
      participants: [rated('a', UTR, 4), rated('b', UTR, 11)],
    });
    const standing = getLadderStanding(params);
    expect(standing).toEqual([
      { position: 1, participantId: 'b', ratingValue: 11 },
      { position: 2, participantId: 'a', ratingValue: 4 },
    ]);
  });

  test('an unrated participant sorts LAST — absent is not "best"', () => {
    const params = setup({
      policy: { ordering: RATING, ratingType: UTR },
      participants: [rated('unrated', 'SOMETHING_ELSE', 99), rated('rated', UTR, 3)],
    });
    expect(order(getLadderStanding(params))).toEqual(['rated', 'unrated']);
  });

  test('an unknown ratingType returns the stored order and derives nothing', () => {
    // Falling back silently to stored positions would present a misconfiguration as a working
    // ladder. The absent ratingValue is the tell.
    const params = setup({
      policy: { ordering: RATING, ratingType: 'NOT_A_RATING' },
      participants: [rated('a', UTR, 4), rated('b', UTR, 11)],
    });
    const standing = getLadderStanding(params);
    expect(order(standing)).toEqual(['a', 'b']);
    expect(standing[0].ratingValue).toBeUndefined();
  });
});

describe('dynamic ratings — the DrawMatic pattern', () => {
  test('a factory-maintained DYNAMIC value outranks the published one', () => {
    // The published rating is the STARTING position; the factory moves it from there on results.
    const participants = [ratedBoth('climber', 1500, 1900), rated('static', ELO, 1700)];
    const params = setup({ policy: { ordering: RATING, ratingType: ELO, dynamicRating: true }, participants });
    // On published ratings alone `static` (1700) leads; the dynamic 1900 overtakes it.
    expect(order(getLadderStanding(params))).toEqual(['climber', 'static']);
  });

  test('without dynamicRating the published value is used even when a DYNAMIC one exists', () => {
    const participants = [ratedBoth('climber', 1500, 1900), rated('static', ELO, 1700)];
    const params = setup({ policy: { ordering: RATING, ratingType: ELO }, participants });
    expect(order(getLadderStanding(params))).toEqual(['static', 'climber']);
  });

  test('a participant with no dynamic value falls back to the published one as a starting position', () => {
    const participants = [ratedBoth('started', 1500, 1600), rated('newcomer', ELO, 1800)];
    const params = setup({ policy: { ordering: RATING, ratingType: ELO, dynamicRating: true }, participants });
    // The newcomer has played nothing, so their published 1800 is their starting position.
    expect(order(getLadderStanding(params))).toEqual(['newcomer', 'started']);
  });
});
