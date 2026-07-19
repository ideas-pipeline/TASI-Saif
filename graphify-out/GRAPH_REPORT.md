# Graph Report - .  (2026-07-19)

## Corpus Check
- Corpus is ~4,415 words - fits in a single context window. You may not need a graph.

## Summary
- 119 nodes · 122 edges · 17 communities (14 shown, 3 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Turbo Build Pipeline
- AI Idea Generation Sources
- Engineering Standards and Infra
- Kanban Board UI
- Prettier Configuration
- Database Schema and Client
- Vercel Deployment Config
- Vercel App Config
- Next.js App Shell
- Shared Type Definitions
- API Ideas Router
- Next.js Type Stubs
- Initial DB Migration

## God Nodes (most connected - your core abstractions)
1. `fetchAllSources()` - 7 edges
2. `tasks` - 7 edges
3. `Engineering Standards (sultan-saif)` - 7 edges
4. `Local Development Setup` - 4 edges
5. `build` - 3 edges
6. `outputs` - 3 edges
7. `.next/**` - 3 edges
8. `dev` - 3 edges
9. `typecheck` - 3 edges
10. `Pull Request Template and Checklist` - 3 edges

## Surprising Connections (you probably didn't know these)
- `Pull Request Template and Checklist` --conceptually_related_to--> `CI/CD Pipeline`  [INFERRED]
  .github/PULL_REQUEST_TEMPLATE.md → CONTRIBUTING.md
- `Pull Request Template and Checklist` --conceptually_related_to--> `Testing Standards`  [INFERRED]
  .github/PULL_REQUEST_TEMPLATE.md → CONTRIBUTING.md
- `Local Development Setup` --references--> `pnpm Workspace Monorepo Layout`  [INFERRED]
  CONTRIBUTING.md → pnpm-workspace.yaml
- `Code Review Process` --references--> `Pull Request Template and Checklist`  [EXTRACTED]
  CONTRIBUTING.md → .github/PULL_REQUEST_TEMPLATE.md
- `Local Development Setup` --references--> `PostgreSQL + pgvector Service`  [EXTRACTED]
  CONTRIBUTING.md → docker-compose.yml

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **PR Lifecycle Workflow** — contributing_branch_strategy, contributing_conventional_commits, contributing_code_review_process, contributing_ci_cd_pipeline, contributing_release_process, _github_pull_request_template_pr_checklist [EXTRACTED 1.00]

## Communities (17 total, 3 thin omitted)

### Community 0 - "Turbo Build Pipeline"
Cohesion: 0.10
Nodes (20): ^build, coverage/**, dist/**, dependsOn, outputs, cache, cache, persistent (+12 more)

### Community 1 - "AI Idea Generation Sources"
Cohesion: 0.24
Nodes (11): generateIdeasFromSources(), DevToArticle, fetchAllSources(), fetchDevTo(), fetchGitHubTrending(), fetchHackerNews(), fetchRedditProgramming(), GHSearchResult (+3 more)

### Community 2 - "Engineering Standards and Infra"
Cohesion: 0.21
Nodes (12): Pull Request Template and Checklist, Trunk-Based Branch Strategy, CI/CD Pipeline, Code Review Process, Conventional Commits Standard, Engineering Standards (sultan-saif), Local Development Setup, Semver Release Process (+4 more)

### Community 3 - "Kanban Board UI"
Cohesion: 0.18
Nodes (7): COLUMNS, DraggableCardProps, DroppableColumnProps, KanbanBoard(), NEXT_LABEL, NEXT_STATUS, SOURCE_COLORS

### Community 4 - "Prettier Configuration"
Cohesion: 0.20
Nodes (9): arrowParens, bracketSpacing, endOfLine, printWidth, semi, singleQuote, tabWidth, trailingComma (+1 more)

### Community 5 - "Database Schema and Client"
Cohesion: 0.39
Nodes (6): client, db, Idea, ideas, ideaStatusEnum, NewIdea

### Community 6 - "Vercel Deployment Config"
Cohesion: 0.25
Nodes (7): buildCommand, crons, framework, ignoreCommand, installCommand, outputDirectory, $schema

### Community 7 - "Vercel App Config"
Cohesion: 0.25
Nodes (7): buildCommand, crons, framework, ignoreCommand, installCommand, outputDirectory, $schema

### Community 8 - "Next.js App Shell"
Cohesion: 0.29
Nodes (4): nextConfig, cairo, metadata, .next/**

### Community 9 - "Shared Type Definitions"
Cohesion: 0.33
Nodes (5): ApiError, ApiResponse, GeneratedIdea, Idea, IdeaStatus

## Knowledge Gaps
- **57 isolated node(s):** `semi`, `singleQuote`, `tabWidth`, `useTabs`, `trailingComma` (+52 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `outputs` connect `Turbo Build Pipeline` to `Next.js App Shell`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **What connects `semi`, `singleQuote`, `tabWidth` to the rest of the system?**
  _57 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Turbo Build Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._