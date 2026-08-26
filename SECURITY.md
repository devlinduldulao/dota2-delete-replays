# Security Policy

## No external contributions

This is a **read-only open source** project. The source code is public so you can
audit exactly what runs on your machine, but **pull requests and external
contributions are not accepted**. Interaction limits on the repository restrict
issues and pull requests to collaborators only.

This is a deliberate supply-chain security measure: the only code that ships to
npm is code written and reviewed by the maintainer.

## Reporting a vulnerability

Please **do not** open a public issue for security reports.
Use [GitHub private vulnerability reporting](https://github.com/devlinduldulao/dota2-delete-replays/security/advisories/new)
instead.

## Supply-chain hardening in place

- **Branch protection on `main`** — force pushes and branch deletion are blocked; linear history required.
- **GitHub Actions locked down** — `GITHUB_TOKEN` defaults to read-only; workflows from forked PRs require manual approval before they can run.
- **Secret scanning + push protection** — enabled, so credentials can never be committed.
- **Dependabot** — vulnerability alerts and automated security-fix PRs (from GitHub's own bot, not third parties).
- **npm provenance** — releases are published with [npm provenance](https://docs.npmjs.com/generating-provenance-statements), linking each package version to the exact CI run and commit that built it.
- **Minimal dependencies** — the CLI ships with only two runtime dependencies (`commander`, `chalk`), both bundled at build time.

## Verifying what you installed

```bash
# Check the provenance of the installed package
npm audit signatures

# The package ships a single bundled file — you can read every line:
cat "$(npm root -g)/dota2-delete-replays/dist/cli.js"
```
