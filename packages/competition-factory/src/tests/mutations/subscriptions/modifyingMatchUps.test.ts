import { printGlobalLog, purgeGlobalLog, pushGlobalLog } from '@Functions/global/globalLog';
import { setDevContext, setSubscriptions } from '@Global/state/globalState';
import { rgbColors } from '@Functions/global/logColors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { expect, it } from 'vitest';
import diff from 'variable-diff';
import chalk from 'chalk';

// constants
import { FEED_IN_CHAMPIONSHIP, MAIN } from '@Constants/drawDefinitionConstants';
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { ALTERNATE } from '@Constants/entryStatusConstants';
import { MODIFY_MATCHUP } from '@Constants/topicConstants';

const debug = false;
const debugLog = debug ? console.log : () => {};

let matchUpNotifications: any[] = [];
let notificationsCounter = 0;

const subscriptions = {
  [MODIFY_MATCHUP]: (results) => {
    matchUpNotifications.push(...results);
    notificationsCounter += 1;
  },
};
setSubscriptions({ subscriptions });

const separator = '------------------------------------------------';
let snapshots = {};

function snapshot(params) {
  const { name, compare, notifications, log, reset } = params;
  let matchUps;

  if (reset) snapshots = {};

  if (log && compare) {
    const [r, g, b] = rgbColors.pink;
    debugLog(chalk.rgb(r, g, b)('\r\n', separator));
    debugLog(chalk.yellowBright('comparing', chalk.cyan(compare), 'to', chalk.greenBright(name)));
    debugLog(chalk.rgb(r, g, b)(separator, '\r\n'));
  }

  if (!snapshots[name]) {
    matchUps = tournamentEngine.allTournamentMatchUps({
      inContext: false,
    }).matchUps;
    const matchUpsMap = makeDeepCopy(
      Object.assign({}, ...matchUps.map((matchUp) => ({ [matchUp.matchUpId]: matchUp }))),
    );

    snapshots[name] = matchUpsMap;
  } else {
    matchUps = Object.values(snapshots[name]);
  }

  const changedMatchUpIds: string[] =
    compare &&
    snapshots[compare] &&
    Object.values(snapshots[name])
      .filter((matchUp: any) => JSON.stringify(matchUp) !== JSON.stringify(snapshots[compare][matchUp.matchUpId]))
      .map((m: any) => m.matchUpId);

  const notificationMap =
    notifications &&
    Object.assign(
      {},
      ...notifications.map((notification) => ({
        [notification.matchUp.matchUpId]: notification,
      })),
    );

  const comparison = changedMatchUpIds?.map((matchUpId) => {
    const result = diff(snapshots[compare][matchUpId], snapshots[name][matchUpId]);
    return { matchUpId, ...result };
  });

  const matchUpIdNotifications = notifications && Object.keys(notificationMap);

  const excessNotifications = matchUpIdNotifications?.filter((matchUpId) => !changedMatchUpIds?.includes(matchUpId));
  const missingNotifications = changedMatchUpIds?.filter((matchUpId) => !matchUpIdNotifications?.includes(matchUpId));

  if (log && comparison) {
    const [r, g, b] = rgbColors.tomato;
    comparison.forEach(({ matchUpId, text }) => {
      if (missingNotifications?.includes(matchUpId)) {
        debugLog(chalk.blueBright('matchUpId', chalk.rgb(r, g, b)(matchUpId)));
      } else {
        debugLog(chalk.blueBright('matchUpId', chalk.cyan(matchUpId)));
      }
      debugLog(text);
      const context = notificationMap?.[matchUpId]?.context;
      if (context) debugLog(chalk.black.bgCyan('context', context, '\r\n'));
      const tournamentId = notificationMap?.[matchUpId]?.tournamentId;
      if (tournamentId) debugLog(chalk.black.bgYellow('tournamentId', tournamentId, '\r\n'));
    });
    if (excessNotifications?.length) {
      debugLog(chalk.yellow('excessNotifications:', excessNotifications));
    }
    if (missingNotifications?.length) {
      debugLog(chalk.red('missingNotifications:', chalk.rgb(r, g, b)(missingNotifications)));
    }
  }

  return {
    missingNotifications,
    excessNotifications,
    changedMatchUpIds,
    comparison,
    matchUps,
  };
}

