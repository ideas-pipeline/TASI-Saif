# Engineering Standards — sultan-saif

This document defines the engineering practices, code review process, branch strategy, and release process for the sultan-saif team.

---

## Table of Contents

1. [Local Development Setup](#1-local-development-setup)
2. [Branch Strategy](#2-branch-strategy)
3. [Commit Standards](#3-commit-standards)
4. [Code Review Process](#4-code-review-process)
5. [CI/CD Pipeline](#5-cicd-pipeline)
6. [Release Process](#6-release-process)
7. [Code Style](#7-code-style)
8. [Testing Standards](#8-testing-standards)

---

## 1. Local Development Setup

### Prerequisites

- **Node.js** ≥ 20 (use [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm))
- **pnpm** ≥ 9 (`npm install -g pnpm`)
- **Docker** + **Docker Compose** (for local services)

### First-time setup

```bash
# 1. Clone the repo
git clone https://github.com/sultan-saif/workspace.git
cd workspace

# 2. Copy environment file
cp .env.example .env
# Fill in DATABASE_URL, CRON_SECRET, and any other required values
# AI uses local Claude Code CLI — no API key needed

# 3. Start local services (Postgres + Redis)
docker compose up -d

# 4. Install dependencies
pnpm install

# 5. Run database migrations
pnpm --filter @sultan-saif/db db:migrate

# 6. Start all apps in development mode
pnpm dev
```

Apps will be available at:
- Web: http://localhost:3000
- API: http://localhost:8000

### Useful scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start all apps with hot reload |
| `pnpm build` | Build all packages and apps |
| `pnpm test` | Run all tests |
| `pnpm lint` | Lint all code |
| `pnpm typecheck` | TypeScript type-check |
| `pnpm format` | Format all files with Prettier |

---

## 2. Branch Strategy

We use **trunk-based development** with short-lived feature branches.

### Branch naming

```
<type>/<short-description>
```

| Type | Use for |
|---|---|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `chore/` | Tooling, deps, CI changes |
| `docs/` | Documentation only |
| `refactor/` | Code refactoring, no behavior change |
| `test/` | Test additions or fixes |

**Examples:**
- `feat/ai-search-endpoint`
- `fix/auth-token-expiry`
- `chore/update-dependencies`

### Protected branches

| Branch | Protection |
|---|---|
| `main` | Requires PR + 1 approval + passing CI. No direct pushes. |
| `develop` | Requires passing CI. Direct pushes allowed for minor fixes. |

### Typical workflow

```
feature branch → PR → review → squash merge → main
```

---

## 3. Commit Standards

We follow [Conventional Commits](https://www.conventionalcommits.org/).

```
<type>(<scope>): <short summary>

[optional body]

[optional footer]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`

**Examples:**
```
feat(api): add semantic search endpoint
fix(auth): handle expired JWT gracefully
chore(deps): update drizzle-orm to 0.35.0
```

Rules:
- Subject line ≤ 72 characters
- Use imperative mood ("add" not "added")
- Reference issues in footer: `Fixes #42`

---

## 4. Code Review Process

### Author responsibilities

1. **Self-review** your diff before requesting review — read every line
2. Keep PRs **focused** — one logical change per PR
3. Fill out the **PR template** completely
4. Link the related issue in the description
5. Keep PRs small: aim for < 400 lines changed (excluding generated code)

### Reviewer responsibilities

1. Review within **1 business day** of assignment
2. Look for: correctness, security, performance, test coverage, readability
3. Use GitHub's suggestion feature for small fixes
4. Mark blocking comments clearly: `[BLOCKING]` vs `[OPTIONAL]` vs `[NIT]`
5. Approve only when all blocking comments are resolved

### Review checklist

- [ ] Does the code do what the description says?
- [ ] Are there sufficient tests? Are edge cases covered?
- [ ] Are there any security concerns (injection, auth, data exposure)?
- [ ] Is error handling correct?
- [ ] Is there any unnecessary complexity?
- [ ] Are environment variables or secrets handled safely?

### Merging

- Use **squash merge** for feature branches (keeps `main` history clean)
- Delete the branch after merging
- The PR author merges after approval (not the reviewer)

---

## 5. CI/CD Pipeline

All PRs and pushes to `main` trigger the CI pipeline:

```
push/PR → lint → typecheck → test → build → [deploy to staging if main]
```

### Pipeline stages

| Stage | Runs on | Blocks merge |
|---|---|---|
| Lint | All PRs | Yes |
| TypeScript | All PRs | Yes |
| Tests | All PRs | Yes |
| Build | All PRs | Yes |
| Deploy Staging | `main` push only | N/A |
| Smoke Test | After staging deploy | N/A |

### Required secrets (GitHub Actions)

| Secret | Description |
|---|---|
| `CODECOV_TOKEN` | Code coverage reporting |
| `STAGING_DEPLOY_TOKEN` | Deploy credentials for staging env |
| `PROD_DEPLOY_TOKEN` | Deploy credentials for production env |

---

## 6. Release Process

We use **semantic versioning** (semver): `MAJOR.MINOR.PATCH`

| Increment | When |
|---|---|
| `PATCH` | Bug fixes, non-breaking changes |
| `MINOR` | New features, non-breaking |
| `MAJOR` | Breaking changes |

### Release steps

1. Ensure `main` is green (all CI passes)
2. Create and push a version tag:
   ```bash
   git tag v1.2.0
   git push origin v1.2.0
   ```
3. The `release.yml` workflow automatically:
   - Builds the project
   - Deploys to production
   - Creates a GitHub Release with auto-generated notes
4. Monitor the deployment in the production environment dashboard

### Hotfix process

1. Branch off `main`: `git checkout -b fix/critical-issue main`
2. Apply the fix + tests
3. PR directly to `main` (skip develop)
4. After merge, tag a patch release immediately

---

## 7. Code Style

All formatting is enforced by Prettier and ESLint in CI.

### Run locally

```bash
pnpm format        # fix formatting
pnpm lint          # lint (shows errors)
```

### Key rules

- TypeScript: `strict` mode, no implicit `any`
- Prefer `type` imports: `import type { Foo } from "./foo"`
- No `console.log` in production code (use structured logger)
- All exported functions should have JSDoc for public-facing packages

---

## 8. Testing Standards

### Test types

| Type | Tool | Location | When to write |
|---|---|---|---|
| Unit | Vitest | `src/**/*.test.ts` | All business logic, utils |
| Integration | Vitest | `src/**/*.integration.test.ts` | DB queries, API routes |
| E2E | Playwright | `e2e/` | Critical user flows |

### Coverage targets

- **Minimum:** 60% lines/functions/branches on core modules
- New features must ship with tests
- Bug fixes must include a regression test

### Running tests

```bash
pnpm test           # run in watch mode (dev)
pnpm test:ci        # single run for CI
```

---

*Last updated: 2026-03-29 | Maintained by CTO*
