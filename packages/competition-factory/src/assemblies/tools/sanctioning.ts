/**
 * Sanctioning functions over a sanctioning record the caller holds: they take one params object and read no state
 * (confirmed stateless by the statelessGovernorTools test). A domain of their own: the 8.0.0 plan
 * makes sanctioning a separate package. `sanctioningGovernor` keeps them in 7.x, on `sanctioningEngine` and the
 * tournament engines; their engine routes are unchanged.
 */
export { validateStatusTransition } from '@Validators/sanctioning/validateStatusTransition';
export { querySanctioningRecord } from '@Query/sanctioning/getSanctioningRecord';
