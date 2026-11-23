/**
 * The dev server's async state provider is the example implementation in `src/examples/asyncEngine`.
 * The package does not export it: a server copies it (see the hosting guide). It lives outside the dev
 * server so that shipped code and tests can use it without importing from the dev server.
 */
export { default } from '../../../../examples/asyncEngine/asyncGlobalState';
