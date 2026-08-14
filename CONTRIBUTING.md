# Contributing to MindForge

Thanks for your interest in contributing! MindForge is source available under
BUSL-1.1 — community contributions are welcome and encouraged.

## Reporting issues

- Search existing issues first to avoid duplicates.
- Include: what you did, what you expected, what happened, and your
  environment (OS, Docker version, MindForge version/commit).
- For bugs, a minimal reproduction is the fastest path to a fix.
- **Security issues**: please do not open a public issue. Email
  dengsha1990@gmail.com instead.

## Pull requests

1. **Open an issue first** for anything beyond a small fix, so we can agree
   on the approach before you invest time.
2. Fork the repo and create a branch from `main`.
3. Keep changes focused — one concern per PR.
4. Make sure checks pass before submitting:

   ```bash
   cd backend && python3 -m pytest tests/ -q
   cd frontend && npx tsc --noEmit && npx vite build
   ```

5. Describe the *why*, not just the *what*, in your PR description.

## Code guidelines

- **Backend** (Python / FastAPI): follow the existing module layout
  (`app/<domain>/{models,schemas,router,service}.py`); write endpoints must
  record an audit log via `audit_service.log_action`; prefer deterministic
  logic over extra LLM calls.
- **Frontend** (React / TypeScript / Tailwind): reuse existing components
  (`PageHeader`, `Toolbar`, `DataList`, `StatusBadge`, `ConfirmDialog`,
  `Toast`, `taskStore`) and the established design tokens before adding new
  ones.
- **Tests**: backend tests must mock LLM calls (see `tests/test_ingest_two_phase.py`).
- Keep diffs minimal and match the surrounding code style.

## Contributor License Agreement (lightweight)

By submitting a pull request or otherwise contributing code to this
repository, you agree that:

1. Your contribution is your original work (or you have the right to
   submit it), and
2. You grant the project maintainer (Suddennebbus) a perpetual, worldwide,
   non-exclusive, royalty-free, **irrevocable** license to use, modify,
   relicense, and redistribute your contribution **as part of MindForge** —
   including under the Business Source License 1.1, its Change License
   (GPLv3), and separate commercial licenses.

This keeps the project able to offer both the community version and future
commercial licensing without friction. If you cannot agree to these terms,
please do not submit code — issue reports and discussions are still very
welcome.

## License reminder

MindForge is **source available**, not OSI-approved open source. See
[LICENSE](LICENSE) and [docs/COMMERCIAL_LICENSE.md](docs/COMMERCIAL_LICENSE.md).
