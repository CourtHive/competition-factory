/**
 * Engine method names carried on the actions returned by `positionActions()` and
 * `matchUpActions()`.
 *
 * Each action a consumer receives looks like `{ type, method, payload, … }`, where
 * `method` is the name of the engine method to invoke — `'assignDrawPosition'`,
 * `'addPenalty'`, and so on. That makes these values part of the consumer contract,
 * not internal detail: a client that renders available actions has to be able to
 * recognise and dispatch them.
 *
 * They are grouped here rather than folded into `positionActionConstants` /
 * `matchUpActionConstants` because they answer a different question. Those objects
 * carry action *identities* (`ASSIGN_PARTICIPANT`); these carry the engine *method*
 * to call for one (`ASSIGN_PARTICIPANT_METHOD`). Keeping the boundary explicit also
 * keeps each source module's action/method pairing intact — the constants are still
 * declared next to their actions and only aggregated here.
 *
 * Guarded by `src/tests/constants/actionMethodConformance.test.ts`, which fails if
 * any identifier emitted as a `method:` field under `src/query/` is not reachable on
 * an exported constants object.
 */
import {
  ASSIGN_SIDE_METHOD,
  ASSIGN_TEAM_POSITION_METHOD,
  REMOVE_SIDE_METHOD,
  REMOVE_TEAM_POSITION_METHOD,
  REPLACE_TEAM_POSITION_METHOD,
  SCHEDULE_METHOD,
  SUBSTITUTION_METHOD,
} from './matchUpActionConstants';
import {
  ADD_NICKNAME_METHOD,
  ADD_PENALTY_METHOD,
  ALTERNATE_PARTICIPANT_METHOD,
  ASSIGN_BYE_METHOD,
  ASSIGN_PARTICIPANT_METHOD,
  LUCKY_PARTICIPANT_METHOD,
  MODIFY_PAIR_ASSIGNMENT_METHOD,
  QUALIFYING_PARTICIPANT_METHOD,
  REMOVE_ASSIGNMENT_METHOD,
  REMOVE_SEED_METHOD,
  SEED_CASCADE_METHOD,
  SEED_VALUE_METHOD,
  SWAP_ADHOC_PARTICIPANT_METHOD,
  SWAP_PARTICIPANT_METHOD,
  WITHDRAW_PARTICIPANT_METHOD,
} from './positionActionConstants';

export const actionMethodConstants = {
  // position actions
  ADD_NICKNAME_METHOD,
  ADD_PENALTY_METHOD,
  ALTERNATE_PARTICIPANT_METHOD,
  ASSIGN_BYE_METHOD,
  ASSIGN_PARTICIPANT_METHOD,
  LUCKY_PARTICIPANT_METHOD,
  MODIFY_PAIR_ASSIGNMENT_METHOD,
  QUALIFYING_PARTICIPANT_METHOD,
  REMOVE_ASSIGNMENT_METHOD,
  REMOVE_SEED_METHOD,
  SEED_CASCADE_METHOD,
  SEED_VALUE_METHOD,
  SWAP_ADHOC_PARTICIPANT_METHOD,
  SWAP_PARTICIPANT_METHOD,
  WITHDRAW_PARTICIPANT_METHOD,

  // matchUp actions
  ASSIGN_SIDE_METHOD,
  ASSIGN_TEAM_POSITION_METHOD,
  REMOVE_SIDE_METHOD,
  REMOVE_TEAM_POSITION_METHOD,
  REPLACE_TEAM_POSITION_METHOD,
  SCHEDULE_METHOD,
  SUBSTITUTION_METHOD,
};

export default actionMethodConstants;
