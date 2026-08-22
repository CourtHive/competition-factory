import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

import { INVALID_PARTICIPANT_IDS } from '@Constants/errorConditionConstants';
import { COMPETITOR, OFFICIAL } from '@Constants/participantRoles';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import { ANY } from '@Constants/genderConstants';

/**
 * Only competitors compete, and only competitors are counted as competitors.
 *
 * Every eligibility predicate in `addEventEntries` gated on `participantType`; none consulted
 * `participantRole`. An OFFICIAL, a COACH, a PHYSIO and a TRANSPORT driver are all INDIVIDUAL
 * participants, so nothing stopped a referee being entered into a draw and drawn against a player.
 *
 * `getTournamentInfo` had the mirror-image hole: `individualParticipantCount` counted every INDIVIDUAL,
 * so 32 players plus 8 officials reported 40 — a number displayed beside a draw size.
 *
 * Each test below moves ONE participant between roles and asserts the outcome flips, so a passing
 * result cannot be explained by gender enforcement, category enforcement or entry-status handling.
 */

// `stripRole` models a stored record written before `participantRole` was universally present.
// `addParticipants` REFUSES a participant with no role (ERR_MISSING_PARTICIPANT_ROLE), so the only
// honest way to produce one is to author it on the record — which is exactly how such records exist.
const seed = ({ stripRole }: { stripRole?: boolean } = {}) => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventName: 'Singles', eventType: SINGLES_EVENT, gender: ANY }],
    participantsProfile: { participantsCount: 4 },
    nonRandom: 1,
  });
  let rolelessId;
  if (stripRole) {
    const legacy = tournamentRecord.participants.find((p: any) => p.participantType === INDIVIDUAL);
    delete legacy.participantRole;
    rolelessId = legacy.participantId;
  }
  tournamentEngine.setState(tournamentRecord);
  const eventId = tournamentRecord.events[0].eventId;
  const participantIds = tournamentEngine
    .getParticipants({ participantFilters: { participantTypes: [INDIVIDUAL] } })
    .participants.map(({ participantId }: any) => participantId);
  return { eventId, participantIds, rolelessId };
};

const enteredIds = (eventId: string) =>
  tournamentEngine.getEvent({ eventId }).event.entries?.map(({ participantId }: any) => participantId) ?? [];

describe('addEventEntries role gate', () => {
  it('REFUSES an entry for a participant carrying a non-competitor role, and accepts the same participant once the role is COMPETITOR', () => {
    const { eventId, participantIds } = seed();
    const [staffId] = participantIds;

    tournamentEngine.modifyParticipant({ participant: { participantId: staffId, participantRole: OFFICIAL } });
    const refused: any = tournamentEngine.addEventEntries({ participantIds: [staffId], eventId });
    expect(refused.error).toEqual(INVALID_PARTICIPANT_IDS);
    expect(enteredIds(eventId)).not.toContain(staffId);

    // control — the ONLY thing that changes is participantRole
    tournamentEngine.modifyParticipant({ participant: { participantId: staffId, participantRole: COMPETITOR } });
    const accepted: any = tournamentEngine.addEventEntries({ participantIds: [staffId], eventId });
    expect(accepted.success).toEqual(true);
    expect(enteredIds(eventId)).toContain(staffId);
  });

  it('still enters participants that carry no participantRole at all', () => {
    // The gate is "has a role and it is not COMPETITOR", not "is COMPETITOR". Most existing records —
    // and every participant mocksEngine generates without a profile role — carry no role, and those
    // are players. Rejecting them would break entry for every tournament already in storage.
    const { eventId, rolelessId } = seed({ stripRole: true });
    // control: nothing downstream re-stamped a role on the way into state
    expect(
      tournamentEngine.getParticipants({ participantFilters: { participantIds: [rolelessId] } }).participants[0]
        .participantRole,
    ).toBeUndefined();

    const result: any = tournamentEngine.addEventEntries({ participantIds: [rolelessId], eventId });
    expect(result.success).toEqual(true);
    expect(enteredIds(eventId)).toContain(rolelessId);
  });

  it('admits the competitors in a mixed batch and refuses only the staff member', () => {
    const { eventId, participantIds } = seed();
    const [staffId, ...others] = participantIds;
    tournamentEngine.modifyParticipant({ participant: { participantId: staffId, participantRole: OFFICIAL } });

    const result: any = tournamentEngine.addEventEntries({ participantIds, eventId });
    expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);

    const entered = enteredIds(eventId);
    expect(entered).not.toContain(staffId);
    expect(entered).toEqual(expect.arrayContaining(others));
  });
});

describe('getTournamentInfo individualParticipantCount', () => {
  const count = () =>
    tournamentEngine.getTournamentInfo({ withMatchUpStats: true }).tournamentInfo.individualParticipantCount;

  it('excludes staff and includes competitors and role-less participants', () => {
    // one of the four carries no role at all; it must stay in the count throughout
    const { participantIds, rolelessId } = seed({ stripRole: true });
    expect(count()).toEqual(participantIds.length); // control: all four counted before any role changes

    const staffId = participantIds.find((participantId: string) => participantId !== rolelessId);
    tournamentEngine.modifyParticipant({ participant: { participantId: staffId, participantRole: OFFICIAL } });
    expect(count()).toEqual(participantIds.length - 1);

    // and the exclusion reverses — an explicit COMPETITOR is counted exactly as an absent role is
    tournamentEngine.modifyParticipant({ participant: { participantId: staffId, participantRole: COMPETITOR } });
    expect(count()).toEqual(participantIds.length);
  });
});
