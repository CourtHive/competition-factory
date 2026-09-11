import { expect, test, describe } from 'vitest';

import { addLadderParticipant } from '@Mutate/ladder/addLadderParticipant';
import { refreshLadderRatings } from '@Mutate/ladder/refreshLadderRatings';
import { getLadderStanding } from '@Query/ladder/getLadderStanding';

import { BY_RATING, RANK, RATING, SWAP } from '@Constants/ladderConstants';
import { RATING as RATING_SCALE, SCALE } from '@Constants/scaleConstants';
import { POLICY_TYPE_LADDER } from '@Constants/policyConstants';
import { LADDER } from '@Constants/drawDefinitionConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import { UTR, WTN } from '@Constants/ratingConstants';

const AT = '2026-04-01T00:00:00.000Z';

const withRating = (participantId: string, ratingType: string, scaleValue?: number) => ({
  participantId,
  participantType: 'INDIVIDUAL',
  timeItems:
    scaleValue === undefined
      ? []
      : [{ itemType: `${SCALE}.${RATING_SCALE}.${SINGLES_EVENT}.${ratingType}`, itemValue: scaleValue }],
});

const setup = ({ policy, seated, participants }: any) => {
  const structure: any = {
    structureId: 's1',
    matchUps: [],
    positionAssignments: seated.map((participantId: string, i: number) => ({ drawPosition: i + 1, participantId })),
  };
  const drawDefinition: any = {
    drawId: 'd1',
    drawType: LADDER,
    structures: [structure],
    extensions: [{ name: 'appliedPolicies', value: { [POLICY_TYPE_LADDER]: policy } }],
  };
  return { drawDefinition, structure, tournamentRecord: { participants } };
};

const standing = (structure: any) =>
  [...structure.positionAssignments]
    .sort((a: any, b: any) => a.drawPosition - b.drawPosition)
    .map((a: any) => a.participantId);

describe('entryPlacement: BOTTOM is the default and costs nobody anything', () => {
  test('a newcomer joins at the bottom and nobody moves', () => {
    const params = setup({
      policy: { ordering: RANK, movement: SWAP },
      seated: ['a', 'b', 'c'],
      participants: [withRating('new', UTR, 15)],
    });
    const result = addLadderParticipant({ participantId: 'new', addedAt: AT, ...params });

    expect(result.drawPosition).toEqual(4);
    expect(standing(params.structure)).toEqual(['a', 'b', 'c', 'new']);
  });

  test('the first participant on an empty ladder takes position 1', () => {
    const params = setup({ policy: { ordering: RANK }, seated: [], participants: [] });
    expect(addLadderParticipant({ participantId: 'first', addedAt: AT, ...params }).drawPosition).toEqual(1);
  });

  test('adding someone twice is refused', () => {
    const params = setup({ policy: { ordering: RANK }, seated: ['a'], participants: [] });
    expect(addLadderParticipant({ participantId: 'a', addedAt: AT, ...params }).error).toBeDefined();
  });
});

