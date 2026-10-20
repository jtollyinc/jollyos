# Notes for coding agents

- Never add a `Co-Authored-By:` trailer (or any email address other than `@example.com`) to a commit message. The `commit-msg` hook in `.githooks/` rejects them and `scripts/scrub-check.sh --history` fails CI on them.
- Commit as `JollyOS Contributors <contributors@example.com>`.
- Run `npm run lint && npx tsc --noEmit && npm test && bash scripts/scrub-check.sh` before committing.
- Nothing personal: all sample data is fictional (demo user "Alex Rivera").
