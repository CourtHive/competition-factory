import { reduce, serverOf, createContext } from '@Assemblies/engines/scoring/v2/reduce';

// types
import type { ScoringConfiguration, StepOutcome, TimelineEntry } from '@Assemblies/engines/scoring/v2/types';

/** what one timeline entry did: recorded, ignored (with its code), or refused (with its code; the message is prose) */
function outcomeOf(outcome: StepOutcome) {
  if (outcome.recorded) return 'recorded';
  if ('ignored' in outcome) return { ignored: outcome.ignored };
  return { refused: outcome.refused.code };
}

/**
 * The part of a reduction that is a rule (scoring-engine-spec.md § 12.1, `state = reduce(configuration, timeline)`):
 * what each entry did, and the score it left: the match's status and winner (§ 9), the sets as recorded (§ 1.2), the
 * game in play (§ 4.1, § 5), every materialized point (§ 11.1), and the side due to serve next with whether it was
 * derived (§ 10.4). How a reducer keeps its service orientation and its count of scoring entries is its own: both are
 * read only through what they decide here, so `kernel.scoring.reduce@1` compares this projection and nothing more.
 */
export function normativeReduction(configuration: ScoringConfiguration, timeline: TimelineEntry[]) {
  const { state, outcomes } = reduce(configuration, timeline);
  const context = createContext(configuration);
  return {
    outcomes: outcomes.map(outcomeOf),
    matchUpStatus: state.matchUpStatus,
    ...(state.winningSide ? { winningSide: state.winningSide } : {}),
    sets: state.sets,
    ...(state.game ? { game: state.game } : {}),
    points: state.points,
    ...(context.match ? { server: serverOf(context, state) } : {}),
  };
}
