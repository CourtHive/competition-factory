import { mocksEngine } from '@Assemblies/engines/mock';
import { tieFormats } from '@Fixtures/scoring/tieFormats';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { TEAM as TEAM_EVENT } from '@Constants/eventConstants';
import { TEAM as TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import { DOUBLES } from '@Constants/matchUpTypes';

/**
 * `fixtures.tieFormats.*` is a published surface whose whole purpose is to be consumed directly. The
 * fixtures cannot carry collectionIds — a collectionId identifies a collection INSTANCE within a record,
 * and a shared module-level fixture would hand every record that used it the same identities — so the
 * factory must mint them when the tieFormat is attached.
 *
 * Until 2026-08-09 it did not, on this path: `addEvent` minted ids for a `tieFormatName` but merely
 * VALIDATED a supplied tieFormat object, and `validateTieFormat` does not check collectionIds by default.
 * Every generated line then carried `collectionId: null`, could not be attributed to its collection, and
 * the tie never scored — a completed 4-3 dual stayed TO_BE_PLAYED with no winner.
 */
function buildDual(tieFormat: any) {
  tournamentEngine.reset();
  tournamentEngine.newTournamentRecord({ tournamentId: 'tournamentId' });
  tournamentEngine.attachPolicies({
    policyDefinitions: { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } },
  });
  tournamentEngine.addParticipants({
    participants: ['A', 'B'].map((participantName) => ({
      participantType: TEAM_PARTICIPANT,
      participantId: participantName,
      participantRole: COMPETITOR,
      participantName,
    })),
  });
  tournamentEngine.addEvent({
    event: { eventId: 'eventId', eventName: 'Dual', eventType: TEAM_EVENT, tieFormat },
  });
  tournamentEngine.addEventEntries({
    entryStatus: DIRECT_ACCEPTANCE,
    participantIds: ['A', 'B'],
    eventId: 'eventId',
  });

  let result: any = tournamentEngine.generateDrawDefinition({
    drawType: SINGLE_ELIMINATION,
    eventId: 'eventId',
    drawSize: 2,
    tieFormat,
  });
  const drawId = result.drawDefinition.drawId;
  tournamentEngine.addDrawDefinition({ eventId: 'eventId', drawDefinition: result.drawDefinition });
  return { drawId };
}

function scoreDual(drawId: string, side1Wins: number) {
  const tie: any = tournamentEngine
    .allDrawMatchUps({ drawId })
    .matchUps.find(({ matchUpType }) => matchUpType === TEAM_EVENT);

  const doubles = tie.tieMatchUps.filter(({ matchUpType }) => matchUpType === DOUBLES);
  const singles = tie.tieMatchUps.filter(({ matchUpType }) => matchUpType !== DOUBLES);
  const winners = new Set([...doubles.slice(0, 2), ...singles.slice(0, side1Wins - 1)].map((l: any) => l.matchUpId));

  for (const line of tie.tieMatchUps) {
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      winningSide: winners.has(line.matchUpId) ? 1 : 2,
      matchUpStatus: COMPLETED,
      scoreString: '6-1 6-1',
    });
    tournamentEngine.setMatchUpStatus({ matchUpId: line.matchUpId, drawId, outcome });
  }

  return tournamentEngine.allDrawMatchUps({ drawId }).matchUps.find(({ matchUpType }) => matchUpType === TEAM_EVENT);
}

describe('published tieFormat fixtures are usable directly', () => {
  it('mints collectionIds onto the stored tieFormat', () => {
    buildDual(tieFormats.USTA_COLLEGE);

    const { event }: any = tournamentEngine.getEvent({ eventId: 'eventId' });
    const collectionIds = event.tieFormat.collectionDefinitions.map(({ collectionId }) => collectionId);

    expect(collectionIds.every((id) => typeof id === 'string' && id.length)).toEqual(true);
    expect(new Set(collectionIds).size).toEqual(collectionIds.length);
  });

  it('attributes every generated line to a collection', () => {
    const { drawId } = buildDual(tieFormats.USTA_COLLEGE);
    const tie: any = tournamentEngine
      .allDrawMatchUps({ drawId })
      .matchUps.find(({ matchUpType }) => matchUpType === TEAM_EVENT);

    expect(tie.tieMatchUps.length).toEqual(9);
    expect(tie.tieMatchUps.every(({ collectionId }) => !!collectionId)).toEqual(true);
  });

  // the user-visible defect: a completed 4-3 dual produced no score and no winner
  it('scores a dual built from a published fixture', () => {
    const { drawId } = buildDual(tieFormats.USTA_COLLEGE);
    const tie: any = scoreDual(drawId, 4);

    expect(tie.matchUpStatus).toEqual(COMPLETED);
    expect(tie.winningSide).toEqual(1);
    expect(tie.score.scoreStringSide1).toEqual('4-3');
  });

  // the reason fixtures cannot carry ids in the first place: they are shared module-level objects
  it('never stamps ids onto the shared fixture', () => {
    const before = tieFormats.USTA_COLLEGE.collectionDefinitions.map(({ collectionId }: any) => collectionId);
    expect(before.every((id) => id === undefined)).toEqual(true);

    buildDual(tieFormats.USTA_COLLEGE);

    const after = tieFormats.USTA_COLLEGE.collectionDefinitions.map(({ collectionId }: any) => collectionId);
    expect(after).toEqual(before);
  });

  it('gives two records built from the same fixture distinct collection identities', () => {
    buildDual(tieFormats.USTA_COLLEGE);
    const first: any = tournamentEngine.getEvent({ eventId: 'eventId' }).event;
    const firstIds = first.tieFormat.collectionDefinitions.map(({ collectionId }) => collectionId);

    buildDual(tieFormats.USTA_COLLEGE);
    const second: any = tournamentEngine.getEvent({ eventId: 'eventId' }).event;
    const secondIds = second.tieFormat.collectionDefinitions.map(({ collectionId }) => collectionId);

    expect(firstIds).not.toEqual(secondIds);
  });
});
