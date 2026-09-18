import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { TEAM } from '@Constants/participantConstants';

/**
 * `modifyParticipant` could set `participantOtherName` but never unset it.
 *
 * The gate read `participantOtherName || undefined`, so an emptied field became `undefined`
 * — and `definedAttributes` strips `undefined`, meaning the key was neither assigned nor
 * removed and the stored value simply survived. A wrong other-name could be corrected but
 * never deleted. Identical in shape to the `birthDate` and `nationalityCode` defects closed
 * in `clearPersonFields.test.ts`.
 *
 * The contract is the same one those fields follow, and is asserted here in full because a
 * clear is only half of it: an explicit empty string means "clear", while `undefined` must
 * keep meaning "leave untouched" — consumers send the whole participant on every save, so a
 * field they do not manage has to survive.
 *
 * Clearing DELETES the key rather than storing `''`, so readers see an absent field instead
 * of a falsy one each of them would have to special-case. That is asserted as key ABSENCE
 * rather than with `toBeUndefined()`, which cannot tell a deleted key from one set to
 * `undefined` and so would pass on either.
 *
 * Kept separate from `clearPersonFields.test.ts` deliberately: `participantOtherName` is a
 * PARTICIPANT attribute, not a `person` attribute, so the delete targets a different object
 * (`existingParticipant`, not `existingParticipant.person`). Neighbour assertions matter more
 * for that reason — a mistargeted key here would remove a top-level participant field.
 */

const OTHER_NAME = 'Riverside Colts';

function seedTeamWithOtherName() {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 8, participantType: TEAM },
    setState: true,
  });

  const {
    participants: [team],
  } = tournamentEngine.getParticipants({ participantFilters: { participantTypes: [TEAM] } });

  const result: any = tournamentEngine.modifyParticipant({
    participant: { ...team, participantOtherName: OTHER_NAME },
  });
  expect(result.success).toEqual(true);

  const seeded = tournamentEngine.findParticipant({ participantId: team.participantId }).participant;
  expect(seeded.participantOtherName).toEqual(OTHER_NAME);

  return seeded;
}

// Re-read from state rather than trusting the returned object: a mutation can answer
// correctly and still not have persisted.
function participantAfterModify(participant: any, changes: any) {
  const result: any = tournamentEngine.modifyParticipant({ participant: { ...participant, ...changes } });
  expect(result.success).toEqual(true);
  return tournamentEngine.findParticipant({ participantId: participant.participantId }).participant;
}

describe('clearing participant fields via modifyParticipant', () => {
  it('an empty participantOtherName removes the stored value', () => {
    const team = seedTeamWithOtherName();
    const participant = participantAfterModify(team, { participantOtherName: '' });

    expect(participant.participantOtherName).toBeUndefined();
  });

  it('clearing deletes the key rather than storing an empty string', () => {
    const team = seedTeamWithOtherName();
    const participant = participantAfterModify(team, { participantOtherName: '' });

    expect(Object.keys(participant).includes('participantOtherName')).toEqual(false);
  });

  it('clearing must not disturb its neighbours', () => {
    const team = seedTeamWithOtherName();
    const participant = participantAfterModify(team, { participantOtherName: '' });

    expect(participant.participantName).toEqual(team.participantName);
    expect(participant.participantType).toEqual(team.participantType);
    expect(participant.participantId).toEqual(team.participantId);
    expect(participant.individualParticipantIds).toEqual(team.individualParticipantIds);
  });

  it('omitting participantOtherName leaves it untouched — undefined is not a clear', () => {
    const team = seedTeamWithOtherName();
    const { participantOtherName: _omitted, ...withoutOtherName } = team;

    const result: any = tournamentEngine.modifyParticipant({ participant: withoutOtherName });
    expect(result.success).toEqual(true);

    const participant = tournamentEngine.findParticipant({ participantId: team.participantId }).participant;
    expect(participant.participantOtherName).toEqual(OTHER_NAME);
  });

  it('an explicit undefined also leaves the field untouched', () => {
    const team = seedTeamWithOtherName();
    const participant = participantAfterModify(team, { participantOtherName: undefined });

    expect(participant.participantOtherName).toEqual(OTHER_NAME);
  });

  it('a non-string participantOtherName is ignored rather than stored', () => {
    const team = seedTeamWithOtherName();

    // `definedAttributes` strips only '', null and undefined, so without an isString guard a
    // falsy non-string would persist into a name field.
    for (const value of [0, false, 17, {}]) {
      const participant = participantAfterModify(team, { participantOtherName: value });
      expect(participant.participantOtherName).toEqual(OTHER_NAME);
    }
  });

  it('a modification that clears is still reflected in what modifyParticipant returns', () => {
    const team = seedTeamWithOtherName();
    const result: any = tournamentEngine.modifyParticipant({
      participant: { ...team, participantOtherName: '' },
    });

    expect(result.success).toEqual(true);
    expect(result.participant?.participantOtherName).toBeUndefined();
  });
});
