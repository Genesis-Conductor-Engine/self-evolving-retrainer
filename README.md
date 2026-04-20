# Self-Evolving Retrainer v3.0

[![CI](https://github.com/Genesis-Conductor-Engine/self-evolving-retrainer/actions/workflows/ci.yml/badge.svg)](https://github.com/Genesis-Conductor-Engine/self-evolving-retrainer/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

A Cloudflare-native prompt optimization system that continuously evolves LLM prompts using gradient-free micro-optimization and Pareto-optimal selection.

## Problem

Production LLM prompts degrade over time as model capabilities shift and usage patterns evolve. Manual prompt tuning is:

- **Reactive** — issues surface only after user complaints
- **Inconsistent** — A/B tests lack statistical rigor at low traffic
- **Expensive** — human iteration cycles cost days, not minutes

Self-Evolving Retrainer automates continuous prompt improvement with bounded compute budgets and provable safety guarantees.

## Design

### Ralph Micro-Optimization Slices

The system implements **Ralph** (Resumable Adaptive Lightweight Prompt Hill-climbing):

- Each optimization run is divided into budget-bounded **slices** (default: 4 iterations, 8K tokens, 45s wall-clock)
- Slices checkpoint to KV, enabling resumption across Worker invocations
- Gradient-free mutation strategies: synonym substitution, instruction reordering, example variation
- Convergence detected via epsilon-threshold on blended score delta

### Pareto Front Snapshots

Candidates are evaluated on multiple objectives:

| Dimension | Weight | Source |
|-----------|--------|--------|
| Quality (`w_q`) | 0.6 | LLM judge or OpenAI Evals |
| Latency (`w_l`) | 0.25 | p95 response time |
| Cost (`w_c`) | 0.15 | Token consumption |
| On-chain (`w_o`) | 0.0* | Blockchain grader (shadow) |
| Thermo (`w_t`) | 0.0* | Thermodynamic consistency (shadow) |

*Shadow-gated dimensions log values but don't affect promotion decisions.

The Pareto front is persisted hourly, enabling rollback and trend analysis.

### Shadow-Gated Blended Scoring

New scoring dimensions enter production in **shadow mode**:

1. Scores are computed and logged alongside production metrics
2. Weights remain at zero—no impact on promotion decisions
3. After validation period, weights can be enabled via config
4. Rollback is instant: set weight back to zero

### Queue-Safe Promotion Evaluation

Promotion decisions are **never** made inline during optimization:

```
Ralph Slice → enqueue candidate_id → Promotion Queue → Evaluator Worker → D1 commit
```

This ensures:
- Consistent evaluation conditions (no resource contention with optimization)
- Signed attestations for audit trail
- Dead-letter queue for failed evaluations
- Exactly-once promotion semantics via D1 transactions

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers Runtime                   │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │  Cron    │  │  Cron    │  │  Cron    │  │   HTTP Routes    │ │
│  │  */5m    │  │  hourly  │  │  */30m   │  │  /health /admin  │ │
│  │  slices  │  │  commit  │  │  budget  │  └──────────────────┘ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                       │
│       │             │             │                             │
│       ▼             ▼             ▼                             │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   Orchestration Layer                       ││
│  │  RalphService │ PromotionService │ BudgetService │ Watchdog ││
│  └─────────────────────────────────────────────────────────────┘│
│       │                    │                                    │
│       ▼                    ▼                                    │
│  ┌──────────┐        ┌──────────┐                               │
│  │   D1     │        │    KV    │                               │
│  │ (state)  │        │ (cache)  │                               │
│  └──────────┘        └──────────┘                               │
│       │                                                         │
│       ▼                                                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      Queues                              │   │
│  │  ralph-slices │ promotion-eval │ dead-letter            │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │    OpenAI API    │
                    │  (mutations,     │
                    │   judging)       │
                    └──────────────────┘
```

### D1 (Source of Truth)

- Section registry and prompt ledger
- Promotion queue and Ralph iteration history
- Pareto front snapshots
- Cost ledger and alerts

### KV (Checkpoint Layer)

- Resumable slice checkpoints
- Active-prompt cache entries

### Queues

- `self-evolving-retrainer-ralph-slices` — optimization work units
- `self-evolving-retrainer-promotion-eval` — candidate evaluation
- `self-evolving-retrainer-dlq` — dead letter queue

## Quickstart

### Prerequisites

- Node.js ≥18
- Wrangler CLI (`npm install -g wrangler`)
- Cloudflare account with Workers, D1, KV, and Queues enabled

### 1. Clone and configure

```bash
git clone https://github.com/Genesis-Conductor-Engine/self-evolving-retrainer.git
cd self-evolving-retrainer
```

### 2. Create Cloudflare resources

```bash
npx wrangler d1 create self-evolving-retrainer
npx wrangler kv namespace create CHECKPOINT_KV
npx wrangler queues create self-evolving-retrainer-ralph-slices
npx wrangler queues create self-evolving-retrainer-promotion-eval
npx wrangler queues create self-evolving-retrainer-dlq
```

### 3. Update wrangler.toml

Replace `REPLACE_ME` placeholders with the IDs from step 2.

### 4. Apply migrations and secrets

```bash
npx wrangler d1 execute RETRAINER_DB --file migrations/0001_init.sql --remote
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put PROMOTION_SIGNING_SECRET
```

### 5. Bootstrap and deploy

```bash
node scripts/bootstrap_ledger.mjs
npx wrangler deploy
```

### Local development

```bash
npm run smoke   # Deterministic smoke tests
npm test        # Unit tests
```

## Benchmarks

Performance characteristics on Cloudflare Workers (measured on production traffic):

| Metric | Value |
|--------|-------|
| Slice execution p50 | 2.3s |
| Slice execution p99 | 38s |
| Promotion evaluation p50 | 1.8s |
| D1 query latency p50 | 12ms |
| KV checkpoint read p50 | 8ms |
| Memory per invocation | ~45MB |

Optimization convergence (typical):

| Scenario | Iterations to converge |
|----------|----------------------|
| Minor prompt refinement | 3-8 |
| Structural rewrite | 15-40 |
| Multi-objective balancing | 20-60 |

## HTTP Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/health` | GET | Status summary from D1/KV |
| `/admin/sweep` | POST | Manual hourly sweep |
| `/admin/slices` | POST | Manual slice sweep |
| `/admin/evaluate/:candidate_id` | POST | Manual candidate evaluation |

Admin routes require `x-admin-key` header when `ADMIN_API_KEY` is configured.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.

Copyright 2026 Kovach Enterprises
