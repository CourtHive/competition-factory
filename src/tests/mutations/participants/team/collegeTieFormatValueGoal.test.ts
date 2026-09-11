import tieFormatDefaults from '@Generators/templates/tieFormatDefaults';
import { tieFormats } from '@Fixtures/scoring/tieFormats';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { DOUBLES } from '@Constants/matchUpTypes';
import { TEAM } from '@Constants/eventConstants';

// scoring lines without assigning individuals to collection positions — the dual's VALUE is what
// is under test, not its lineUps (the same policy the team-advancement scenarios use)
const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

/**
 * A DI college dual is worth SEVEN points — one for the doubles collection as a whole, plus six
 * singles — so it clinches at four. `COLLEGE_DEFAULT` shipped `valueGoal: 5`, which is the correct
 * goal for the NINE-point formats (COLLEGE_D3 / COLLEGE_JUCO) and wrong here: a dual won 4-3 reached
 * no goal and produced no winner at all.
 */
const DOUBLES_POINT_MAX_VALUE = 7;

function playDual({ tieFormat, side1Wins }: { tieFormat: any; side1Wins: number }) {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormat, drawId: 'drawId' }],
    policyDefinitions,
    setState: true,
  });

  const tie: any = tournamentEngine
    .allDrawMatchUps({ drawId: 'drawId' })
    .matchUps.find(({ matchUpType }) => matchUpType === TEAM);

  const doubles = tie.tieMatchUps.filter(({ matchUpType }) => matchUpType === DOUBLES);
  const singles = tie.tieMatchUps.filter(({ matchUpType }) => matchUpType !== DOUBLES);

  // side 1 takes the doubles point (2 of 3) plus (side1Wins - 1) singles
  const winners = new Set([...doubles.slice(0, 2), ...singles.slice(0, side1Wins - 1)].map((l: any) => l.matchUpId));

  for (const line of tie.tieMatchUps) {
    const winningSide = winners.has(line.matchUpId) ? 1 : 2;
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      scoreString: '6-1 6-1',
      matchUpStatus: COMPLETED,
      winningSide,
    });
    tournamentEngine.setMatchUpStatus({ matchUpId: line.matchUpId, drawId: 'drawId', outcome });
  }

  return tournamentEngine
    .allDrawMatchUps({ drawId: 'drawId' })
    .matchUps.find(({ matchUpType }) => matchUpType === TEAM);
}

describe('COLLEGE_DEFAULT valueGoal', () => {
  it('is the majority of the seven points the format can award', () => {
    const tieFormat: any = tieFormats.COLLEGE_DEFAULT;

    const maxValue = tieFormat.collectionDefinitions.reduce(
      (total: number, c: any) => total + (c.collectionValue ?? (c.matchUpValue ?? 0) * (c.matchUpCount ?? 0)),
      0,
    );

    expect(maxValue).toEqual(DOUBLES_POINT_MAX_VALUE);
    expect(tieFormat.winCriteria.valueGoal).toEqual(Math.floor(maxValue / 2) + 1);
    expect(tieFormat.winCriteria.valueGoal).toEqual(4);
  });

  // the user-visible defect: with valueGoal 5 a 4-3 dual reached no goal and had NO winner
  it('produces a winner for a dual won 4-3', () => {
    const tie: any = playDual({ tieFormat: tieFormats.COLLEGE_DEFAULT, side1Wins: 4 });

    expect(tie.winningSide).toEqual(1);
    expect(tie.matchUpStatus).toEqual(COMPLETED);
  });

  it('matches USTA_COLLEGE, which carries the same doubles-point structure', () => {
    expect((tieFormats.USTA_COLLEGE as any).winCriteria.valueGoal).toEqual(
      (tieFormats.COLLEGE_DEFAULT as any).winCriteria.valueGoal,
    );
  });

  // the nine-point formats keep valueGoal 5 — the fix must not sweep them up
  it('leaves the nine-point college formats at five', () => {
    for (const name of ['COLLEGE_D3', 'COLLEGE_JUCO']) {
      const tieFormat: any = (tieFormats as any)[name];
      const maxValue = tieFormat.collectionDefinitions.reduce(
        (total: number, c: any) => total + (c.collectionValue ?? (c.matchUpValue ?? 0) * (c.matchUpCount ?? 0)),
        0,
      );
      expect(maxValue).toEqual(9);
      expect(tieFormat.winCriteria.valueGoal).toEqual(5);
    }
  });
});

/**
 * The named tie formats have TWO independent hand-maintained sources: the JSON fixtures under
 * `fixtures/scoring/tieFormats`, and the `namedFormats` table inside `tieFormatDefaults`. Nothing
 * reconciled them, and they had drifted — `COLLEGE_DEFAULT` said 5 in one and 4 in the other, so
 * which valueGoal a consumer got depended on which door they came through.
 */
describe('tieFormat fixture ↔ tieFormatDefaults conformance', () => {
  const namedFixtures = Object.keys(tieFormats);

  it('covers every published fixture', () => {
    expect(namedFixtures.length).toBeGreaterThanOrEqual(18);
  });

  it.each(namedFixtures)('%s winCriteria agrees across both sources', (name) => {
    const fixture: any = (tieFormats as any)[name];
    const generated: any = tieFormatDefaults({ namedFormat: name });

    // a fixture with no named-format twin is single-sourced — nothing to reconcile
    if (!generated?.winCriteria) return;

    expect(generated.winCriteria.valueGoal).toEqual(fixture.winCriteria?.valueGoal);
    expect(!!generated.winCriteria.aggregateValue).toEqual(!!fixture.winCriteria?.aggregateValue);
  });
});
