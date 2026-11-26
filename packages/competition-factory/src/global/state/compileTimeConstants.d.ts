/**
 * Compile-time constants. Each is replaced with a literal before bundling, so the code it guards is
 * eliminated where it is false.
 *
 * `__NOTICE_PAYLOAD_DIAGNOSTICS__`: the read-only notice payload detector (noticePayloadAudit.ts).
 * - `false` in every published bundle (rollup.config.mjs)
 * - `true` in the test suite under NOTICE_PAYLOAD_WRITE_CHECK=1 (vitest.config.mts) and in the standalone
 *   audit build (`pnpm build:notice-diagnostics`)
 * A guard reads it in a statement of its own (`if (__NOTICE_PAYLOAD_DIAGNOSTICS__) ...`), so removing the
 * statement leaves the published code exactly as it was without one.
 */
declare const __NOTICE_PAYLOAD_DIAGNOSTICS__: boolean;
