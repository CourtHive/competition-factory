// Legacy entrypoint — re-exports the current (2026) USTA Junior policy
// for back-compat with consumers importing the un-versioned name.
// Prefer importing from the dated fixture (POLICY_RANKING_POINTS_USTA_JUNIOR_2026
// or POLICY_RANKING_POINTS_USTA_JUNIOR_2025) for new code.
export { POLICY_RANKING_POINTS_USTA_JUNIOR_2026 as POLICY_RANKING_POINTS_USTA_JUNIOR } from './POLICY_RANKING_POINTS_USTA_JUNIOR_2026';
