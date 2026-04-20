# Contributing to Self-Evolving Retrainer

Thank you for your interest in contributing! This document outlines the process for contributing to this project.

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). By participating, you are expected to uphold this code. Please report unacceptable behavior to the maintainers.

## Developer Certificate of Origin (DCO)

This project requires all contributors to sign off on their commits, certifying that they have the right to submit the contribution under the project's license.

By signing off, you agree to the [Developer Certificate of Origin](https://developercertificate.org/):

```
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.

Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

### How to Sign Off

Add a `Signed-off-by` line to your commit messages:

```bash
git commit -s -m "Your commit message"
```

Or manually add to the commit message:

```
Your commit message

Signed-off-by: Your Name <your.email@example.com>
```

## Pull Request Process

### Before You Start

1. **Check existing issues** — Your idea may already be discussed
2. **Open an issue first** — For significant changes, discuss the approach before coding
3. **Fork the repository** — Work in your own fork

### PR Guidelines

#### Title Format

Use conventional commit format:

```
feat: add new scoring dimension
fix: correct checkpoint resumption logic
docs: update deployment instructions
test: add coverage for edge cases
refactor: simplify promotion service
```

#### Description Template

Your PR description should include:

```markdown
## Summary

Brief description of what this PR does.

## Motivation

Why is this change needed? Link to issue if applicable.

## Changes

- Bullet points of specific changes
- Include any breaking changes

## Testing

- [ ] Unit tests pass (`npm test`)
- [ ] Smoke tests pass (`npm run smoke`)
- [ ] Manual testing performed (describe)

## Checklist

- [ ] Code follows project style
- [ ] Self-review completed
- [ ] Documentation updated (if applicable)
- [ ] All commits signed off (DCO)
```

### Review Process

1. **Automated checks** — CI must pass (typecheck, tests, dry-run deploy)
2. **Code review** — At least one maintainer approval required
3. **DCO verification** — All commits must be signed off
4. **Merge** — Squash and merge preferred for clean history

## Development Setup

### Prerequisites

- Node.js ≥18
- Wrangler CLI

### Local Development

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/self-evolving-retrainer.git
cd self-evolving-retrainer

# Run tests
npm test

# Run smoke tests
npm run smoke
```

### Testing Guidelines

- **Unit tests** — Cover all new functions in `tests/`
- **Deterministic** — Tests must not depend on external services
- **Fast** — Individual tests should complete in <1s

## Style Guide

### Code Style

- ES modules (`.mjs` extension)
- No external runtime dependencies (Cloudflare Workers constraint)
- Prefer explicit over implicit
- Document non-obvious logic with inline comments

### Commit Messages

- Use present tense ("add feature" not "added feature")
- Use imperative mood ("move cursor to..." not "moves cursor to...")
- First line ≤72 characters
- Reference issues when applicable (`fixes #123`)

## Getting Help

- **Questions** — Open a discussion or issue
- **Bugs** — File an issue with reproduction steps
- **Security** — See [SECURITY.md](SECURITY.md) if present, or contact maintainers directly

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
