import {
  cycleModifiedTournamentIds,
  cycleModifiedTopics,
  clearMutationStatus,
  markModified,
} from '@Global/state/globalState';
import { withDraftWrites } from '@Global/state/withDraftWrites';
import { afterEach, expect, it } from 'vitest';

// constants
import { UNANNOUNCED_WRITE, UNNAMED_TOURNAMENT } from '@Global/state/noticeIdentity';

/**
 * A DRAFT'S WRITES NAME NO TOURNAMENT AS MODIFIED. `withDraftWrites` put the modified flag back and left the
 * tournaments and topics the draft marked: a draft names no tournament, so it left `UNNAMED_TOURNAMENT`, which
 * `getMutationStatus` reads as every loaded record. An enclosing call that wrote one record then stamped them all, and
 * the mark stood before or after the call's own by where the draft ran in it.
 */
afterEach(() => void clearMutationStatus());

const marks = () => ({
  tournamentIds: [...(cycleModifiedTournamentIds() ?? [])],
  topics: [...(cycleModifiedTopics() ?? [])],
});

it('a draft that marks every record leaves no mark of its own', () => {
  clearMutationStatus();
  withDraftWrites(() => markModified());
  expect(marks()).toEqual({ tournamentIds: [], topics: [] });
});

it('the marks an enclosing call made before a draft stand as they were, in their order', () => {
  clearMutationStatus();
  markModified('t2', 'modifyMatchUp');
  markModified('t1', 'modifyDrawDefinition');
  markModified('t1', 'modifyMatchUp');
  withDraftWrites(() => {
    markModified();
    markModified('t0', 'addMatchUps');
  });
  expect(marks()).toEqual({ tournamentIds: ['t2', 't1'], topics: ['modifyMatchUp', 'modifyDrawDefinition'] });
});

it('an unnamed mark an enclosing call made itself is kept', () => {
  clearMutationStatus();
  markModified();
  markModified('t1', 'modifyMatchUp');
  withDraftWrites(() => markModified('t0', 'addMatchUps'));
  expect(marks()).toEqual({
    tournamentIds: [UNNAMED_TOURNAMENT, 't1'],
    topics: [UNANNOUNCED_WRITE, 'modifyMatchUp'],
  });
});

it('a draft inside a draft discards both', () => {
  clearMutationStatus();
  markModified('t1', 'modifyMatchUp');
  withDraftWrites(() => {
    markModified();
    withDraftWrites(() => markModified('t0', 'addMatchUps'));
  });
  expect(marks()).toEqual({ tournamentIds: ['t1'], topics: ['modifyMatchUp'] });
});
