/**
 * Ladder vocabulary. See Mentat `planning/LADDER_COMPETITION_MODEL.md`.
 *
 * Every value here varies by club, which is why they are policy data rather than behaviour: a
 * ladder implementation that hardcodes any of them is wrong for the next club.
 */

/**
 * What produces the standing.
 *
 * `RANK` is the traditional ladder: `positionAssignments` are the source of truth and a completed
 * challenge mutates them. `RATING` derives the order from each participant's rating scale instead —
 * and under it NONE of the movement machinery runs, because the ordering already IS the scale.
 * `positionAssignments` becomes a projection rather than the source of truth.
 */
export const RANK = 'RANK';
export const RATING = 'RATING';
export const ladderOrderings = [RANK, RATING] as const;
export type LadderOrdering = (typeof ladderOrderings)[number];

/**
 * How a challenger's win rearranges the standing. Both are common and they are materially
 * different competitions:
 *
 * `SWAP`      — the two exchange positions. Nobody else moves.
 * `INSERTION` — the winner takes the defender's position and the defender, plus everyone between,
 *               shifts down one. A challenger who wins from far below displaces a whole run.
 */
export const SWAP = 'SWAP';
export const INSERTION = 'INSERTION';
export const ladderMovements = [SWAP, INSERTION] as const;
export type LadderMovement = (typeof ladderMovements)[number];

/** A challenge range of `ANY` means a participant may challenge anyone above them. */
export const ANY = 'ANY';

export const ladderConstants = { ANY, INSERTION, RANK, RATING, SWAP } as const;

/**
 * The lifecycle of a challenge, as observed rather than stored.
 *
 * `PENDING` and `EXPIRED` are the SAME stored matchUp — `CHALLENGED` — distinguished only by the
 * instant you ask. Storing "expired" would mean something has to run at the moment of expiry, and
 * nothing does; deriving it means the answer is correct whenever it is asked.
 */
export const PENDING = 'PENDING';
export const EXPIRED = 'EXPIRED';
export const ACCEPTED = 'ACCEPTED';
export const DECLINED = 'DECLINED';
export const challengeStates = [PENDING, EXPIRED, ACCEPTED, DECLINED] as const;
export type ChallengeState = (typeof challengeStates)[number];

/** `timeItem.itemType` values recording what happened to a challenge, and when. */
export const CHALLENGE_ISSUED = 'ladder.challenge.issued';
export const CHALLENGE_ACCEPTED = 'ladder.challenge.accepted';
export const CHALLENGE_DECLINED = 'ladder.challenge.declined';

/** An operator removed a participant by hand — see `removeLadderParticipant`. */
export const LADDER_PARTICIPANT_REMOVED = 'ladder.participant.removed';

/**
 * Who may turn a submitted score into a result.
 *
 * `PEER` — the opponent accepting IS the validation.
 * `OPERATOR` — only a tournament director may validate.
 * `EITHER` — whichever comes first.
 */
export const PEER = 'PEER';
export const OPERATOR = 'OPERATOR';
export const EITHER = 'EITHER';
export const resultValidations = [PEER, OPERATOR, EITHER] as const;
export type ResultValidation = (typeof resultValidations)[number];

/** `timeItem.itemType` values recording who said what about a score. */
export const RESULT_SUBMITTED = 'ladder.result.submitted';
export const RESULT_CONFIRMED = 'ladder.result.confirmed';
export const RESULT_DISPUTED = 'ladder.result.disputed';

/**
 * Why a standing moved. A movement must name its trigger, so that "a score exists" can never be
 * mistaken for "a result was agreed".
 */
export const RESULT = 'RESULT';
export const FORFEIT = 'FORFEIT';
export const movementTriggers = [RESULT, FORFEIT] as const;
export type MovementTrigger = (typeof movementTriggers)[number];

/**
 * Ways of failing the people below you. Declining, ignoring and not turning up are the same
 * offence from the challenger's side, which is why they share one counter.
 */
export const DECLINE = 'DECLINE';
export const EXPIRY = 'EXPIRY';
export const UNPLAYED = 'UNPLAYED';
export const lapseKinds = [DECLINE, EXPIRY, UNPLAYED] as const;
export type LapseKind = (typeof lapseKinds)[number];

/** How far back lapses are counted. */
export const SEASON = 'SEASON';
export const ROLLING = 'ROLLING';
export const CONSECUTIVE = 'CONSECUTIVE';
export const lapseWindows = [SEASON, ROLLING, CONSECUTIVE] as const;
export type LapseWindow = (typeof lapseWindows)[number];

/** What crossing the allowance costs. */
export const FORFEIT_POSITION = 'FORFEIT_POSITION';
export const DROP = 'DROP';
export const REMOVE = 'REMOVE';
export const lapseConsequences = [FORFEIT_POSITION, DROP, REMOVE] as const;
export type LapseConsequence = (typeof lapseConsequences)[number];
