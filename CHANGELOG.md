# Changelog

## [3.9.0](https://github.com/CourtHive/competition-factory/compare/v3.8.0...v3.9.0) (2026-05-19)


### Features

* **mocks:** support preset participants in generateTournamentRecord ([e8ab280](https://github.com/CourtHive/competition-factory/commit/e8ab28015ca6bc7f6cbf5d790f2076a4cd830f80))
* **participants:** add PAYMENT_STATUS as a participant timeItem ([6dd9fb2](https://github.com/CourtHive/competition-factory/commit/6dd9fb280c5d7ecae5e570945f262c63cd51895a))
* **policies:** encode CTS Tabulka IV — 21 categories × singles+doubles ([c6cff55](https://github.com/CourtHive/competition-factory/commit/c6cff55d25192af439fa6859a6fd626ddfe74065))


### Documentation

* **mocks:** expand preset participants documentation ([cd0791d](https://github.com/CourtHive/competition-factory/commit/cd0791d6f2da2c003bbd227b7151205192f62853))

## [3.8.0](https://github.com/CourtHive/competition-factory/compare/v3.7.0...v3.8.0) (2026-05-18)


### Features

* **types:** expose FactoryEngineTyped to catch unregistered method calls ([8aa1cc7](https://github.com/CourtHive/competition-factory/commit/8aa1cc7f6dbbe96be2355b106bee8872053f6e7c))


### Bug Fixes

* **types:** allow multi-arg methods in FactoryEngineTyped ([be1bcdf](https://github.com/CourtHive/competition-factory/commit/be1bcdfb0732d2a271ae16c2bec7cec42faf14f7))

## [3.7.0](https://github.com/CourtHive/competition-factory/compare/v3.6.0...v3.7.0) (2026-05-18)


### Features

* **fixtures:** encode per-federation ranking policies (Phase 0 PR 0.5) ([362cb03](https://github.com/CourtHive/competition-factory/commit/362cb03f1d62dd5c0b12f9e9c9fd65aba114e8bd))
* **query:** expose computeRatingDistributionStats as a top-level export ([13a5dbc](https://github.com/CourtHive/competition-factory/commit/13a5dbcbe60f72e782989bbe935dd46d3b90a6ea))
* **ranking:** add applyDerivedRankings for filtered sub-rankings ([fa3e439](https://github.com/CourtHive/competition-factory/commit/fa3e4399a007afbe40f4b196903609519c9f8669))
* **ranking:** add pointPoolModel, categoryAggregation, derivedRankings types ([050eed0](https://github.com/CourtHive/competition-factory/commit/050eed0df645d945d27d2adc245257fd88835e98))
* **ranking:** add scaleEngine.getTournamentPointAwards() pipeline entry ([3da33ae](https://github.com/CourtHive/competition-factory/commit/3da33aed44a8ce91c82015c0783739f5b021ea35))
* **ranking:** interpret categoryAggregation in generateRankingList ([8fcf3e3](https://github.com/CourtHive/competition-factory/commit/8fcf3e34b9641c3f791ed3c1cfcea19e9e24f83f))

## [3.6.0](https://github.com/CourtHive/competition-factory/compare/v3.5.0...v3.6.0) (2026-05-16)


### Features

* **query:** emit registrationProfile on getTournamentInfo ([ffc63ed](https://github.com/CourtHive/competition-factory/commit/ffc63eddb8554158cc1fea048295456a111e3503))
* **scheduling:** explain-why payloads for over-limit + recovery-deferred jinn refusals ([49d5530](https://github.com/CourtHive/competition-factory/commit/49d55301431b92c3edfcdb5f8b37eb4c7b674077))

## [3.5.0](https://github.com/CourtHive/competition-factory/compare/v3.4.4...v3.5.0) (2026-05-14)


### Features

* **scheduling:** opt-in daily-limit enforcement in pro scheduler ([8eb14f9](https://github.com/CourtHive/competition-factory/commit/8eb14f9115a618dd80b765218606937ee489c4db))


### Bug Fixes

* **scheduling:** exclude completed matchUps from pro-scheduler grid placement ([10ef2f8](https://github.com/CourtHive/competition-factory/commit/10ef2f8737ded49435c139c7fa46bbeaddce2a29))
* **scheduling:** pro scheduler walks earlier scheduled times first ([eb55666](https://github.com/CourtHive/competition-factory/commit/eb556669806e89181f2a3ef70b34fd598677ac6a))

## [3.4.4](https://github.com/CourtHive/competition-factory/compare/v3.4.3...v3.4.4) (2026-05-12)


### Bug Fixes

* **scheduling:** exclude historical/orphan matchUps from daily-limit budget ([2e5d085](https://github.com/CourtHive/competition-factory/commit/2e5d0851b6a6d8bef01056b3da3fd545c9310cd4))

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
