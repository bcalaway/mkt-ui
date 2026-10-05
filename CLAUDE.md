# Claude Code Instructions — mkt-ui

The market data platform's UI at `mkt.billandjessie.com`. The overview is in `README.md`; the plan and status are in mkt-data's `docs/phase-2.md` (Part B), which is the one place for status. Platform mechanics (CI/CD, secrets, Authentik, ingress) live in `bcalaway/nyc_pa_aws_gitops`: start with its `docs/app-platform.md`, and keep this repo consistent with it rather than re-explaining it here.

## Git

`main` is protected by the platform's ruleset: no direct pushes, no force-push, and `ci / Build, test, lint` must pass. Work on a branch, `git push` it right after every commit without asking, then open a PR (or update the open one). Bill merges, with one exception: for a PR that changes only docs (`docs/**`, `*.md`), Claude turns on auto-merge, so it merges once CI passes. Merging deploys to the hub automatically (no approval since 2026-10-04); docs-only merges don't deploy (`cd.yml` ignores them).

## Rules

- Short readable names (`UST-10Y-CMT`) in every view; no internal IDs on screen.
- Decimal strings from the API are shown as given, never parsed through floats for display or arithmetic that's shown back.
- The app's name is `mkt-ui`; its hostname is `mkt.billandjessie.com`. Keep `PUBLIC_HOST`, the Traefik rule and the platform's `blueprints/mkt-ui-oidc.yaml` in agreement.
- No secrets in code, in the repo, or on command lines. App secrets go in SSM under `/home-platform/mkt-ui/` (add a row to the platform's `docs/ssm-parameters.md`).
- Keep `deploy/docker-compose.yml`'s `mem_limit`; the hub deploy rejects services without one.
- Update mkt-data's `docs/phase-2.md` when a step lands.

## Testing where npm is blocked

Claude's sandbox usually can't reach the npm registry, so `npm ci` fails there. CI runs lint, build and tests (`docker build --target lint` / `--target test`). CI's logs aren't readable from the sandbox; read a failure from the check run's annotations (`gh api repos/bcalaway/mkt-ui/check-runs/<id>/annotations`).
