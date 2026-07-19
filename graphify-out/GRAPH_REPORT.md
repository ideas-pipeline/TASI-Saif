# Graph Report - .  (2026-07-19)

## Corpus Check
- Corpus is ~15,496 words - fits in a single context window. You may not need a graph.

## Summary
- 413 nodes · 413 edges · 36 communities (29 shown, 7 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.86)
- Token cost: 107,771 input · 0 output

## Community Hubs (Navigation)
- Graphify Skill Pipeline
- Root TypeScript Config
- Database Package Manifest
- Base Compiler Options
- Web App Package Manifest
- Turbo Build Pipeline
- API Package Manifest
- Lint and Format Tooling
- Root Package Manifest
- AI Package Manifest
- Engineering Standards and Infra
- Web App Dependencies
- Shared Package Manifest
- API Server Dependencies
- AI Idea Generation Sources
- Kanban Board UI
- App TypeScript Config
- Prettier Configuration
- Database Schema and Client
- Package TypeScript Config A
- Vercel Deployment Config
- Package TypeScript Config B
- Package TypeScript Config C
- Vercel App Config
- Shared Type Definitions
- API Ideas Router
- App Root Layout
- Next.js Config
- Next.js Type Stubs
- Initial DB Migration
- Neo4j Export
- Token Reduction Benchmark

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `compilerOptions` - 16 edges
3. `Graphify Pipeline` - 16 edges
4. `scripts` - 10 edges
5. `Incremental Update (--update)` - 8 edges
6. `scripts` - 7 edges
7. `scripts` - 7 edges
8. `fetchAllSources()` - 7 edges
9. `scripts` - 7 edges
10. `tasks` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Post-Commit Auto-Rebuild Hook` --semantically_similar_to--> `CI/CD Pipeline`  [INFERRED] [semantically similar]
  .claude/skills/graphify/references/hooks.md → CONTRIBUTING.md
- `Redis Service` --semantically_similar_to--> `FalkorDB Export`  [INFERRED] [semantically similar]
  docker-compose.yml → .claude/skills/graphify/references/exports.md
- `Project CLAUDE.md Graphify Rules` --conceptually_related_to--> `Fast Path Query on Existing Graph`  [INFERRED]
  CLAUDE.md → .claude/skills/graphify/SKILL.md
- `Cross-Repo Graph Merge` --conceptually_related_to--> `pnpm Workspace Monorepo Layout`  [INFERRED]
  .claude/skills/graphify/references/github-and-merge.md → pnpm-workspace.yaml
- `Native CLAUDE.md Integration` --references--> `Project CLAUDE.md Graphify Rules`  [INFERRED]
  .claude/skills/graphify/references/hooks.md → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Graphify Build Pipeline Stages** — _claude_skills_graphify_skill_ast_structural_extraction, _claude_skills_graphify_skill_semantic_extraction, _claude_skills_graphify_skill_extraction_cache, _claude_skills_graphify_skill_community_detection, _claude_skills_graphify_skill_god_nodes, _claude_skills_graphify_skill_graph_health_check, _claude_skills_graphify_skill_cost_tracker [EXTRACTED 1.00]
- **Graphify Optional Export Targets** — _claude_skills_graphify_references_exports_wiki_export, _claude_skills_graphify_references_exports_neo4j_export, _claude_skills_graphify_references_exports_falkordb_export, _claude_skills_graphify_references_exports_mcp_server, _claude_skills_graphify_references_exports_token_benchmark [EXTRACTED 1.00]
- **PR Lifecycle Workflow** — contributing_branch_strategy, contributing_conventional_commits, contributing_code_review_process, contributing_ci_cd_pipeline, contributing_release_process, _github_pull_request_template_pr_checklist [EXTRACTED 1.00]

## Communities (36 total, 7 thin omitted)

### Community 0 - "Graphify Skill Pipeline"
Cohesion: 0.08
Nodes (34): Graphify Skill Registration, URL Ingest (/graphify add), Watch Mode Auto-Rebuild, Graphify MCP Server, Wiki Export, Discrete Confidence Rubric, Hyperedges, Full-Path Node ID Format (+26 more)

### Community 1 - "Root TypeScript Config"
Cohesion: 0.07
Nodes (26): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+18 more)

### Community 2 - "Database Package Manifest"
Cohesion: 0.07
Nodes (26): drizzle-kit, dependencies, drizzle-orm, postgres, devDependencies, drizzle-kit, @types/node, typescript (+18 more)

### Community 3 - "Base Compiler Options"
Cohesion: 0.08
Nodes (23): ES2022, compilerOptions, declaration, declarationMap, esModuleInterop, exactOptionalPropertyTypes, isolatedModules, lib (+15 more)

### Community 4 - "Web App Package Manifest"
Cohesion: 0.09
Nodes (22): devDependencies, @types/node, @types/react, @types/react-dom, typescript, vitest, @types/node, typescript (+14 more)

### Community 5 - "Turbo Build Pipeline"
Cohesion: 0.10
Nodes (21): ^build, dependsOn, outputs, cache, cache, persistent, coverage/**, dist/** (+13 more)

### Community 6 - "API Package Manifest"
Cohesion: 0.10
Nodes (20): devDependencies, tsx, @types/node, typescript, vitest, @types/node, typescript, vitest (+12 more)

### Community 7 - "Lint and Format Tooling"
Cohesion: 0.11
Nodes (19): eslint, eslint-config-prettier, devDependencies, eslint, eslint-config-prettier, prettier, turbo, @types/node (+11 more)

### Community 8 - "Root Package Manifest"
Cohesion: 0.11
Nodes (18): description, engines, node, pnpm, name, packageManager, private, scripts (+10 more)

### Community 9 - "AI Package Manifest"
Cohesion: 0.11
Nodes (17): dependencies, @sultan-saif/shared, devDependencies, typescript, vitest, exports, @sultan-saif/shared, typescript (+9 more)

### Community 10 - "Engineering Standards and Infra"
Cohesion: 0.16
Nodes (15): FalkorDB Export, Cross-Repo Graph Merge, GitHub Repo Clone, Pull Request Template and Checklist, Trunk-Based Branch Strategy, CI/CD Pipeline, Code Review Process, Conventional Commits Standard (+7 more)

### Community 11 - "Web App Dependencies"
Cohesion: 0.13
Nodes (15): dependencies, @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, next, react, react-dom, @sultan-saif/shared (+7 more)

### Community 12 - "Shared Package Manifest"
Cohesion: 0.13
Nodes (14): devDependencies, typescript, vitest, exports, typescript, vitest, name, private (+6 more)

### Community 13 - "API Server Dependencies"
Cohesion: 0.15
Nodes (13): dependencies, drizzle-orm, hono, @hono/node-server, @sultan-saif/ai, @sultan-saif/db, @sultan-saif/shared, drizzle-orm (+5 more)

### Community 14 - "AI Idea Generation Sources"
Cohesion: 0.24
Nodes (11): generateIdeasFromSources(), DevToArticle, fetchAllSources(), fetchDevTo(), fetchGitHubTrending(), fetchHackerNews(), fetchRedditProgramming(), GHSearchResult (+3 more)

### Community 15 - "Kanban Board UI"
Cohesion: 0.18
Nodes (7): COLUMNS, DraggableCardProps, DroppableColumnProps, KanbanBoard(), NEXT_LABEL, NEXT_STATUS, SOURCE_COLORS

### Community 16 - "App TypeScript Config"
Cohesion: 0.20
Nodes (9): compilerOptions, outDir, rootDir, types, extends, include, src, ../../tsconfig.json (+1 more)

### Community 17 - "Prettier Configuration"
Cohesion: 0.20
Nodes (9): arrowParens, bracketSpacing, endOfLine, printWidth, semi, singleQuote, tabWidth, trailingComma (+1 more)

### Community 18 - "Database Schema and Client"
Cohesion: 0.39
Nodes (6): client, db, Idea, ideas, ideaStatusEnum, NewIdea

### Community 19 - "Package TypeScript Config A"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src, ../../tsconfig.json

### Community 20 - "Vercel Deployment Config"
Cohesion: 0.25
Nodes (7): buildCommand, crons, framework, ignoreCommand, installCommand, outputDirectory, $schema

### Community 21 - "Package TypeScript Config B"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src, ../../tsconfig.json

### Community 22 - "Package TypeScript Config C"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src, ../../tsconfig.json

### Community 23 - "Vercel App Config"
Cohesion: 0.25
Nodes (7): buildCommand, crons, framework, ignoreCommand, installCommand, outputDirectory, $schema

### Community 24 - "Shared Type Definitions"
Cohesion: 0.33
Nodes (5): ApiError, ApiResponse, GeneratedIdea, Idea, IdeaStatus

## Knowledge Gaps
- **238 isolated node(s):** `semi`, `singleQuote`, `tabWidth`, `useTabs`, `trailingComma` (+233 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Graphify Pipeline` connect `Graphify Skill Pipeline` to `Engineering Standards and Infra`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Lint and Format Tooling` to `Root Package Manifest`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Web App Dependencies` to `Web App Package Manifest`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **What connects `semi`, `singleQuote`, `tabWidth` to the rest of the system?**
  _238 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Graphify Skill Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.08021390374331551 - nodes in this community are weakly interconnected._
- **Should `Root TypeScript Config` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._
- **Should `Database Package Manifest` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._