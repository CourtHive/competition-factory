# Changelog

## [3.4.3](https://github.com/CourtHive/competition-factory/compare/v3.4.2...v3.4.3) (2026-05-12)


### Bug Fixes

* **scheduling:** default to POLICY_SCHEDULING_DEFAULT + parse timed formats ([bc37974](https://github.com/CourtHive/competition-factory/commit/bc3797498c4472834ab5bbec0741e22f82c02237))


### Documentation

* **policies:** document withCompetitiveness + inContext:false path ([596995b](https://github.com/CourtHive/competition-factory/commit/596995b567a46856bbeb43ad96d607a234114919))

## [3.4.2](https://github.com/CourtHive/competition-factory/compare/v3.4.1...v3.4.2) (2026-05-09)


### Bug Fixes

* **.npmrc:** rename confirmModulesPurge to confirm-modules-purge ([7bd7e5d](https://github.com/CourtHive/competition-factory/commit/7bd7e5d80de6d65dcd1763f7cd3e1082c8932248))
* **documentation:** unblock pnpm 11 install + Docusaurus build ([eeb9009](https://github.com/CourtHive/competition-factory/commit/eeb9009398c8f6257aca2b70f0226b3b43672aed))

## [3.4.1](https://github.com/CourtHive/competition-factory/compare/v3.4.0...v3.4.1) (2026-05-06)


### Bug Fixes

* **query:** correct polarity in getPredictiveAccuracy ([16815ad](https://github.com/CourtHive/competition-factory/commit/16815ad31d6edaf24f55e799aad401e6caabd97e))
* **query:** correct tiebreak polarity in getCompetitionLeaderboard + cover gaps ([334679b](https://github.com/CourtHive/competition-factory/commit/334679b6505045b541cacee75fe403049b5d7e59))

## [3.4.0](https://github.com/CourtHive/competition-factory/compare/v3.3.1...v3.4.0) (2026-05-05)


### Features

* **format-wizard:** integer match counts, FEED_IN, voluntary consolation, flighting caps ([0cd61da](https://github.com/CourtHive/competition-factory/commit/0cd61daf0fb38a7a55def807d3c36aa8feaab131))
* **query:** :sparkles: enrich matchUps with competitiveProfile without inContext hydration ([997730c](https://github.com/CourtHive/competition-factory/commit/997730c24967166edf8361652ebb235bad5d1df7))
* **query:** predictCompetitiveBands for level-based format wizard ([b512280](https://github.com/CourtHive/competition-factory/commit/b51228091e593aad5e70a35410a9c3d8df18d8b4))
* **query:** suggestFormatPlans engine for level-based format wizard ([557eed2](https://github.com/CourtHive/competition-factory/commit/557eed2c170e046db730c07a2d81647083a90fc5))


### Bug Fixes

* **scheduler:** persist scheduledDate separately in jinnScheduler ([22af38c](https://github.com/CourtHive/competition-factory/commit/22af38cf88db9b4de16a0f3d02d3c3a1e5c69af5))


### Documentation

* **format-wizard:** introduce concept category with engine doc + stubs ([9ee9de9](https://github.com/CourtHive/competition-factory/commit/9ee9de951d49aea85d6e3669bf907bad171c2f70))

## [3.3.1](https://github.com/CourtHive/competition-factory/compare/v3.3.0...v3.3.1) (2026-05-03)


### Bug Fixes

* **reports:** handle walkover outcomes in competitiveness Spread % ([5b9078c](https://github.com/CourtHive/competition-factory/commit/5b9078c870b7fc64501e0d6598dd7bf11a1c8ddf))

## [3.3.0](https://github.com/CourtHive/competition-factory/compare/v3.2.3...v3.3.0) (2026-05-02)


### Features

* **constants:** add POLICY_TYPE_PRINT + default fixture ([cde627e](https://github.com/CourtHive/competition-factory/commit/cde627e6e60473f25514dcd77feb769669bbcca5))


### Bug Fixes

* **deps:** update dependency courthive-components to v1.1.1 ([#4292](https://github.com/CourtHive/competition-factory/issues/4292)) ([3149f75](https://github.com/CourtHive/competition-factory/commit/3149f75d4705a7abee5ab9cfbe85c88d0470fa74))
* **deps:** update docusaurus monorepo to v3.10.1 ([#4290](https://github.com/CourtHive/competition-factory/issues/4290)) ([e0c1fc9](https://github.com/CourtHive/competition-factory/commit/e0c1fc963e5b9f7d393f17c6a4c74d287d45c8cc))


### Documentation

* **policies:** add Print Policy reference page ([2021dcb](https://github.com/CourtHive/competition-factory/commit/2021dcb5bc0c286677004e2ff6f9a8c01b098a92))
* **policies:** rewrite Print Policy to stand alone ([d9a52c9](https://github.com/CourtHive/competition-factory/commit/d9a52c97fa52b9b5151bf3c04cb192bc12c3adbd))
* scrub external repo references for standalone factory docs ([4f7bf1e](https://github.com/CourtHive/competition-factory/commit/4f7bf1e5da74b86b60715f9cb48da4cd5d286bd8))

## [3.2.3](https://github.com/CourtHive/competition-factory/compare/v3.2.2...v3.2.3) (2026-04-30)


### Bug Fixes

* **deps:** update dependency tods-competition-factory to v3.2.2 ([a3e1c58](https://github.com/CourtHive/competition-factory/commit/a3e1c5893c580308d0d3ad46b7f4e870b04e5cac))

## [3.2.2](https://github.com/CourtHive/competition-factory/compare/v3.2.1...v3.2.2) (2026-04-29)


### Bug Fixes

* **deps:** update dependency tods-competition-factory to v3.2.1 ([2b276cd](https://github.com/CourtHive/competition-factory/commit/2b276cdc8631678e31c56a2e03abf868f301b74c))

## [3.2.1](https://github.com/CourtHive/competition-factory/compare/v3.2.0...v3.2.1) (2026-04-29)


### Bug Fixes

* **scheduling:** clear COURT.ORDER timeItem on empty-string + removePriorValues ([17a2d9b](https://github.com/CourtHive/competition-factory/commit/17a2d9b70f9ffffc44172e905f0adaa020ad902a))

## [3.2.0](https://github.com/CourtHive/competition-factory/compare/v3.1.5...v3.2.0) (2026-04-28)


### Features

* **scheduling:** add courtIds filter to scheduleProfileRounds + scheduleProfileGrid ([756da06](https://github.com/CourtHive/competition-factory/commit/756da063f668ee8d05d83a2f3f3fff45b4ccc4bb))

## [3.1.5](https://github.com/CourtHive/competition-factory/compare/v3.1.4...v3.1.5) (2026-04-27)


### Bug Fixes

* **deps:** update dependency tods-competition-factory to v3.1.4 ([714f9cb](https://github.com/CourtHive/competition-factory/commit/714f9cba71c00284244e733d7d538f44c927450a))


### Maintenance

* cut 3.1.5 to validate release-please pipeline ([022b97f](https://github.com/CourtHive/competition-factory/commit/022b97f0f9697f033816eb5aa0ac0b015fd19289))
