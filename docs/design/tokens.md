# Design tokens (Warm)

Source of truth: `prototype/tokens.css`. The app (`apps/web/src/index.css`) maps these onto its shadcn/Tailwind theme.
Change a value in the prototype first, get it approved, then change it in the app.

## Colours

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#f7f4ee` | `#17140f` | Page background |
| `--surface` | `#fffdf9` | `#1f1b15` | Cards, dialogs, header, tables |
| `--surface-2` | `#f0ebe1` | `#28231b` | Table header, hover, badges, secondary buttons |
| `--ink` / `--ink-2` / `--ink-3` | `#26211b` / `#665e52` / `#978d7e` | `#f1ebdf` / `#b5ab98` / `#82786a` | Text: main, secondary, hints |
| `--line` | `#e4ddd0` | `#352f25` | Borders and dividers |
| `--accent` | `#c0502a` | `#ee8a63` | Primary action, current tab, links |
| `--accent-ink` | `#ffffff` | `#17140f` | Text on the accent |
| `--accent-soft` | `#f8e6dc` | `#3d2619` | Soft accent background |
| `--ok` / `--ok-bg` | `#16794c` / `#e2f5ec` | `#6fd6a0` / `#14322a` | Success, Ready |
| `--warn` / `--warn-bg` | `#9a5b00` / `#fdf0d8` | `#f0b34e` / `#36290f` | In progress, notices |
| `--bad` / `--bad-bg` | `#b42318` / `#fde8e6` | `#ff8f84` / `#3a1c19` | Errors, destructive |

## Type

| Token | Value |
| --- | --- |
| Headings | Georgia / Iowan Old Style serif, weight 600, letter-spacing -0.01em |
| UI text | system sans stack, 14 px, line-height 1.5 |
| Small text | 12.5 px (table headers uppercase, hints, badges) |
| Page title | 26 px |
| Numbers, code | system monospace |

## Shape and spacing

| Token | Value |
| --- | --- |
| Radius | 10 px (cards 13 px, dialogs 16 px, badges pill) |
| Table row | 48 px, header 32 px |
| Card padding | 18 px, grid gap 16 px |
| Control height | 32 px (small 26 px, inputs 36 px) |
| Shadow | `0 1px 2px rgba(60,40,10,.06)` on cards and buttons |
| Page width | 1080 px, 20 px side padding |

## Mapping to the app

Applied in `apps/web/src/index.css` (2026-11-17). Setting the
shadcn CSS variables (`--background`, `--card`, `--primary`, `--border`, `--muted`, `--destructive`, `--radius`) to the
values above for `:root` and `.dark`, loading the heading font, and tightening the table and dialog components. That
is the last session of roadmap phase 3.5.

Extra tokens in the app: `success`, `success-bg`, `warning`, `warning-bg`, `destructive-bg` (used by `Badge` variants
`success`, `warning`, `destructive`). Dark mode uses the `.dark` class set by `next-themes` (system by default, toggle in
the header). Headings (`h1`, `h2`, card and dialog titles) use the serif `--font-heading`.
