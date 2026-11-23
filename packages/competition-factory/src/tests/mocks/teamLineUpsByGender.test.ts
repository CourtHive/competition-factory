import { ROUND_ROBIN, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { DOUBLES, SINGLES, TEAM } from '@Constants/eventConstants';
import { FEMALE, MALE, MIXED } from '@Constants/genderConstants';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

/**
 * A completed TEAM fixture puts players of the collection's gender in every tieMatchUp (M11, found by
 * the mocksEngine hardening workstream, 2026-10-17).
 *
 * The lineup step took the i-th team member for the i-th singles and the i-th pair for the i-th
 * doubles, whatever the collection's gender. The engine refused every mismatch and the refusal was
 * discarded — 182 times across the suite — so gendered TEAM fixtures carried tieMatchUps with nobody
 * in them, and generation still reported success. An inContext tieMatchUp does not always carry its
 * collection's gender (here, collections with their own ids), so it is read from the definition.
 */

const FORMAT = 'SET1A-S:T10';
const collection = (collectionId: string, matchUpType: string, matchUpCount: number, gender: string) => ({
  category: { categoryName: collectionId },
  matchUpFormat: FORMAT,
  collectionName: collectionId,
  scoreValue: 1,
  collectionId,
  matchUpCount,
  matchUpType,
  gender,
});

const GENDERED = [
  collection('ms', SINGLES, 2, MALE),
  collection('ws', SINGLES, 2, FEMALE),
  collection('md', DOUBLES, 1, MALE),
  collection('wd', DOUBLES, 1, FEMALE),
  collection('xd', DOUBLES, 1, MIXED),
];

function generate(collectionDefinitions: any[], teamGenders?: any) {
  const result: any = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 0 },
    completeAllMatchUps: true,
    drawProfiles: [
      {
        tieFormat: { tieFormatName: 'GENDERED', winCriteria: { aggregateValue: true }, collectionDefinitions },
        drawType: SINGLE_ELIMINATION,
        eventType: TEAM,
        teamGenders,
        drawSize: 2,
      },
    ],
    setState: true,
  });
  expect(result.success).toEqual(true);
  return tournamentEngine
    .allTournamentMatchUps({ inContext: true })
    .matchUps.filter((matchUp: any) => matchUp.collectionId);
}

const sexesOf = (side: any) =>
  (side.participant?.individualParticipants ?? [side.participant]).map((participant: any) => participant?.person?.sex);

describe('gendered collections', () => {
  it('every tieMatchUp side holds players of its collection gender, and every tieMatchUp completes', () => {
    const tieMatchUps = generate(GENDERED, { [MALE]: 3, [FEMALE]: 3 });
    expect(tieMatchUps.length).toEqual(7);

    for (const tieMatchUp of tieMatchUps) {
      const gender = GENDERED.find((c) => c.collectionId === tieMatchUp.collectionId)?.gender;
      expect(tieMatchUp.winningSide, tieMatchUp.collectionId).toBeDefined();
      for (const side of tieMatchUp.sides) {
        const sexes = sexesOf(side);
        expect(sexes.length).toEqual(tieMatchUp.matchUpType === DOUBLES ? 2 : 1);
        if (gender === MIXED) expect([...sexes].sort((a, b) => a.localeCompare(b))).toEqual([FEMALE, MALE]);
        else for (const sex of sexes) expect(sex, tieMatchUp.collectionId).toEqual(gender);
      }
    }
  });

  // Lines come from the public generateLineUps with `exclusiveSingles` (CA 2026-10-29): one player in two singles
  // is undesirable; one player in, say, men's and mixed doubles is ordinary, so doubles are not held to it
  it('a player plays at most one singles in a dual', () => {
    const tieMatchUps = generate(GENDERED, { [MALE]: 3, [FEMALE]: 3 });
    for (const matchUpType of [SINGLES]) {
      for (const sideNumber of [0, 1]) {
        const ids = tieMatchUps
          .filter((tieMatchUp: any) => tieMatchUp.matchUpType === matchUpType)
          .flatMap((tieMatchUp: any) =>
            (
              tieMatchUp.sides[sideNumber].participant?.individualParticipantIds ?? [
                tieMatchUp.sides[sideNumber].participantId,
              ]
            ).filter(Boolean),
          );
        expect(new Set(ids).size, `${matchUpType} side ${sideNumber + 1}`).toEqual(ids.length);
      }
    }
  });
});

it('an ungendered collection takes members in order, as before', () => {
  const tieMatchUps = generate([collection('s', SINGLES, 3, 'ANY'), collection('d', DOUBLES, 1, 'ANY')]);
  expect(tieMatchUps.length).toEqual(4);
  for (const tieMatchUp of tieMatchUps) {
    expect(tieMatchUp.winningSide).toBeDefined();
    for (const side of tieMatchUp.sides)
      expect(sexesOf(side).length).toEqual(tieMatchUp.matchUpType === DOUBLES ? 2 : 1);
  }
});

/**
 * Completion runs inside generation, and its refusal was discarded: these fixtures reported success
 * with nothing completed. A status profile the outcome generator refuses is such a refusal, and it
 * now travels both steps: generateOutcome to the completion, the completion to the generation.
 */
it('a completion the engine refuses is the generation error, not a success with nothing played', () => {
  const result: any = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawSize: 4, drawType: ROUND_ROBIN, matchUpStatusProfile: 'not a profile' as any, completeAllMatchUps: true },
    ],
  });
  expect(result.error).toEqual(INVALID_VALUES);
  expect(result.success).toBeUndefined();
});
