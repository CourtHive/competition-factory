import { DOUBLES, HYBRID, SINGLES, TEAM } from '@Constants/matchUpTypes';

export const matchUpEventTypeMap = {
  [SINGLES]: [SINGLES, 'S'],
  [DOUBLES]: [DOUBLES, 'D'],
  [TEAM]: [TEAM, 'T'],
  [HYBRID]: [HYBRID, 'H'],
  S: [SINGLES, 'S'],
  D: [DOUBLES, 'D'],
  T: [TEAM, 'T'],
  H: [HYBRID, 'H'],
};
