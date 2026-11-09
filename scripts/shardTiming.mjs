import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { availableParallelism, arch, cpus, platform, totalmem } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file, value) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
};
const sorted = (items) => items.toSorted((a, b) => a.localeCompare(b, 'en'));
const median = (items) => {
  const values = items.toSorted((a, b) => a - b),
    middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
};
const finite = (value) => Number.isFinite(value) && value >= 0;

export function timingContext(config, env = process.env) {
  return {
    ci: env.GITHUB_ACTIONS === 'true',
    runId: env.GITHUB_RUN_ID ?? null,
    attempt: env.GITHUB_RUN_ATTEMPT ?? null,
    sha: env.GITHUB_SHA ?? null,
    startedAt: new Date().toISOString(),
    tier: env.FACTORY_MATRIX_TIER || 'full',
    pipeline: env.OUTCOME_PIPELINE || 'v1',
    backend: env.FACTORY_BACKEND || 'native',
    teamArms: env.TEAM_ARMS === '1',
    timezone: env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone,
    node: process.version,
    vitest: readJson('node_modules/vitest/package.json').version,
    platform: platform(),
    architecture: arch(),
    runnerOS: env.RUNNER_OS ?? null,
    imageOS: env.ImageOS ?? null,
    imageVersion: env.ImageVersion ?? null,
    cpuModels: sorted([...new Set(cpus().map((cpu) => cpu.model))]),
    cpuCount: cpus().length,
    availableParallelism: availableParallelism(),
    memoryBytes: totalmem(),
    requestedWorkers: env.FACTORY_COVERAGE_WORKERS || 'default',
    resolvedMaxWorkers: config.maxWorkers,
    shard: config.shard ?? { index: 1, count: 1 },
    measurement: 'vitest-module-diagnostic-v1',
  };
}

// Keep cohorts explicit: a worker-count experiment must never recalibrate the default policy.
export function cohort(context) {
  return JSON.stringify([
    context.tier,
    context.pipeline,
    context.backend,
    context.teamArms,
    context.timezone,
    context.node,
    context.vitest,
    context.platform,
    context.architecture,
    context.imageOS,
    context.cpuCount,
    context.availableParallelism,
    context.requestedWorkers,
    context.resolvedMaxWorkers,
    context.measurement,
  ]);
}

/** All expected files, including skipped TEAM arms. Mirrors the source-anchored test discovery. */
export function testInventory(directory = 'src') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return new Set(['scratch', 'node_modules']).has(entry.name) ? [] : testInventory(file);
    return /\.test\.(js|mjs|cjs|ts|mts|cts|jsx|tsx)$/.test(entry.name) ? [file] : [];
  });
}

