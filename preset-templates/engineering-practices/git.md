---
title: Git and releases
roles: [devops-engineer, lead-software-engineer, release-manager]
---
## Commits and branches
- One logical change per commit. Follow the project's convention; otherwise use Conventional Commits: type(scope): imperative summary. The message explains why, not only what.
- Don't commit build output, installed dependencies or generated files; update .gitignore first.
- Name branches like feat/short-description unless the project has its own scheme.
- Commit, push or open pull requests only when the task asks for it.

## Pull requests and review
- Keep pull requests small and focused, with a description of why and how to verify.
- In review, block on bugs and security problems; suggest, without blocking, on matters of taste.

## Semantic versioning
- MAJOR for breaking changes, MINOR for backward-compatible features, PATCH for fixes only. A wrong bump misleads every automated dependency updater.

## Destructive operations
- Before force-push, reset --hard, clean -f or rewriting history, check git status and make sure nothing uncommitted or shared would be lost. Prefer revert over reset and stash over discard. Don't run them unless the task explicitly asks.
