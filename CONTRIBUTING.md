# Contributing

## Branch Workflow

- Create feature branches from `dev`.
- Merge feature branches into `dev` for staging validation.
- Promote by merging `dev` into `main`.
- Production deploys from `main` are manual by default.

## Local Setup

```bash
bash scripts/bootstrap.sh
pnpm check-env
pnpm dev
```

## Required Checks Before PR

```bash
pnpm check-env
pnpm lint
pnpm test
pnpm build
```

## Commit and PR Standards

- Use conventional commit messages.
- Keep PR scope focused.
- Include testing notes and deployment impact in PR description.
- Call out security-sensitive changes explicitly (auth, tokens, cookies, rate limiting, env contracts).
