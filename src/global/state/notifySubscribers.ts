import { callListener, getNotices, getTopics } from './globalState';

import {
  ADD_DRAW_DEFINITION,
  ADD_MATCHUPS,
  DELETE_PARTICIPANTS,
  DELETE_VENUE,
  DELETED_DRAW_IDS,
  DELETED_MATCHUP_IDS,
  MODIFY_DRAW_DEFINITION,
  MODIFY_DRAW_ENTRIES,
  MODIFY_EVENT_ENTRIES,
  MODIFY_MATCHUP,
  MODIFY_PARTICIPANTS,
  MODIFY_POSITION_ASSIGNMENTS,
  MODIFY_SEED_ASSIGNMENTS,
  MODIFY_VENUE,
  UNPUBLISH_EVENT_SEEDING,
  UNPUBLISH_EVENT,
  UNPUBLISH_ORDER_OF_PLAY,
  UNPUBLISH_TOURNAMENT,
  MUTATIONS,
  UPDATE_INCONTEXT_MATCHUP,
} from '@Constants/topicConstants';

type NotifySubscribersArgs = {
  mutationStatus?: any;
  tournamentId?: string;
  directives?: any[];
  timeStamp?: any;
};

export function notifySubscribers(params?: NotifySubscribersArgs) {
  const { mutationStatus, tournamentId, directives, timeStamp } = params ?? {};

  const { topics } = getTopics();

  for (const topic of [...topics].sort(topicSort)) {
    const notices = getNotices({ topic });
    if (notices?.length) callListener({ topic, notices });
  }

  if (mutationStatus && timeStamp && topics.includes(MUTATIONS)) {
    callListener({
      notices: [{ tournamentId, directives, timeStamp }],
      topic: MUTATIONS,
    });
  }
}

export async function notifySubscribersAsync(params?: NotifySubscribersArgs) {
  const { mutationStatus, tournamentId, directives, timeStamp } = params ?? {};
  const { topics } = getTopics();

  for (const topic of [...topics].sort(topicSort)) {
    // only tested with packaged version of factory
    // won't show up in test coverage
    const notices = getNotices({ topic });
    if (notices) await callListener({ topic, notices });
  }

  if (mutationStatus && timeStamp && topics.includes(MUTATIONS)) {
    callListener({
      notices: [{ tournamentId, directives, timeStamp }],
      topic: MUTATIONS,
    });
  }
}

const topicValues = {
  [UNPUBLISH_EVENT_SEEDING]: 5,
  [UNPUBLISH_EVENT]: 5,
  [UNPUBLISH_ORDER_OF_PLAY]: 5,
  [MODIFY_SEED_ASSIGNMENTS]: 5,
  [MODIFY_POSITION_ASSIGNMENTS]: 5,
  [MODIFY_DRAW_DEFINITION]: 5,
  [MODIFY_DRAW_ENTRIES]: 5,
  [MODIFY_EVENT_ENTRIES]: 5,
  [UNPUBLISH_TOURNAMENT]: 1,
  [MODIFY_MATCHUP]: 1,
  [UPDATE_INCONTEXT_MATCHUP]: 1,
  [MODIFY_PARTICIPANTS]: 5,
  [MODIFY_VENUE]: 5,
  [DELETED_MATCHUP_IDS]: 4,
  [DELETE_PARTICIPANTS]: 4,
  [DELETE_VENUE]: 4,
  [DELETED_DRAW_IDS]: 4,
  [ADD_MATCHUPS]: 3,
  [ADD_DRAW_DEFINITION]: 2,
};

function topicSort(a, b) {
  return (topicValues[b] || 0) - (topicValues[a] || 0);
}
