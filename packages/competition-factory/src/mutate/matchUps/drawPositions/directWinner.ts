/**
 * Re-export. The implementation moved to `drawPositionPlacement`, together with
 * `assignMatchUpDrawPosition` and `assignDrawPosition`: the three are mutually recursive and the
 * ring between them became a build-time circular dependency. See that file's header.
 */
export { directWinner } from './drawPositionPlacement';
