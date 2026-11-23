/**
 * Test files a second backend (FACTORY_BACKEND) is not routed to, each with its reason: the file runs on this engine
 * alone, and the report names it. A file belongs here only when what it tests cannot reach another process, such as a
 * mock of the factory's own modules, never because a second implementation answers it differently.
 */
export const BACKEND_EXCLUSIONS: { file: string; reason: string }[] = [
  {
    file: 'src/tests/mutations/scheduling/vNext/playedOrderGuard.test.ts',
    reason: "mocks the planner's played-order gate (vi.mock): another implementation cannot see a mock",
  },
];
