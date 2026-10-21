# Design system

JollyOS is built from a small set of primitives in `components/jolly/` and a
handful of rules. The rules matter more than the components: they are what
make the app usable on a bad day, on a phone, with one thumb.

## The rules (ADHD-first)

1. **One thing louder than everything else.** Every page has at most one
   `HeroStrip`. It says what needs you now and offers one action.
2. **Hide detail, never obligations.** Sections fold to a truthful one-line
   teaser plus a count. Anything that needs you stays visible when folded.
3. **44px tap targets.** Every button, row and tab is at least 44px on both
   axes (`.touch-target`, `.btn`, `.field`). Labels are never below 11px.
4. **Remember the fold.** `CollapsibleSection` and `FolderGroup` persist their
   state per `panelId` in localStorage. A choice survives reloads.
5. **Instant or it didn't happen.** Captures and swipes update the UI
   optimistically; a failed write shows one honest line instead of silently
   losing the input.
6. **Calm chrome.** One accent colour. Topic accents are landmarks (the same
   colour for the same topic everywhere), never status colours. Status is
   carried by `Chip` tones only.
7. **Reduced motion is respected globally** (`prefers-reduced-motion` in
   `globals.css`). No animation is load-bearing.
8. **Finished action screens, not documents.** Short, dense, few clicks.
9. **Every screen says what it is for.** One plain line under the title and a
   (?) that answers three questions: what it does, one example, how to start.
   The copy lives in `lib/help.ts`, one entry per page, so there is one wording
   to keep true. Pass it as `<PageHeader help={HELP.jobs} />`.
10. **An empty state is a screen, not a hole.** It says why it is empty and
   offers exactly one next action. "Needs setup" must name something the owner
   can actually do from where they are standing.

## Tokens

All colours, radii and shadows are CSS variables in `app/globals.css`
(`:root`), exposed to Tailwind through `tailwind.config.ts` as RGB channels so
opacity modifiers work (`bg-surface/60`). Change the theme by editing the one
`:root` block.

| Token | Purpose |
|---|---|
| `bg`, `surface`, `surface-2`, `surface-hover` | page and card backgrounds |
| `accent`, `accent-bright`, `accent-soft` | the single brand accent |
| `text-primary`, `text-muted`, `text-subtle` | three text levels, all legible |
| `success`, `warning`, `danger`, `info` | status only, via `Chip` and `Notice` |
| `--radius-card`, `--radius-control` | 16px cards, 12px controls |
| `[data-topic-accent=…]` | topic landmarks: today, jobs, news, you, decisions |

## Layout

- `PageShell` (wide, 1500px) or `PageShell width="narrow"` (768px) is the
  outermost wrapper of every page. Nothing else sets page padding.
- Desktop: `Sidebar` (256px) + scrolling `main`. Phone: `TopBar` + `MobileNav`
  bottom bar with Home, up to four quick-tab modules and Settings; the "All"
  sheet lists every module. No horizontal scrolling at the bottom edge.
- The demo banner sits above everything in demo mode.

## Primitives (`components/jolly/Foundation.tsx`)

| Component | Use |
|---|---|
| `Card` | the surface everything sits on |
| `PageShell`, `PageHeader` | page root and title row (title, lede, actions) |
| `CollapsibleSection` | a folding card with icon, count, teaser, accent |
| `FolderGroup` | a folding group of cards with preview chips (`FolderGroup.tsx`) |
| `HeroStrip` | the one loud thing + one action |
| `ToolTile` | home grid tile with an optional badge |
| `StoryCard` | a feed item with source and age |
| `Chip`, `Notice`, `EmptyState` | status marks, inline messages, empty lanes |
| `HelpButton` | the (?) beside a page title; a native `<dialog>` over `lib/help` |
| `Prose` | minimal markdown (bullets, bold, italic) for model output |
| `SideDrawer` | a right-hand sheet on a native `<dialog>` |

Form controls use the `.field`, `.btn-primary`, `.btn-ghost`, `.btn-quiet`
classes from `globals.css`.

## Writing a new page

```tsx
<PageShell>
  <PageHeader title="Thing" help={HELP.thing} />
  <HeroStrip title="Right now" action={{ href: "/thing/new", label: "Do it" }}>…</HeroStrip>
  <CollapsibleSection panelId="thing:details" title="Details" count={3} teaser="…" accent="jobs">…</CollapsibleSection>
</PageShell>
```