export function mergeTimings(shards, expectedFiles, weights = {}, coverageVerified = false) {
  assert.equal(shards.length, 4, 'expected four timing reports');
  assert.deepEqual(
    shards.map((report) => report.context.shard.index).toSorted((a, b) => a - b),
    [1, 2, 3, 4],
    'distinct shard indices',
  );
  const first = shards[0].context,
    seen = new Set(),
    files = [];
  for (const shard of shards) {
    assert.equal(shard.schema, 1, 'timing schema');
    assert.equal(shard.context.shard.count, 4, 'four-shard configuration');
    for (const field of [
      'runId',
      'attempt',
      'sha',
      'tier',
      'pipeline',
      'node',
      'vitest',
      'requestedWorkers',
      'backend',
      'teamArms',
      'timezone',
      'measurement',
    ])
      assert.deepEqual(shard.context[field], first[field], `inconsistent ${field}`);
    assert(shard.success, 'unsuccessful shard cannot supply calibration data');
    assert(finite(shard.wallSeconds), 'invalid shard wall time');
    for (const file of shard.files) {
      assert(!seen.has(file.path), `duplicate file: ${file.path}`);
      assert(finite(file.seconds) && finite(file.importSeconds), `invalid duration: ${file.path}`);
      assert(new Set(['passed', 'skipped']).has(file.state), `incomplete file: ${file.path}`);
      seen.add(file.path);
      files.push({ ...file, shard: shard.context.shard.index });
    }
  }
  assert.deepEqual(sorted([...seen]), sorted(expectedFiles), 'incomplete or unexpected test inventory');
  const loads = shards
    .toSorted((a, b) => a.context.shard.index - b.context.shard.index)
    .map((shard) => ({
      shard: shard.context.shard.index,
      wallSeconds: shard.wallSeconds,
      testSeconds: shard.files.reduce((sum, file) => sum + file.seconds, 0),
      importSeconds: shard.files.reduce((sum, file) => sum + file.importSeconds, 0),
      estimatedSeconds: shard.files.reduce((sum, file) => sum + (weights[file.path] ?? 0), 0),
    }));
  const missingWeights = sorted(files.filter((file) => weights[file.path] === undefined).map((file) => file.path));
  const drift = files
    .filter((file) => file.seconds >= 5 && weights[file.path] !== undefined && file.seconds > 2 * weights[file.path])
    .toSorted((a, b) => b.seconds - a.seconds)
    .map((file) => ({ path: file.path, actualSeconds: file.seconds, estimatedSeconds: weights[file.path] }));
  const heaviest = files
    .toSorted((a, b) => b.seconds - a.seconds)
    .slice(0, 15)
    .map(({ path, seconds, shard }) => ({ path, seconds, shard }));
  return {
    schema: 1,
    coverageVerified,
    inventory: sorted(expectedFiles),
    context: first,
    contexts: shards.map((shard) => shard.context),
    success: true,
    loads,
    files,
    missingWeights,
    drift,
    heaviest,
  };
}

/** Latest five complete observations from ONE tier/environment/worker cohort, never local timings. */
export function calibrate(reports, expectedFiles, tier, window = 5) {
  assert(new Set(['full', 'pr']).has(tier), 'unknown matrix tier');
  assert(Number.isInteger(window) && window >= 2 && window <= 10, 'invalid rolling window');
  const ids = new Set();
  for (const report of reports) {
    assert.equal(report.schema, 1);
    assert(report.success && report.coverageVerified, 'coverage verification required');
    assert.equal(report.contexts.length, 4, 'four shard contexts required');
    assert.deepEqual(
      report.contexts.map((context) => context.shard.index).toSorted((a, b) => a - b),
      [1, 2, 3, 4],
      'partial shard contexts',
    );
    assert(
      report.contexts.every(
        (context) =>
          context.runId === report.context.runId && context.sha === report.context.sha && context.shard.count === 4,
      ),
      'inconsistent run contexts',
    );
    assert(
      report.contexts.every((context) => context.ci && context.runId),
      'CI evidence required',
    );
    assert(
      report.contexts.every((context) => cohort(context) === cohort(reports[0].context)),
      'mixed calibration cohorts',
    );
    assert.equal(report.context.tier, tier, 'mixed matrix tiers');
    assert.equal(report.context.pipeline, tier === 'full' ? 'differential' : 'v1', 'incorrect pipeline');
    assert(!ids.has(report.context.runId), 'duplicate CI run');
    ids.add(report.context.runId);
    assert(Number.isFinite(Date.parse(report.context.startedAt)), 'missing run timestamp');
    assert.deepEqual(
      sorted(report.files.map((file) => file.path)),
      report.inventory,
      'incomplete historical inventory',
    );
    assert.equal(new Set(report.inventory).size, report.inventory.length, 'duplicate historical file');
    assert(
      report.files.every((file) => /^[a-f0-9]{64}$/.test(file.caseHash)),
      'missing case signatures',
    );
    assert(
      report.files.every((file) => finite(file.seconds)),
      'invalid file duration',
    );
    assert.equal(report.loads.length, 4, 'partial run');
    assert.deepEqual(
      report.loads.map((load) => load.shard).toSorted((a, b) => a - b),
      [1, 2, 3, 4],
      'partial run',
    );
  }
  const selected = reports
    .toSorted((a, b) => Date.parse(b.context.startedAt) - Date.parse(a.context.startedAt))
    .slice(0, window);
  assert(selected.length >= 2, 'at least two complete CI observations required');
  assert.deepEqual(selected[0].inventory, sorted(expectedFiles), 'latest report must match current inventory');
  const counts = {};
  const weights = Object.fromEntries(
    sorted(expectedFiles).map((path) => [
      path,
      (() => {
        const signature = selected[0].files.find((file) => file.path === path).caseHash;
        const samples = selected.flatMap((report) =>
          report.files.filter((file) => file.path === path && file.caseHash === signature).map((file) => file.seconds),
        );
        counts[path] = samples.length;
        return Math.round(median(samples) * 10) / 10;
      })(),
    ]),
  );
  const provenance = {
    schema: 1,
    tier,
    window,
    measurement: 'vitest-module-diagnostic-v1',
    singleObservationFiles: sorted(expectedFiles.filter((path) => counts[path] === 1)),
    observationsByFile: counts,
    runs: selected.map((report) => ({
      runId: report.context.runId,
      sha: report.context.sha,
      contexts: report.contexts,
    })),
  };
  return { weights, provenance };
}

