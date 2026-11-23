import { UNGROUPED, UNPAIRED } from '@Constants/entryStatusConstants';

export function isUngrouped(entryStatus) {
  return [UNPAIRED, UNGROUPED].includes(entryStatus);
}
