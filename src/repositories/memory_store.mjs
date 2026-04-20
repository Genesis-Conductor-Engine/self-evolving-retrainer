function clone(value) {
  return value == null ? value : structuredClone(value);
}

export function createMemoryStore(seed = {}) {
  const sections = new Map();
  const promptLedger = new Map();
  const candidates = new Map();
  const ralphIterations = new Map();
  const paretoFront = new Map();
  const sectionRuns = new Map();
  const costLedger = new Map();
  const alerts = new Map();
  const checkpoints = new Map();
  const activePromptCache = new Map();

  const store = {
    async upsertSections(items = []) {
      for (const item of items) {
        sections.set(item.section_id, clone(item));
      }
    },

    async listFamilies() {
      return [...new Set([...sections.values()].map((section) => section.section_family))].sort();
    },

    async getEnabledSections({ phase = 'LIVE', limit = 25 } = {}) {
      return [...sections.values()]
        .filter((section) => section.enabled && section.phase === phase)
        .sort((a, b) => a.priority - b.priority || a.section_id.localeCompare(b.section_id))
        .slice(0, limit)
        .map(clone);
    },

    async getHeldoutSections(sectionFamily, limit = 25) {
      return [...sections.values()]
        .filter((section) => section.enabled && section.phase === 'HELDOUT' && section.section_family === sectionFamily)
        .sort((a, b) => a.priority - b.priority || a.section_id.localeCompare(b.section_id))
        .slice(0, limit)
        .map(clone);
    },

    async getSection(sectionId) {
      return clone(sections.get(sectionId) ?? null);
    },

    async insertInitialPrompt(row) {
      const copy = clone(row);
      promptLedger.set(copy.version_id, copy);
      if (copy.active) activePromptCache.set(copy.section_family, copy);
      return copy;
    },

    async getActivePrompt(sectionFamily) {
      if (activePromptCache.has(sectionFamily)) return clone(activePromptCache.get(sectionFamily));
      const row = [...promptLedger.values()]
        .find((entry) => entry.section_family === sectionFamily && entry.active === 1);
      if (row) activePromptCache.set(sectionFamily, row);
      return clone(row ?? null);
    },

    async listRecentPromptVersions(sectionFamily, limit = 10) {
      return [...promptLedger.values()]
        .filter((entry) => entry.section_family === sectionFamily)
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, limit)
        .map(clone);
    },

    async getPreviousVersion(sectionFamily, currentVersionId) {
      const rows = [...promptLedger.values()]
        .filter((entry) => entry.section_family === sectionFamily)
        .sort((a, b) => b.created_at - a.created_at);
      const index = rows.findIndex((entry) => entry.version_id === currentVersionId);
      if (index < 0) return null;
      return clone(rows[index + 1] ?? null);
    },

    async promoteVersion(row) {
      for (const entry of promptLedger.values()) {
        if (entry.section_family === row.section_family && entry.active === 1) {
          entry.active = 0;
        }
      }
      const copy = clone({ ...row, active: 1 });
      promptLedger.set(copy.version_id, copy);
      activePromptCache.set(copy.section_family, copy);
      return copy;
    },

    async rollbackToPrevious(sectionFamily, createdAt) {
      const active = await store.getActivePrompt(sectionFamily);
      if (!active) return null;
      const previous = await store.getPreviousVersion(sectionFamily, active.version_id);
      if (!previous) return null;
      const activeEntry = promptLedger.get(active.version_id);
      if (activeEntry) activeEntry.active = 0;
      const previousEntry = promptLedger.get(previous.version_id);
      if (previousEntry) {
        previousEntry.active = 1;
        previousEntry.rolled_back_from = active.version_id;
        previousEntry.created_at = Math.max(previousEntry.created_at, createdAt);
      }
      activePromptCache.set(sectionFamily, previousEntry);
      return clone(previousEntry);
    },

    async enqueueCandidate(row) {
      candidates.set(row.candidate_id, clone(row));
      return clone(row);
    },

    async getCandidate(candidateId) {
      return clone(candidates.get(candidateId) ?? null);
    },

    async claimCandidate(candidateId, leaseOwner, now, leaseMs) {
      const entry = candidates.get(candidateId);
      if (!entry) return null;
      const leaseExpired = !entry.lease_expires_at || entry.lease_expires_at <= now;
      if (entry.state !== 'PENDING' && !(entry.state === 'EVALUATING' && leaseExpired)) {
        return null;
      }
      entry.state = 'EVALUATING';
      entry.lease_owner = leaseOwner;
      entry.lease_expires_at = now + leaseMs;
      return clone(entry);
    },

    async finalizeCandidate(candidateId, patch) {
      const entry = candidates.get(candidateId);
      if (!entry) return null;
      Object.assign(entry, clone(patch));
      return clone(entry);
    },

    async expireStaleCandidates(now) {
      let expired = 0;
      for (const entry of candidates.values()) {
        if (['PENDING', 'EVALUATING'].includes(entry.state) && entry.expires_at <= now) {
          entry.state = 'EXPIRED';
          expired += 1;
        }
      }
      return expired;
    },

    async recordRalphIteration(row) {
      ralphIterations.set(row.iter_id, clone(row));
    },

    async upsertPareto(row) {
      paretoFront.set(`${row.section_family}:${row.candidate_id}`, clone(row));
    },

    async getParetoFront(sectionFamily) {
      return [...paretoFront.values()]
        .filter((entry) => entry.section_family === sectionFamily && entry.dominated === 0)
        .sort((a, b) => b.updated_at - a.updated_at)
        .map(clone);
    },

    async setParetoDominated(sectionFamily, candidateIds = [], dominated = 1, updatedAt = Date.now()) {
      for (const candidateId of candidateIds) {
        const key = `${sectionFamily}:${candidateId}`;
        const entry = paretoFront.get(key);
        if (entry) {
          entry.dominated = dominated;
          entry.updated_at = updatedAt;
        }
      }
    },

    async recordSectionRun(row) {
      sectionRuns.set(row.run_id, clone(row));
    },

    async listSectionRuns({ sectionFamily, versionId = null, cycleStart = -Infinity, cycleEnd = Infinity, limit = 50 } = {}) {
      return [...sectionRuns.values()]
        .filter((run) => (!sectionFamily || run.section_family === sectionFamily))
        .filter((run) => (!versionId || run.version_id === versionId))
        .filter((run) => run.cycle_index >= cycleStart && run.cycle_index <= cycleEnd)
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, limit)
        .map(clone);
    },

    async recordCost(row) {
      costLedger.set(row.entry_id, clone(row));
    },

    async sumCostSince(sinceMs) {
      let usd = 0;
      let inputTokens = 0;
      let outputTokens = 0;
      for (const entry of costLedger.values()) {
        if (entry.created_at >= sinceMs) {
          usd += entry.usd_estimate;
          inputTokens += entry.input_tokens;
          outputTokens += entry.output_tokens;
        }
      }
      return { usd, inputTokens, outputTokens };
    },

    async createAlert(row) {
      alerts.set(row.alert_id, clone(row));
      return clone(row);
    },

    async resolveAlertsByKind(kind, resolvedAt) {
      for (const alert of alerts.values()) {
        if (alert.kind === kind && !alert.resolved_at) {
          alert.resolved_at = resolvedAt;
        }
      }
    },

    async listActiveAlerts(limit = 20) {
      return [...alerts.values()]
        .filter((alert) => !alert.resolved_at)
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, limit)
        .map(clone);
    },

    async putCheckpoint(sectionId, checkpoint) {
      checkpoints.set(sectionId, clone(checkpoint));
    },

    async getCheckpoint(sectionId) {
      return clone(checkpoints.get(sectionId) ?? null);
    },

    async deleteCheckpoint(sectionId) {
      checkpoints.delete(sectionId);
    },

    async getWatchVersions(currentCycle) {
      return [...promptLedger.values()]
        .filter((entry) => entry.active === 1 && entry.watch_until_cycle >= currentCycle)
        .map(clone);
    },

    async getHealthCounts() {
      return {
        sections: sections.size,
        activePrompts: [...promptLedger.values()].filter((entry) => entry.active === 1).length,
        pendingCandidates: [...candidates.values()].filter((entry) => entry.state === 'PENDING').length,
        evaluatingCandidates: [...candidates.values()].filter((entry) => entry.state === 'EVALUATING').length,
        activeAlerts: [...alerts.values()].filter((entry) => !entry.resolved_at).length,
      };
    },
  };

  if (seed.sections?.length) store.upsertSections(seed.sections);
  if (seed.prompts?.length) {
    for (const prompt of seed.prompts) {
      promptLedger.set(prompt.version_id, clone(prompt));
      if (prompt.active) activePromptCache.set(prompt.section_family, clone(prompt));
    }
  }
  return store;
}
