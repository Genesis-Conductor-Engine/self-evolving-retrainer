function nonNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export function dominates(left, right) {
  const leftSynthetic = nonNull(left.s_synthetic);
  const rightSynthetic = nonNull(right.s_synthetic);
  const leftOnchain = nonNull(left.s_onchain);
  const rightOnchain = nonNull(right.s_onchain);
  const leftThermo = nonNull(left.eta_thermo);
  const rightThermo = nonNull(right.eta_thermo);
  const leftCost = nonNull(left.c_norm);
  const rightCost = nonNull(right.c_norm);

  const noWorse = leftSynthetic >= rightSynthetic && leftOnchain >= rightOnchain && leftThermo >= rightThermo && leftCost <= rightCost;
  const strictlyBetter = leftSynthetic > rightSynthetic || leftOnchain > rightOnchain || leftThermo > rightThermo || leftCost < rightCost;
  return noWorse && strictlyBetter;
}

export async function updateParetoFront(store, candidateEntry, now) {
  const current = await store.getParetoFront(candidateEntry.section_family);
  const dominatedByCurrent = current.some((entry) => dominates(entry, candidateEntry));
  const newlyDominatedIds = current.filter((entry) => dominates(candidateEntry, entry)).map((entry) => entry.candidate_id);
  if (newlyDominatedIds.length) {
    await store.setParetoDominated(candidateEntry.section_family, newlyDominatedIds, 1, now);
  }
  await store.upsertPareto({ ...candidateEntry, dominated: dominatedByCurrent ? 1 : 0, updated_at: now });
  return {
    dominated: dominatedByCurrent,
    newlyDominatedIds,
  };
}
