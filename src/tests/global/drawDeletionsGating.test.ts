import { afterEach, describe, expect, it } from 'vitest';

import { setAuditAuthorityServer, setSaveDrawDeletions, setSubscriptions } from '@Global/state/globalState';
import { findExtension } from '@Acquire/findExtension';
import { getTimeItem } from '@Query/base/timeItems';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants
import { APPLIED_POLICIES, DRAW_DELETIONS } from '@Constants/extensionConstants';
import { DELETE_DRAW_DEFINITIONS } from '@Constants/auditConstants';
import { AUDIT } from '@Constants/topicConstants';

const DRAW_PROFILES = [{ participantsCount: 30, drawSize: 32 }];

function seedTournament() {
  const result = mocksEngine.generateTournamentRecord({
    inContext: true,
    setState: true,
    drawProfiles: DRAW_PROFILES,
  });
  return { drawId: result.drawIds[0], eventId: result.eventIds[0] };
}

afterEach(() => {
  // remove any AUDIT subscription added during the test so the next test
  // starts with the topic genuinely absent
  setSubscriptions({ subscriptions: { [AUDIT]: true } });
});

describe('Phase 6 drawDeletions gating', () => {
  it('auditAuthorityServer=true suppresses extension and timeItem even with AUDIT subscriber', () => {
    setAuditAuthorityServer(true);
    setSaveDrawDeletions(true);

    let noticeCount = 0;
    setSubscriptions({
      subscriptions: {
        [AUDIT]: (notices) => {
          noticeCount += 1;
          expect(notices[0].detail[0].action).toEqual(DELETE_DRAW_DEFINITIONS);
          expect(notices[0].detail[0].payload.drawDefinitions).not.toBeUndefined();
        },
      },
    });

    const { drawId, eventId } = seedTournament();
    const result = tournamentEngine.deleteDrawDefinitions({ drawIds: [drawId], eventId });
    expect(result.success).toEqual(true);

    const { event } = tournamentEngine.getEvent({ drawId });
    const { extension } = findExtension({ name: DRAW_DELETIONS, element: event });
    expect(extension).toBeUndefined();
    const { timeItem } = getTimeItem({ element: event, itemType: DRAW_DELETIONS });
    expect(timeItem).toBeUndefined();
    expect(noticeCount).toEqual(1);
  });

  it('auditAuthorityServer=true with no AUDIT subscriber writes nothing to the record', () => {
    setAuditAuthorityServer(true);
    setSaveDrawDeletions(true);

    const { drawId, eventId } = seedTournament();
    const result = tournamentEngine.deleteDrawDefinitions({ drawIds: [drawId], eventId });
    expect(result.success).toEqual(true);

    const { event } = tournamentEngine.getEvent({ drawId });
    const { extension } = findExtension({ name: DRAW_DELETIONS, element: event });
    expect(extension).toBeUndefined();
    const { timeItem } = getTimeItem({ element: event, itemType: DRAW_DELETIONS });
    expect(timeItem).toBeUndefined();
  });

  it('saveDrawDeletions=false with no AUDIT subscriber writes nothing', () => {
    setAuditAuthorityServer(false);
    setSaveDrawDeletions(false);

    const { drawId, eventId } = seedTournament();
    const result = tournamentEngine.deleteDrawDefinitions({ drawIds: [drawId], eventId });
    expect(result.success).toEqual(true);

    const { event } = tournamentEngine.getEvent({ drawId });
    const { extension } = findExtension({ name: DRAW_DELETIONS, element: event });
    expect(extension).toBeUndefined();
    const { timeItem } = getTimeItem({ element: event, itemType: DRAW_DELETIONS });
    expect(timeItem).toBeUndefined();
  });

  it('saveDrawDeletions=false still emits the AUDIT notice when subscribed', () => {
    setAuditAuthorityServer(false);
    setSaveDrawDeletions(false);

    let noticeCount = 0;
    setSubscriptions({
      subscriptions: {
        [AUDIT]: (notices) => {
          noticeCount += 1;
          expect(notices[0].detail[0].payload.drawDefinitions).not.toBeUndefined();
        },
      },
    });

    const { drawId, eventId } = seedTournament();
    const result = tournamentEngine.deleteDrawDefinitions({ drawIds: [drawId], eventId });
    expect(result.success).toEqual(true);

    expect(noticeCount).toEqual(1);
    const { event } = tournamentEngine.getEvent({ drawId });
    const { extension } = findExtension({ name: DRAW_DELETIONS, element: event });
    expect(extension).toBeUndefined();
    const { timeItem } = getTimeItem({ element: event, itemType: DRAW_DELETIONS });
    expect(timeItem).toBeUndefined();
  });

  it('saveDrawDeletions=true + AUDIT subscriber writes the timeItem count and emits the notice', () => {
    setAuditAuthorityServer(false);
    setSaveDrawDeletions(true);

    let noticeCount = 0;
    setSubscriptions({
      subscriptions: {
        [AUDIT]: () => {
          noticeCount += 1;
        },
      },
    });

    const { drawId, eventId } = seedTournament();
    const result = tournamentEngine.deleteDrawDefinitions({ drawIds: [drawId], eventId });
    expect(result.success).toEqual(true);

    expect(noticeCount).toEqual(1);
    const { event } = tournamentEngine.getEvent({ drawId });
    const { extension } = findExtension({ name: DRAW_DELETIONS, element: event });
    expect(extension).toBeUndefined(); // when AUDIT subscribed, no extension write
    const { timeItem } = getTimeItem({ element: event, itemType: DRAW_DELETIONS });
    expect(timeItem?.itemValue).toEqual(1);
  });

  it('saveDrawDeletions=true + no AUDIT subscriber writes the extension blob', () => {
    setAuditAuthorityServer(false);
    setSaveDrawDeletions(true);

    const { drawId, eventId } = seedTournament();
    const result = tournamentEngine.deleteDrawDefinitions({ drawIds: [drawId], eventId });
    expect(result.success).toEqual(true);

    const { event } = tournamentEngine.getEvent({ drawId });
    const { extension } = findExtension({ name: DRAW_DELETIONS, element: event });
    expect(extension?.value?.length).toEqual(1);
    expect(extension?.value[0].deletedDrawsDetail[0].positionAssignments).not.toBeUndefined();
  });

  it('appliedPolicies.audit[DRAW_DELETIONS]=false suppresses the extension (existing semantics preserved)', () => {
    setAuditAuthorityServer(false);
    setSaveDrawDeletions(true);

    const { drawId, eventId } = seedTournament();
    const { tournamentRecord } = tournamentEngine.getTournament();
    // attach an extension that disables DRAW_DELETIONS audit on the tournament
    tournamentRecord.extensions = [
      ...(tournamentRecord.extensions ?? []),
      { name: APPLIED_POLICIES, value: { audit: { [DRAW_DELETIONS]: false } } },
    ];
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.deleteDrawDefinitions({ drawIds: [drawId], eventId });
    expect(result.success).toEqual(true);

    const { event } = tournamentEngine.getEvent({ drawId });
    const { extension } = findExtension({ name: DRAW_DELETIONS, element: event });
    expect(extension).toBeUndefined();
  });
});
