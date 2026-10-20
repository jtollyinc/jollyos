# Contributing

Thanks for looking. JollyOS is small on purpose; the bar for a change is "does
it keep the app calm and keep private data private".

## Setup

```bash
npm ci
cp .env.example .env     # optional; demo mode works with no .env
npm run dev              # http://localhost:3000
```

## Before you open a pull request

```bash
npx tsc --noEmit         # types
npm run lint             # zero errors, aim for zero warnings
npm test                 # Vitest
npm run build
bash scripts/scrub-check.sh --history
```

CI runs the same list plus gitleaks over the full history.

## Ground rules

- **Privacy routing is not optional.** Anything that talks to a model goes
  through `completeWithContext` with tagged segments. Never call a provider
  directly from a module.
- **No personal data in the repo.** Fixtures are fictional and say so. The
  scrub check must stay green; add to `scripts/scrub-terms.txt` rather than
  weakening it.
- **ADHD-first UI rules** in `docs/design-system.md` apply to every screen:
  44px targets, one loud thing, folded sections that remember.
- **Modules are self-contained.** Read `docs/modules.md`; add one import to
  the manifest list, nothing else in core.
- **Every `lib/` file starts with a header comment** saying what it is for
  and why it exists.
- Keep dependencies few. Prefer a small function over a package.

## Commit style

`type(scope): what changed` — e.g. `feat(brief): atom feed support`,
`fix(auth): clear cookie on logout`. Keep the subject under 72 characters.
