import process from 'node:process';
import { execFileSync } from 'node:child_process';

import { makeId } from '../src/lib/ids.mjs';

const sectionFamily = process.env.BOOTSTRAP_FAMILY ?? 'markets';
const promptText = process.env.BOOTSTRAP_PROMPT ?? 'Write a concise factual summary.';
const model = process.env.BOOTSTRAP_MODEL ?? 'gpt-5.4-mini';
const now = Date.now();
const versionId = makeId('ver');

const sql = `INSERT INTO prompt_ledger (version_id, parent_version_id, section_family, prompt_text, model, aggregate_score, promotion_reason, promoted_from_candidate_id, promoter_signature, created_at, active, rolled_back_from, promoted_cycle, watch_until_cycle) VALUES ('${versionId}', NULL, '${sectionFamily}', '${promptText.replace(/'/g, "''")}', '${model}', 0, 'bootstrap', NULL, 'bootstrap', ${now}, 1, NULL, 0, 0);`;

if (process.argv.includes('--apply')) {
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'RETRAINER_DB', '--command', sql, '--remote'], {
    stdio: 'inherit',
  });
} else {
  console.log(sql);
}