export function markdown(report) {
  const row = (values) => `| ${values.join(' | ')} |`;
  return [
    '### Shard duration observations (informational)',
    '',
    `Tier: **${report.context.tier}**; pipeline: **${report.context.pipeline}**; requested workers: **${report.context.requestedWorkers}**.`,
    '',
    row(['Shard', 'Vitest elapsed seconds', 'Test seconds', 'Import seconds', 'Estimated test seconds']),
    row(['---', '---:', '---:', '---:', '---:']),
    ...report.loads.map((load) =>
      row([
        load.shard,
        load.wallSeconds.toFixed(1),
        load.testSeconds.toFixed(1),
        load.importSeconds.toFixed(1),
        load.estimatedSeconds.toFixed(1),
      ]),
    ),
    '',
    `Unweighted files: **${report.missingWeights.length}**. Files above 2× estimate (at least 5 seconds): **${report.drift.length}**.`,
    '',
    'Largest suites:',
    '',
    row(['File', 'Seconds', 'Shard']),
    row(['---', '---:', '---:']),
    ...report.heaviest.map((file) => row([`\`${file.path}\``, file.seconds.toFixed(1), file.shard])),
    '',
    ...report.missingWeights.map((path) => `- Unweighted: \`${path}\``),
    ...report.drift.map(
      (file) =>
        `- Drift: \`${file.path}\` — ${file.actualSeconds.toFixed(1)}s vs ${file.estimatedSeconds.toFixed(1)}s.`,
    ),
    '',
    'Timing warnings do not change test execution, coverage thresholds or branch protection. Full context and per-file data are in the timing artifact.',
    '',
  ].join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'report') {
    const [directory, output] = args;
    assert(directory && output, 'report <timing-directory> <output.json>');
    const shards = readdirSync(directory)
      .filter((name) => /^shard-\d+\.json$/.test(name))
      .map((name) => readJson(`${directory}/${name}`));
    const weights = readJson('vitest.shardDurations.json')[process.env.FACTORY_MATRIX_TIER || 'full'];
    const report = mergeTimings(shards, testInventory(), weights, process.env.COVERAGE_VERIFIED === 'true');
    writeJson(output, report);
    writeFileSync(output + '.md', markdown(report));
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown(report));
    console.log(
      `Timing report: ${report.files.length} files; ${report.missingWeights.length} unweighted; ${report.drift.length} above 2x estimate`,
    );
  } else if (command === 'calibrate') {
    const [tier, output, ...inputs] = args;
    assert(output && inputs.length, 'calibrate <full|pr> <weights.json> <complete-timing-report.json> ...');
    const { weights, provenance } = calibrate(inputs.map(readJson), testInventory(), tier);
    let existing = {};
    try {
      existing = readJson(output);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    writeJson(output, { ...existing, [tier]: weights });
    writeJson(output + `.${tier}.provenance.json`, provenance);
    if (provenance.singleObservationFiles.length)
      console.warn(
        `${provenance.singleObservationFiles.length} files have only one observation of their current cases; see provenance`,
      );
    console.log(
      `${tier}: ${Object.keys(weights).length} files; latest ${provenance.runs.length} complete CI runs in a window of five`,
    );
  } else throw new Error('Expected report or calibrate command');
}
