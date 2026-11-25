import {
  buildSideExitProvenance,
  mergeSideExitProvenance,
  retainPolicyCodes,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { matchUpsOf, positionAssignmentsOf } from '@Helpers/drawTopology/structureMembers';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { announceNestedScore, nestedDraft, openNestedTarget, plainNestedPrefix } from './nestedDraft';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';

import { BYE, DEFAULTED, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { CONSOLATION, FIRST_ROUND_LOSER_CONSOLATION, LOSER, MAIN, TOP_DOWN } from '@Constants/drawDefinitionConstants';
import type { DrawDefinition, MatchUp } from '@Types/tournamentTypes';
import type { BuildViewArgs, OutcomeView, RecordCopy } from '../types';
import type { OutcomeOp } from '../ops';

function convergingFinals(draw: DrawDefinition, view: OutcomeView, id: string) {
  const main = draw.structures?.find((s) => s.stage === MAIN);
  const consolation = draw.structures?.find((s) => s.stage === CONSOLATION);
  const link = draw.links?.[0];
  if (
    !main ||
    !consolation ||
    draw.structures?.length !== 2 ||
    draw.links?.length !== 1 ||
    link?.linkType !== LOSER ||
    link.source?.structureId !== main.structureId ||
    link.source.roundNumber !== 1 ||
    link.target?.structureId !== consolation.structureId ||
    link.target.roundNumber !== 1 ||
    link.target.feedProfile !== TOP_DOWN ||
    link.linkCondition ||
    !view.targets.loserTargetSeat?.free
  )
    return;
  const mainMatches = matchUpsOf(main) ?? [],
    matches = matchUpsOf(consolation) ?? [];
  const source = mainMatches.find((m) => m.matchUpId === id);
  const pending = mainMatches.find((m) => m.matchUpId === source?.winnerMatchUpId);
  const final = mainMatches.find((m) => m.matchUpId === pending?.winnerMatchUpId);
  const paired = mainMatches.find((m) => m !== source && m.winnerMatchUpId === pending?.matchUpId);
  const loser = matches.find((m) => m.matchUpId === source?.loserMatchUpId);
  const held = matches.find((m) => m.matchUpId === loser?.winnerMatchUpId);
  if (
    !source ||
    !pending ||
    !final ||
    !paired ||
    !loser ||
    !held ||
    !openNestedTarget(source) ||
    !openNestedTarget(final) ||
    !openNestedTarget(pending)
  )
    return;
  const carried = held.sideExitProvenance?.[1];
  const carrier = mainMatches.find((m) => m.matchUpId === carried?.sourceMatchUpId);
  const bye = matches.find((m) => m.matchUpId === carrier?.loserMatchUpId);
  if (
    !source.roundPosition ||
    source.roundPosition % 2 ||
    source.roundNumber !== 1 ||
    !loser.roundPosition ||
    loser.roundPosition % 2 ||
    final.winnerMatchUpId ||
    final.loserMatchUpId ||
    held.winnerMatchUpId ||
    held.loserMatchUpId ||
    pending.loserMatchUpId ||
    final.drawPositions?.length !== 0 ||
    pending.drawPositions?.length !== 1 ||
    paired.matchUpStatus !== DEFAULTED ||
    paired.winningSide !== 1 ||
    paired.loserMatchUpId !== loser.matchUpId ||
    paired.drawPositions?.[0] !== pending.drawPositions[0] ||
    loser.drawPositions?.length !== 2 ||
    loser.drawPositions[1] !== view.targets.loserTargetDrawPosition ||
    loser.sideExitProvenance?.[1]?.sourceMatchUpId !== paired.matchUpId ||
    loser.sideExitProvenance[1].matchUpStatus !== DEFAULTED ||
    loser.sideExitProvenance[1].previousMatchUpStatus !== DEFAULTED ||
    loser.sideExitProvenance[2] ||
    loser.winningSide !== 2 ||
    loser.matchUpStatus !== DEFAULTED ||
    held.drawPositions?.length !== 1 ||
    held.matchUpStatus !== WALKOVER ||
    held.winningSide !== 2 ||
    held.sideExitProvenance?.[2] ||
    carried?.matchUpStatus !== WALKOVER ||
    carried.previousMatchUpStatus !== WALKOVER ||
    carrier?.matchUpStatus !== WALKOVER ||
    !carrier.winningSide ||
    bye?.matchUpStatus !== BYE ||
    bye.winnerMatchUpId !== held.matchUpId ||
    [held, loser].some((m) => m.matchUpStatusCode || m.sideStatusCodes || m.matchUpStatusCodes?.length || m.tieMatchUps)
  )
    return;
  const assignments = positionAssignmentsOf(consolation);
  const holder = (position: number) => assignments?.find((a) => a.drawPosition === position);
  if (!holder(held.drawPositions[0])?.participantId || !holder(loser.drawPositions[0])?.participantId) return;
  return { source, pending, final, paired, loser, held, advancing: pending.drawPositions[0] };
}

type Finals = NonNullable<ReturnType<typeof convergingFinals>>;

function scoreCarried(copy: RecordCopy, matchUp: MatchUp, source: MatchUp, paired?: MatchUp) {
  const provenance = matchUp.sideExitProvenance,
    format = matchUp.matchUpFormat,
    codes = retainPolicyCodes(matchUp);
  // The native reset shares the clear-score fixture with the entry point and the other two exit writes.
  Object.assign(matchUp, toBePlayed);
  if (provenance) matchUp.sideExitProvenance = provenance;
  if (format) matchUp.matchUpFormat = format;
  matchUp.matchUpStatus = paired ? WALKOVER : DOUBLE_WALKOVER;
  delete matchUp.orderOfFinish;
  matchUp.matchUpStatusCodes = codes;
  delete matchUp.matchUpStatusCode;
  delete matchUp.sideStatusCodes;
  if (paired) matchUp.winningSide = 1;
  announceNestedScore(copy, matchUp);
  mergeSideExitProvenance({
    matchUp,
    provenance: buildSideExitProvenance({
      sourceMatchUpId: source.matchUpId,
      sourceMatchUpStatus: DOUBLE_WALKOVER,
      sourceSideNumber: 2,
      pairedMatchUpId: paired?.matchUpId,
      pairedMatchUpStatus: paired?.matchUpStatus,
    }),
  });
}

function applyConvergence(copy: RecordCopy, r: Finals) {
  scoreCarried(copy, r.loser, r.source);
  scoreCarried(copy, r.held, r.loser);
  scoreCarried(copy, r.pending, r.source, r.paired);
  r.final.drawPositions = [r.advancing];
  r.final.winningSide = undefined;
  modifyMatchUpNotice({ drawDefinition: copy.drawDefinition, matchUp: r.final, context: 'assignMatchUpDrawPosition' });
  return { matches: [r.loser, r.held, r.pending, r.final] };
}

export function nestedCarriedConvergence(args: BuildViewArgs, view: OutcomeView, prefix: OutcomeOp[]) {
  const draw = args.drawDefinition,
    id = args.request.matchUpId;
  if (
    !draw ||
    !id ||
    draw.drawType !== FIRST_ROUND_LOSER_CONSOLATION ||
    args.request.matchUpStatus !== DOUBLE_WALKOVER ||
    !args.request.flags.propagateExitStatus ||
    !plainNestedPrefix(args, view, prefix)
  )
    return;
  const seats = convergingFinals(draw, view, id);
  return seats && nestedDraft(args, draw, prefix, seats, applyConvergence);
}
