import { emitAlert } from './alerts.mjs';

export async function getBudgetStatus(runtime, now = Date.now()) {
  const hourly = await runtime.store.sumCostSince(now - 3600 * 1000);
  const daily = await runtime.store.sumCostSince(now - 24 * 3600 * 1000);
  return {
    hourly,
    daily,
    suspendRalph: hourly.usd >= runtime.config.budgets.hourlyUsd,
  };
}

export async function enforceBudgetAlerts(runtime, now = Date.now()) {
  const status = await getBudgetStatus(runtime, now);
  const hourlyThreshold = runtime.config.budgets.hourlyUsd * 0.8;
  const dailyThreshold = runtime.config.budgets.dailyUsd * 0.8;

  if (status.hourly.usd >= hourlyThreshold) {
    await emitAlert(runtime, {
      severity: status.hourly.usd >= runtime.config.budgets.hourlyUsd ? 'P0' : 'P1',
      kind: 'quota_warning_hourly',
      message: `Hourly budget at ${status.hourly.usd.toFixed(4)} USD`,
      metadata: status.hourly,
    }, now);
  } else {
    await runtime.store.resolveAlertsByKind('quota_warning_hourly', now);
  }

  if (status.daily.usd >= dailyThreshold) {
    await emitAlert(runtime, {
      severity: status.daily.usd >= runtime.config.budgets.dailyUsd ? 'P0' : 'P1',
      kind: 'quota_warning_daily',
      message: `Daily budget at ${status.daily.usd.toFixed(4)} USD`,
      metadata: status.daily,
    }, now);
  } else {
    await runtime.store.resolveAlertsByKind('quota_warning_daily', now);
  }

  return status;
}
