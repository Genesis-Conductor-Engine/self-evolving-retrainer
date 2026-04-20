import { average } from '../lib/math.mjs';
import { hourBucket } from '../lib/time.mjs';
import { emitAlert } from './alerts.mjs';

function failingCycleCount(runs, floor) {
  const buckets = new Map();
  for (const run of runs) {
    if (run.mode !== 'LIVE') continue;
    const list = buckets.get(run.cycle_index) ?? [];
    list.push(Number(run.synthetic_score));
    buckets.set(run.cycle_index, list);
  }
  const scores = [...buckets.values()].map((values) => average(values));
  return scores.filter((score) => score < floor).length;
}

export async function runRegressionWatchdog(runtime, now = Date.now()) {
  const currentCycle = hourBucket(now);
  const watchVersions = await runtime.store.getWatchVersions(currentCycle);
  const actions = [];

  for (const version of watchVersions) {
    const runs = await runtime.store.listSectionRuns({
      sectionFamily: version.section_family,
      versionId: version.version_id,
      cycleStart: currentCycle - runtime.config.watchdog.watchCycles + 1,
      cycleEnd: currentCycle,
      limit: 250,
    });
    const failures = failingCycleCount(runs, runtime.config.watchdog.scoreFloor);
    if (failures >= runtime.config.watchdog.failureThreshold) {
      const rollback = await runtime.store.rollbackToPrevious(version.section_family, now);
      await emitAlert(runtime, {
        severity: 'P1',
        kind: 'auto_rollback',
        message: `Auto-rollback executed for ${version.section_family}`,
        metadata: {
          from_version: version.version_id,
          to_version: rollback?.version_id ?? null,
          failures,
        },
      }, now);
      actions.push({
        section_family: version.section_family,
        rolled_back_from: version.version_id,
        rolled_back_to: rollback?.version_id ?? null,
        failures,
      });
    }
  }
  return actions;
}
