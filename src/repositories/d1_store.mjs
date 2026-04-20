import { safeJsonParse } from '../lib/text.mjs';

function hydrateSection(row) {
  if (!row) return null;
  return {
    ...row,
    expected_entities: safeJsonParse(row.expected_entities_json, []),
    enabled: Number(row.enabled ?? 0),
    priority: Number(row.priority ?? 100),
  };
}

function hydratePrompt(row) {
  return row ? { ...row, active: Number(row.active ?? 0) } : null;
}

function checkpointKey(sectionId) {
  return `checkpoint:${sectionId}`;
}

function activePromptKey(sectionFamily) {
  return `active:${sectionFamily}`;
}

function json(value) {
  return JSON.stringify(value);
}

export function createD1Store(env, config) {
  const db = env.RETRAINER_DB;
  const kv = env.CHECKPOINT_KV;

  async function run(sql, params = []) {
    return db.prepare(sql).bind(...params).run();
  }

  async function first(sql, params = []) {
    return db.prepare(sql).bind(...params).first();
  }

  async function all(sql, params = []) {
    const result = await db.prepare(sql).bind(...params).all();
    return result.results ?? [];
  }

  return {
    async listFamilies() {
      const rows = await all('SELECT DISTINCT section_family FROM section_registry WHERE enabled = 1 ORDER BY section_family ASC');
      return rows.map((row) => row.section_family);
    },

    async getEnabledSections({ phase = 'LIVE', limit = 25 } = {}) {
      const rows = await all(
        'SELECT * FROM section_registry WHERE enabled = 1 AND phase = ? ORDER BY priority ASC, section_id ASC LIMIT ?',
        [phase, limit],
      );
      return rows.map(hydrateSection);
    },

    async getHeldoutSections(sectionFamily, limit = 25) {
      const rows = await all(
        'SELECT * FROM section_registry WHERE enabled = 1 AND phase = ? AND section_family = ? ORDER BY priority ASC, section_id ASC LIMIT ?',
        ['HELDOUT', sectionFamily, limit],
      );
      return rows.map(hydrateSection);
    },

    async getSection(sectionId) {
      return hydrateSection(await first('SELECT * FROM section_registry WHERE section_id = ? LIMIT 1', [sectionId]));
    },

    async upsertSections(items = []) {
      const statements = items.map((item) => db.prepare(`
        INSERT INTO section_registry (
          section_id, section_family, input_text, reference_summary, expected_entities_json,
          target_min_words, target_max_words, priority, enabled, phase, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(section_id) DO UPDATE SET
          section_family = excluded.section_family,
          input_text = excluded.input_text,
          reference_summary = excluded.reference_summary,
          expected_entities_json = excluded.expected_entities_json,
          target_min_words = excluded.target_min_words,
          target_max_words = excluded.target_max_words,
          priority = excluded.priority,
          enabled = excluded.enabled,
          phase = excluded.phase,
          updated_at = excluded.updated_at
      `).bind(
        item.section_id,
        item.section_family,
        item.input_text,
        item.reference_summary ?? null,
        json(item.expected_entities ?? item.expected_entities_json ?? []),
        item.target_min_words ?? 12,
        item.target_max_words ?? 24,
        item.priority ?? 100,
        item.enabled ?? 1,
        item.phase ?? 'LIVE',
        item.updated_at,
      ));
      if (statements.length) await db.batch(statements);
    },

    async insertInitialPrompt(row) {
      await run(
        `INSERT INTO prompt_ledger (
          version_id, parent_version_id, section_family, prompt_text, model, aggregate_score,
          promotion_reason, promoted_from_candidate_id, promoter_signature, created_at,
          active, rolled_back_from, promoted_cycle, watch_until_cycle
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.version_id,
          row.parent_version_id ?? null,
          row.section_family,
          row.prompt_text,
          row.model,
          row.aggregate_score ?? 0,
          row.promotion_reason ?? 'bootstrap',
          row.promoted_from_candidate_id ?? null,
          row.promoter_signature ?? '',
          row.created_at,
          row.active ?? 1,
          row.rolled_back_from ?? null,
          row.promoted_cycle ?? 0,
          row.watch_until_cycle ?? 0,
        ],
      );
      if (row.active) {
        await kv.put(activePromptKey(row.section_family), json(row), { expirationTtl: config.ralph.checkpointTtlSeconds });
      }
      return row;
    },

    async getActivePrompt(sectionFamily) {
      const cached = await kv.get(activePromptKey(sectionFamily), { type: 'json' });
      if (cached) return hydratePrompt(cached);
      const row = hydratePrompt(await first(
        'SELECT * FROM prompt_ledger WHERE section_family = ? AND active = 1 ORDER BY created_at DESC LIMIT 1',
        [sectionFamily],
      ));
      if (row) {
        await kv.put(activePromptKey(sectionFamily), json(row), { expirationTtl: config.ralph.checkpointTtlSeconds });
      }
      return row;
    },

    async listRecentPromptVersions(sectionFamily, limit = 10) {
      const rows = await all(
        'SELECT * FROM prompt_ledger WHERE section_family = ? ORDER BY created_at DESC LIMIT ?',
        [sectionFamily, limit],
      );
      return rows.map(hydratePrompt);
    },

    async getPreviousVersion(sectionFamily, currentVersionId) {
      const rows = await this.listRecentPromptVersions(sectionFamily, 25);
      const index = rows.findIndex((row) => row.version_id === currentVersionId);
      return index >= 0 ? rows[index + 1] ?? null : null;
    },

    async promoteVersion(row) {
      await db.batch([
        db.prepare('UPDATE prompt_ledger SET active = 0 WHERE section_family = ? AND active = 1').bind(row.section_family),
        db.prepare(`INSERT INTO prompt_ledger (
          version_id, parent_version_id, section_family, prompt_text, model, aggregate_score,
          promotion_reason, promoted_from_candidate_id, promoter_signature, created_at,
          active, rolled_back_from, promoted_cycle, watch_until_cycle
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
          row.version_id,
          row.parent_version_id ?? null,
          row.section_family,
          row.prompt_text,
          row.model,
          row.aggregate_score,
          row.promotion_reason,
          row.promoted_from_candidate_id ?? null,
          row.promoter_signature,
          row.created_at,
          1,
          row.rolled_back_from ?? null,
          row.promoted_cycle,
          row.watch_until_cycle,
        ),
      ]);
      await kv.put(activePromptKey(row.section_family), json({ ...row, active: 1 }), { expirationTtl: config.ralph.checkpointTtlSeconds });
      return { ...row, active: 1 };
    },

    async rollbackToPrevious(sectionFamily, createdAt) {
      const active = await this.getActivePrompt(sectionFamily);
      if (!active) return null;
      const previous = await this.getPreviousVersion(sectionFamily, active.version_id);
      if (!previous) return null;
      await db.batch([
        db.prepare('UPDATE prompt_ledger SET active = 0 WHERE version_id = ?').bind(active.version_id),
        db.prepare('UPDATE prompt_ledger SET active = 1, rolled_back_from = ? WHERE version_id = ?').bind(active.version_id, previous.version_id),
      ]);
      const rolledBack = { ...previous, active: 1, rolled_back_from: active.version_id, created_at: Math.max(previous.created_at, createdAt) };
      await kv.put(activePromptKey(sectionFamily), json(rolledBack), { expirationTtl: config.ralph.checkpointTtlSeconds });
      return rolledBack;
    },

    async enqueueCandidate(row) {
      await run(
        `INSERT INTO promotion_queue (
          candidate_id, proposer_hash, parent_version_id, section_family, prompt_text, model,
          source_feedback, state, score_prior, score_post, omega_prior, omega_post, created_at,
          expires_at, lease_owner, lease_expires_at, promoter_signature, attestation_ref,
          openai_eval_run_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.candidate_id,
          row.proposer_hash,
          row.parent_version_id,
          row.section_family,
          row.prompt_text,
          row.model,
          json(row.source_feedback ?? {}),
          row.state ?? 'PENDING',
          row.score_prior ?? null,
          row.score_post ?? null,
          row.omega_prior ?? null,
          row.omega_post ?? null,
          row.created_at,
          row.expires_at,
          row.lease_owner ?? null,
          row.lease_expires_at ?? null,
          row.promoter_signature ?? null,
          row.attestation_ref ?? null,
          row.openai_eval_run_id ?? null,
        ],
      );
      return row;
    },

    async getCandidate(candidateId) {
      const row = await first('SELECT * FROM promotion_queue WHERE candidate_id = ? LIMIT 1', [candidateId]);
      if (!row) return null;
      return { ...row, source_feedback: safeJsonParse(row.source_feedback, {}) };
    },

    async claimCandidate(candidateId, leaseOwner, now, leaseMs) {
      const result = await run(
        `UPDATE promotion_queue
         SET state = 'EVALUATING', lease_owner = ?, lease_expires_at = ?
         WHERE candidate_id = ?
           AND (state = 'PENDING' OR (state = 'EVALUATING' AND (lease_expires_at IS NULL OR lease_expires_at <= ?)))`,
        [leaseOwner, now + leaseMs, candidateId, now],
      );
      if ((result.meta?.changes ?? 0) < 1) return null;
      return this.getCandidate(candidateId);
    },

    async finalizeCandidate(candidateId, patch) {
      const allowed = ['state', 'score_post', 'omega_post', 'promoter_signature', 'attestation_ref', 'openai_eval_run_id', 'lease_owner', 'lease_expires_at'];
      const entries = Object.entries(patch).filter(([key]) => allowed.includes(key));
      if (!entries.length) return this.getCandidate(candidateId);
      const setClause = entries.map(([key]) => `${key} = ?`).join(', ');
      const params = entries.map(([, value]) => value);
      await run(`UPDATE promotion_queue SET ${setClause} WHERE candidate_id = ?`, [...params, candidateId]);
      return this.getCandidate(candidateId);
    },

    async expireStaleCandidates(now) {
      const result = await run(
        `UPDATE promotion_queue SET state = 'EXPIRED'
         WHERE state IN ('PENDING', 'EVALUATING') AND expires_at <= ?`,
        [now],
      );
      return result.meta?.changes ?? 0;
    },

    async recordRalphIteration(row) {
      await run(
        `INSERT INTO ralph_iterations (
          iter_id, section_id, section_family, parent_version_id, parent_prompt, candidate_prompt,
          mutation_summary, omega_score, s_synthetic, s_onchain, eta_thermo, c_norm,
          delta_to_best, stagnation_flag, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.iter_id,
          row.section_id,
          row.section_family,
          row.parent_version_id,
          row.parent_prompt,
          row.candidate_prompt,
          row.mutation_summary,
          row.omega_score,
          row.s_synthetic,
          row.s_onchain ?? null,
          row.eta_thermo ?? null,
          row.c_norm,
          row.delta_to_best,
          row.stagnation_flag ?? 0,
          row.created_at,
        ],
      );
    },

    async upsertPareto(row) {
      await run(
        `INSERT INTO pareto_front (
          section_family, candidate_id, prompt_text, s_synthetic, s_onchain, eta_thermo, c_norm,
          dominated, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(section_family, candidate_id) DO UPDATE SET
          prompt_text = excluded.prompt_text,
          s_synthetic = excluded.s_synthetic,
          s_onchain = excluded.s_onchain,
          eta_thermo = excluded.eta_thermo,
          c_norm = excluded.c_norm,
          dominated = excluded.dominated,
          updated_at = excluded.updated_at`,
        [
          row.section_family,
          row.candidate_id,
          row.prompt_text,
          row.s_synthetic,
          row.s_onchain ?? 0,
          row.eta_thermo ?? 0,
          row.c_norm,
          row.dominated ?? 0,
          row.updated_at,
        ],
      );
    },

    async getParetoFront(sectionFamily) {
      return all(
        'SELECT * FROM pareto_front WHERE section_family = ? AND dominated = 0 ORDER BY updated_at DESC',
        [sectionFamily],
      );
    },

    async setParetoDominated(sectionFamily, candidateIds = [], dominated = 1, updatedAt = Date.now()) {
      if (!candidateIds.length) return;
      const placeholders = candidateIds.map(() => '?').join(', ');
      await run(
        `UPDATE pareto_front SET dominated = ?, updated_at = ? WHERE section_family = ? AND candidate_id IN (${placeholders})`,
        [dominated, updatedAt, sectionFamily, ...candidateIds],
      );
    },

    async recordSectionRun(row) {
      await run(
        `INSERT INTO section_runs (
          run_id, section_id, section_family, version_id, candidate_id, mode, cycle_index,
          prompt_hash, summary_text, synthetic_score, omega_score, s_onchain, eta_thermo,
          c_norm, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.run_id,
          row.section_id,
          row.section_family,
          row.version_id ?? null,
          row.candidate_id ?? null,
          row.mode,
          row.cycle_index,
          row.prompt_hash,
          row.summary_text,
          row.synthetic_score,
          row.omega_score,
          row.s_onchain ?? null,
          row.eta_thermo ?? null,
          row.c_norm ?? 0,
          row.created_at,
        ],
      );
    },

    async listSectionRuns({ sectionFamily, versionId = null, cycleStart = -Infinity, cycleEnd = Infinity, limit = 50 } = {}) {
      let sql = 'SELECT * FROM section_runs WHERE 1 = 1';
      const params = [];
      if (sectionFamily) {
        sql += ' AND section_family = ?';
        params.push(sectionFamily);
      }
      if (versionId) {
        sql += ' AND version_id = ?';
        params.push(versionId);
      }
      if (Number.isFinite(cycleStart)) {
        sql += ' AND cycle_index >= ?';
        params.push(cycleStart);
      }
      if (Number.isFinite(cycleEnd)) {
        sql += ' AND cycle_index <= ?';
        params.push(cycleEnd);
      }
      sql += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);
      return all(sql, params);
    },

    async recordCost(row) {
      await run(
        `INSERT INTO cost_ledger (
          entry_id, kind, model, input_tokens, output_tokens, usd_estimate, latency_ms,
          request_id, client_request_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.entry_id,
          row.kind,
          row.model ?? null,
          row.input_tokens ?? 0,
          row.output_tokens ?? 0,
          row.usd_estimate ?? 0,
          row.latency_ms ?? 0,
          row.request_id ?? null,
          row.client_request_id ?? null,
          row.created_at,
        ],
      );
    },

    async sumCostSince(sinceMs) {
      const row = await first(
        `SELECT
           COALESCE(SUM(usd_estimate), 0) AS usd,
           COALESCE(SUM(input_tokens), 0) AS inputTokens,
           COALESCE(SUM(output_tokens), 0) AS outputTokens
         FROM cost_ledger WHERE created_at >= ?`,
        [sinceMs],
      );
      return {
        usd: Number(row?.usd ?? 0),
        inputTokens: Number(row?.inputTokens ?? 0),
        outputTokens: Number(row?.outputTokens ?? 0),
      };
    },

    async createAlert(row) {
      await run(
        `INSERT INTO alerts (alert_id, severity, kind, message, metadata_json, created_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [row.alert_id, row.severity, row.kind, row.message, json(row.metadata_json ?? {}), row.created_at, row.resolved_at ?? null],
      );
      return row;
    },

    async resolveAlertsByKind(kind, resolvedAt) {
      await run('UPDATE alerts SET resolved_at = ? WHERE kind = ? AND resolved_at IS NULL', [resolvedAt, kind]);
    },

    async listActiveAlerts(limit = 20) {
      const rows = await all('SELECT * FROM alerts WHERE resolved_at IS NULL ORDER BY created_at DESC LIMIT ?', [limit]);
      return rows.map((row) => ({ ...row, metadata_json: safeJsonParse(row.metadata_json, {}) }));
    },

    async putCheckpoint(sectionId, checkpoint) {
      await kv.put(checkpointKey(sectionId), json(checkpoint), { expirationTtl: config.ralph.checkpointTtlSeconds });
    },

    async getCheckpoint(sectionId) {
      return kv.get(checkpointKey(sectionId), { type: 'json' });
    },

    async deleteCheckpoint(sectionId) {
      await kv.delete(checkpointKey(sectionId));
    },

    async getWatchVersions(currentCycle) {
      const rows = await all(
        'SELECT * FROM prompt_ledger WHERE active = 1 AND watch_until_cycle >= ? ORDER BY created_at DESC',
        [currentCycle],
      );
      return rows.map(hydratePrompt);
    },

    async getHealthCounts() {
      const [sectionsRow, promptsRow, candidatesRow, alertsRow] = await Promise.all([
        first('SELECT COUNT(*) AS count FROM section_registry WHERE enabled = 1'),
        first('SELECT COUNT(*) AS count FROM prompt_ledger WHERE active = 1'),
        first(`SELECT
          COALESCE(SUM(CASE WHEN state = 'PENDING' THEN 1 ELSE 0 END), 0) AS pending,
          COALESCE(SUM(CASE WHEN state = 'EVALUATING' THEN 1 ELSE 0 END), 0) AS evaluating
         FROM promotion_queue`),
        first('SELECT COUNT(*) AS count FROM alerts WHERE resolved_at IS NULL'),
      ]);
      return {
        sections: Number(sectionsRow?.count ?? 0),
        activePrompts: Number(promptsRow?.count ?? 0),
        pendingCandidates: Number(candidatesRow?.pending ?? 0),
        evaluatingCandidates: Number(candidatesRow?.evaluating ?? 0),
        activeAlerts: Number(alertsRow?.count ?? 0),
      };
    },
  };
}
