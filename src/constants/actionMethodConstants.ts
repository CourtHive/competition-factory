/**
 * Every engine method name carried on the actions returned by `positionActions()`
 * and `matchUpActions()`, enumerated in one place.
 *
 * WHY THIS EXISTS — it is an internal invariant anchor first, a public export second.
 *
 * Each action looks like `{ type, method, payload, … }`, where `method` names the
 * engine method a consumer will invoke. Nothing previously tied those strings to the
 * engine surface: rename an engine method and the actions keep emitting the old name,
 * with the failure surfacing at consumer dispatch time as "method not found" — in
 * someone else's codebase. Typing this aggregate as `Record<string, FactoryEngineMethod>`
 * against the generated method union turns that into a compile error here instead.
 *
 * Being exported is a side benefit, NOT the justification. No consumer in the
 * CourtHive ecosystem branches on `action.method` — they forward it verbatim
 * (`{ method: action.method, params: action.payload }`), and code that needs to
 * branch on an action keys off `action.type`, which `positionActionConstants` /
 * `matchUpActionConstants` already expose. External CODES implementers may still
 * find it useful, which is why it stays exported.
 *
 * Grouped here rather than folded into those two objects because they answer a
 * different question: they carry action *identities* (`ASSIGN_PARTICIPANT`), this
 * carries the engine *method* to call for one (`ASSIGN_PARTICIPANT_METHOD`). The
 * constants stay declared next to their actions and are only aggregated here.
 *
 * `src/tests/constants/actionMethodConformance.test.ts` keeps the enumeration
 * complete — without it, a newly added action method would simply never reach this
 * object and the type check above would silently stop covering it.
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

import { FactoryEngineMethod } from '@Types/factoryEngineMethods';

export const actionMethodConstants: Record<string, FactoryEngineMethod> = {
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
