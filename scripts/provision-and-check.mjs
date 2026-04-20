import process from 'node:process';
import { execFileSync } from 'node:child_process';

import { loadConfig } from '../src/config.mjs';
import { createOpenAiPort } from '../src/ports/openai.mjs';

const config = loadConfig(process.env);
const failures = [];

if (!config.openAiApiKey) failures.push('OPENAI_API_KEY missing');
if (!config.promotionSigningSecret) failures.push('PROMOTION_SIGNING_SECRET missing');

if (config.enableOpenAiEvalChecks && config.openAiEvalId && config.openAiApiKey) {
  try {
    const llm = createOpenAiPort(config);
    await llm.validateEval(config.openAiEvalId);
  } catch (error) {
    failures.push(`OpenAI eval validation failed: ${error.message}`);
  }
}

try {
  execFileSync('git', ['push', '--dry-run'], { stdio: 'ignore' });
} catch {
  failures.push('git push --dry-run failed');
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true }, null, 2));
