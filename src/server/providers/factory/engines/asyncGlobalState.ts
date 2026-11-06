/**
 * The dev server's async state provider is the published example implementation.
 * It lives in `src/examples/asyncEngine` because the shipped bundle exports it, and shipped
 * code must not import from the dev server.
 */
export { default } from '../../../../examples/asyncEngine/asyncGlobalState';
