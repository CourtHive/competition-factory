/**
 * Officiating functions over an official record the caller holds: they take one params object and read no state
 * (confirmed stateless, Mentat FACTORY_ENGINE_API_MIGRATION_PREP_PLAN slice A). A domain of their own: the 8.0.0 plan
 * makes officiating a separate package. `officiatingGovernor` keeps them in 7.x, on `officiatingEngine` and the
 * tournament engines; their engine routes are unchanged.
 */
export { validateOfficiatingStatusTransition } from '@Validators/officiating/validateOfficiatingStatusTransition';
export { queryOfficialRecord } from '@Query/officiating/getOfficialRecord';
