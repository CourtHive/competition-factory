/**
 * Re-export. The implementation moved into `addTimeItem`, with which it is mutually recursive — a
 * time item may be promoted to a first-class field, and writing a first-class field falls back to a
 * time item. That ring was a build-time circular dependency. See that file's header.
 */
export { appendFirstClassOrTimeItem } from './addTimeItem';
