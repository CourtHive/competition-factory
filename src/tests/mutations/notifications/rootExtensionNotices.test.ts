import { modifyMatchUpFormatTiming } from '@Mutate/extensions/matchUps/modifyMatchUpFormatTiming';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, describe, expect, it } from 'vitest';

// constants
import { MODIFY_DRAW_DEFINITION, MODIFY_TOURNAMENT_DETAIL } from '@Constants/topicConstants';
import { EVENT_NOT_FOUND, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { MUTATION_LOCKS } from '@Constants/extensionConstants';

/**
 * ROOT-EXTENSION WRITES ARE ANNOUNCED (CA 2026-10-18: "yes"). A tournament's own extensions held writes no notice
 * described: `addTournamentExtension` / `removeTournamentExtension`, the engine's `addExtension` with `discover`, a
 * tournament-scope mutation lock and the lock feature gate any lock enables. Each now sends MODIFY_TOURNAMENT_DETAIL
 * with the record's root `extensions`, only when they changed.
 *
 * And `modifyMatchUpFormatTiming` with an `eventId` writes only the records that hold the event (CA 2026-10-18: "yes
 * it's a bug"): with several records loaded, every record lacking the event had its tournament-level timing changed,
 * and an event found in none was refused only after those writes.
 */

afterEach(() => setSubscriptions({}));

function watch(topic: string) {
  const payloads: any[] = [];
  setSubscriptions({ subscriptions: { [topic]: (notices: any[]) => payloads.push(...notices) } });
  return payloads;
}

const JUNIOR = 'JUNIOR'; // a categoryType value; no constant declares it

const rootNames = (payload: any) => (payload.extensions ?? []).map((extension: any) => extension.name);

describe('root extensions', () => {
  it('addTournamentExtension and removeTournamentExtension announce the root extensions', () => {
    mocksEngine.generateTournamentRecord({ setState: true });
    const details = watch(MODIFY_TOURNAMENT_DETAIL);

    let result: any = tournamentEngine.addTournamentExtension({ extension: { name: 'rootNote', value: 1 } });
    expect(result.success).toEqual(true);
    expect(details).toHaveLength(1);
    expect(rootNames(details[0])).toContain('rootNote');

    result = tournamentEngine.removeTournamentExtension({ name: 'rootNote' });
    expect(result.success).toEqual(true);
    expect(details).toHaveLength(2);
    expect(rootNames(details[1])).not.toContain('rootNote');
  });

  it('a refused or empty write announces nothing', () => {
    mocksEngine.generateTournamentRecord({ setState: true });
    const details = watch(MODIFY_TOURNAMENT_DETAIL);

    const refused: any = tournamentEngine.addTournamentExtension({ extension: { name: 'noValue' } as any });
    expect(refused.error).toEqual(INVALID_VALUES);
    tournamentEngine.removeTournamentExtension({ name: 'neverAdded' });
    expect(details).toEqual([]);
  });

  it('the engine addExtension with discover announces each record it writes', () => {
    const { tournamentRecord: first } = mocksEngine.generateTournamentRecord();
    const { tournamentRecord: second } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState([first, second]);
    const details = watch(MODIFY_TOURNAMENT_DETAIL);

    const result: any = tournamentEngine.addExtension({
      extension: { name: 'everywhere', value: true },
      discover: true,
    });
    expect(result.success).toEqual(true);
    expect(details.map((payload) => payload.tournamentId).toSorted()).toEqual(
      [first.tournamentId, second.tournamentId].toSorted(),
    );
  });
});

describe('mutation locks at the root', () => {
  it('a tournament-scope lock is announced when added and when removed', () => {
    mocksEngine.generateTournamentRecord({ setState: true });
    const details = watch(MODIFY_TOURNAMENT_DETAIL);

    const added: any = tournamentEngine.addMutationLock({ scope: 'SCHEDULING', lockToken: 'token-1' });
    expect(added.success).toEqual(true);
    expect(details).toHaveLength(1);
    expect(rootNames(details[0])).toContain(MUTATION_LOCKS);

    const removed: any = tournamentEngine.removeMutationLock({ lockId: added.lockId, lockToken: 'token-1' });
    expect(removed.success).toEqual(true);
    expect(details).toHaveLength(2);
  });

  it('a draw lock announces the draw and the feature gate it enables at the root, once', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }], setState: true });
    const topics: string[] = [];
    setSubscriptions({
      subscriptions: {
        [MODIFY_TOURNAMENT_DETAIL]: (notices: any[]) => notices.forEach(() => topics.push(MODIFY_TOURNAMENT_DETAIL)),
        [MODIFY_DRAW_DEFINITION]: (notices: any[]) => notices.forEach(() => topics.push(MODIFY_DRAW_DEFINITION)),
      },
    });

    const first: any = tournamentEngine.addMutationLock({ drawId, scope: 'DRAWS', lockToken: 'token-1' });
    expect(first.success).toEqual(true);
    expect(topics.toSorted()).toEqual([MODIFY_DRAW_DEFINITION, MODIFY_TOURNAMENT_DETAIL]);

    // the gate is already enabled: a second draw lock changes only the draw
    topics.length = 0;
    const second: any = tournamentEngine.addMutationLock({ drawId, scope: 'SCORING', lockToken: 'token-2' });
    expect(second.success).toEqual(true);
    expect(topics).toEqual([MODIFY_DRAW_DEFINITION]);
  });
});

describe('modifyMatchUpFormatTiming with an eventId, called with several records', () => {
  // called directly: through an engine the parameter middleware resolves the eventId (or refuses) before the method runs
  const averageTimes = [{ categoryTypes: [JUNIOR], minutes: { default: 127 } }];

  function twoRecords() {
    const {
      tournamentRecord: withEvent,
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({ eventProfiles: [{ eventName: 'E' }] });
    const { tournamentRecord: without } = mocksEngine.generateTournamentRecord();
    const tournamentRecords = { [withEvent.tournamentId]: withEvent, [without.tournamentId]: without };
    return { eventId, withEvent, without, tournamentRecords };
  }

  it('writes only the record that holds the event', () => {
    const { eventId, without, tournamentRecords } = twoRecords();
    const before = structuredClone(without);

    const result: any = modifyMatchUpFormatTiming({
      matchUpFormat: FORMAT_STANDARD,
      tournamentRecords,
      averageTimes,
      eventId,
    });
    expect(result.success).toEqual(true);
    expect(without).toEqual(before);
  });

  it('an event found in no record is refused, and no record is written', () => {
    const { withEvent, without, tournamentRecords } = twoRecords();
    const before = structuredClone([withEvent, without]);

    const result: any = modifyMatchUpFormatTiming({
      matchUpFormat: FORMAT_STANDARD,
      eventId: 'no-such-event',
      tournamentRecords,
      averageTimes,
    });
    expect(result.error).toEqual(EVENT_NOT_FOUND);
    expect([withEvent, without]).toEqual(before);
  });
});