// find pair of first round matchUps where one matchUp has a BYE
function findTarget({ drawId }) {
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);
  const mainStructureMatchUps = mainStructure.matchUps;
  const positionAssignments = mainStructure.positionAssignments;

  const mainFirstRound = mainStructureMatchUps.filter(({ roundNumber }) => roundNumber === 1);

  // targetMatchUp is the matchUp with a BYE which is paired with matchUp which is TO_BE_PLAYED in { roundNumber: 2 }
  const firstRoundNoBye = mainFirstRound.find(({ matchUpStatus }) => matchUpStatus === TO_BE_PLAYED);
  const isOdd = !!(firstRoundNoBye.roundPosition % 2);
  const targetRoundPosition = isOdd ? firstRoundNoBye.roundPosition + 1 : firstRoundNoBye.roundPosition - 1;
  const targetMatchUp = mainFirstRound.find(({ roundPosition }) => roundPosition === targetRoundPosition);

  // find the drawPosition which is a bye and get assign alternate options
  const { drawPositions } = targetMatchUp;
  const drawPosition = drawPositions.find((drawPosition) =>
    positionAssignments.find((assignment) => assignment.drawPosition === drawPosition && assignment.bye === true),
  );
  return { drawPosition, structureId: mainStructure.structureId };
}

const scenarios = [
  {
    drawProfile: {
      drawType: FEED_IN_CHAMPIONSHIP,
      participantsCount: 17,
      drawSize: 32,
    },
    expectations: { notificationsCount: 4 },
  },
  {
    drawProfile: {
      drawType: FEED_IN_CHAMPIONSHIP,
      participantsCount: 22,
      drawSize: 32,
    },
    expectations: { notificationsCount: 4 },
  },
  {
    drawProfile: {
      drawType: FEED_IN_CHAMPIONSHIP,
      participantsCount: 31,
      drawSize: 32,
    },
    expectations: { notificationsCount: 4 },
  },
];

it.each(scenarios)('triggers all expected events', ({ drawProfile, expectations }) => {
  purgeGlobalLog();
  const drawProfiles = [drawProfile];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  setDevContext(false);
  pushGlobalLog({ method: 'Undo', color: 'brightwhite' });
  matchUpNotifications = [];
  notificationsCounter = 0;

  // FIRST: get a snapshot of the initial condition
  let result: any = snapshot({ reset: true, name: 'start' });
  const matchUps = result.matchUps;

  expect(matchUps.length).toEqual(61);

  // SECOND: find matchUp part of four first round main which meet in second round...
  // ... where matchUp has BYE and is paired with matchUp containing two participants
  const { drawPosition, structureId } = findTarget({ drawId });

  // THIRD: get postiionActions for targetMatchup BYE position
  result = tournamentEngine.positionActions({
    drawPosition,
    structureId,
    drawId,
  });
  expect(result.isByePosition).toEqual(true);
  const alternateOption = result.validActions.find(({ type }) => type === ALTERNATE);
  let { method, payload } = alternateOption;
  const { availableAlternatesParticipantIds } = alternateOption;
  const alternateParticipantId = availableAlternatesParticipantIds[0];
  Object.assign(payload, { alternateParticipantId });

  // FOURTH: assign an alternate to the position where bye exists
  pushGlobalLog({ method: 'Assign Alternate', color: 'brightmagenta' });
  result = tournamentEngine[method](payload);
  expect(result.success).toEqual(true);

  // check notifications
  expect(notificationsCounter).toEqual(1);
  expect(matchUpNotifications.length).toEqual(expectations.notificationsCount);

  // FIFTH: take a snapshot of the data and compare
  snapshot({
    notifications: matchUpNotifications,
    name: 'alternatePlaced',
    compare: 'start',
    log: true,
  });

  // SIXTH: reset notifications and get updated positionActions
  matchUpNotifications = [];
  result = tournamentEngine.positionActions({
    drawPosition,
    structureId,
    drawId,
  });
  const byeOption = result.validActions.find(({ type }) => type === BYE);
  ({ method, payload } = byeOption);

  // SEVENTH: re-assign a BYE to the target drawPosition
  pushGlobalLog({ method: 'Assign Bye', color: 'brightmagenta' });
  result = tournamentEngine[method](payload);
  expect(result.success).toEqual(true);

  expect(matchUpNotifications.length).toEqual(expectations.notificationsCount);

  // EIGHTH: take snapshot and compare
  snapshot({
    notifications: matchUpNotifications,
    compare: 'alternatePlaced',
    name: 'byeRestored',
    log: true,
  });

  // NINTH: take snapshot and compare initial condition to final condition; expect equivalence
  snapshot({
    compare: 'start',
    name: 'byeRestored',
    log: true,
  });

  printGlobalLog();
});