describe('entryPlacement: BY_RATING seats a newcomer where their rating says', () => {
  test('a strong newcomer displaces everyone beneath them', () => {
    // A real intervention on a RANK ladder — those positions were earned by challenge.
    const params = setup({
      policy: { ordering: RANK, movement: SWAP, entryPlacement: BY_RATING, ratingType: UTR },
      seated: ['top', 'mid', 'low'],
      participants: [
        withRating('top', UTR, 12),
        withRating('mid', UTR, 8),
        withRating('low', UTR, 4),
        withRating('new', UTR, 10), // between top and mid
      ],
    });
    const result = addLadderParticipant({ participantId: 'new', addedAt: AT, ...params });

    expect(result.drawPosition).toEqual(2);
    expect(standing(params.structure)).toEqual(['top', 'new', 'mid', 'low']);
  });

  test('direction is honoured — on a WTN ladder LOWER is better', () => {
    const params = setup({
      policy: { ordering: RANK, movement: SWAP, entryPlacement: BY_RATING, ratingType: WTN },
      seated: ['best', 'middling', 'worst'],
      participants: [
        withRating('best', WTN, 4),
        withRating('middling', WTN, 8),
        withRating('worst', WTN, 12),
        withRating('new', WTN, 6), // better than middling on a lower-is-better scale
      ],
    });
    addLadderParticipant({ participantId: 'new', addedAt: AT, ...params });
    expect(standing(params.structure)).toEqual(['best', 'new', 'middling', 'worst']);
  });

  test('an UNRATED newcomer goes to the bottom, not the top', () => {
    // Absent is not "best" — the same rule the derived standing uses.
    const params = setup({
      policy: { ordering: RANK, movement: SWAP, entryPlacement: BY_RATING, ratingType: UTR },
      seated: ['a', 'b'],
      participants: [withRating('a', UTR, 9), withRating('b', UTR, 5), withRating('new', UTR, undefined)],
    });
    expect(addLadderParticipant({ participantId: 'new', addedAt: AT, ...params }).drawPosition).toEqual(3);
  });

  test('under RATING ordering placement is moot — the standing re-derives', () => {
    const params = setup({
      policy: { ordering: RATING, ratingType: UTR, entryPlacement: BY_RATING },
      seated: ['a', 'b'],
      participants: [withRating('a', UTR, 5), withRating('b', UTR, 3), withRating('new', UTR, 11)],
    });
    addLadderParticipant({ participantId: 'new', addedAt: AT, ...params });
    // Appended at the bottom of positionAssignments, but sorted to the top when read.
    expect(getLadderStanding(params).map((s) => s.participantId)).toEqual(['new', 'a', 'b']);
  });
});

describe('refreshLadderRatings — the factory records, it does not fetch', () => {
  const ratingLadder = () =>
    setup({
      policy: { ordering: RATING, ratingType: UTR },
      seated: ['a', 'b', 'c'],
      participants: [withRating('a', UTR, 5), withRating('b', UTR, 7), withRating('c', UTR, 9)],
    });

  test('writing new values re-derives the whole standing', () => {
    const params = ratingLadder();
    expect(getLadderStanding(params).map((s) => s.participantId)).toEqual(['c', 'b', 'a']);

    const result = refreshLadderRatings({ ratings: { a: 12 }, refreshedAt: AT, ...params });
    expect(result.error).toBeUndefined();
    expect(result.updated).toEqual(1);
    expect(getLadderStanding(params).map((s) => s.participantId)).toEqual(['a', 'c', 'b']);
  });

  test('a PARTIAL refresh leaves the others alone — a provider will not have everyone', () => {
    const params = ratingLadder();
    refreshLadderRatings({ ratings: { a: 12 }, refreshedAt: AT, ...params });
    const standing = getLadderStanding(params);
    expect(standing.find((s) => s.participantId === 'b')?.ratingValue).toEqual(7);
  });

  test('a rating for someone not on this ladder is reported, not written quietly', () => {
    const params = ratingLadder();
    const result = refreshLadderRatings({ ratings: { stranger: 12 }, refreshedAt: AT, ...params });
    expect(result.updated).toEqual(0);
    expect(result.skipped).toEqual(['stranger']);
  });

  test('it refuses a RANK-ordered ladder — there is nothing for a rating to order there', () => {
    const params = setup({ policy: { ordering: RANK, ratingType: UTR }, seated: ['a'], participants: [] });
    expect(refreshLadderRatings({ ratings: { a: 1 }, refreshedAt: AT, ...params }).error).toBeDefined();
  });

  test('it refuses an unknown ratingType rather than writing an unreadable scale', () => {
    const params = setup({ policy: { ordering: RATING, ratingType: 'NOPE' }, seated: ['a'], participants: [] });
    expect(refreshLadderRatings({ ratings: { a: 1 }, refreshedAt: AT, ...params }).error).toBeDefined();
  });
});
