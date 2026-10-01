# ResumePreps design system

**Stance: a calm operator's console for a stressful task.** The pipeline is the hero. Everything else stays quiet: one typeface, one accent, hairlines instead of shadows, motion only when someone acts.

Source of truth: `src/index.css` (token values) and `tailwind.config.ts` (how Tailwind exposes them). We use shadcn/ui components, but the tokens, radii and shadows are our own.

## Color

All tokens are OKLCH channel triples (`L C H`). Tailwind reads them as `oklch(var(--token) / <alpha>)`, so opacity modifiers such as `bg-primary/10` work. Outside Tailwind, write `oklch(var(--border))`, never `hsl(...)`.

| Role | Token (Tailwind) | Light | Dark |
| --- | --- | --- | --- |
| Canvas (page) | `--background` (`bg-background`) | 0.985 0.002 250 | 0.17 0.006 255 |
| Surface (cards, inputs, sheets) | `--card` / `--popover` (`bg-card`) | 1 0 0 | 0.21 0.007 255 |
| Well / hover / muted fill | `--muted`, `--secondary`, `--accent` | 0.962 0.004 255 | 0.25 0.008 255 |
| Ink (primary text) | `--foreground`, `--rp-ink` | 0.22 0.01 255 | 0.95 0.004 255 |
| Ink muted (secondary text) | `--muted-foreground` | 0.50 0.012 255 | 0.72 0.01 255 |
| Ink 2 / Ink 3 (legacy) | `--rp-ink-2`, `--rp-ink-3` | 0.45 / 0.535 | 0.78 / 0.68 |
| Hairline | `--border`, `--rp-rule` | 0.905 0.005 255 | 0.29 0.008 255 |
| Accent (ink blue) | `--primary`, `--rp-accent`, `--ring` | 0.52 0.14 250 | 0.68 0.13 250 |
| Destructive | `--destructive` | 0.53 0.19 27 | 0.68 0.17 25 |

Measured contrast on the lightest and darkest surfaces they sit on. Every text token clears WCAG AA (4.5:1) in both themes:

| Text token | Light, worst case | Dark, worst case |
| --- | --- | --- |
| ink | 15.5:1 | 13.8:1 |
| ink-muted / muted-foreground | 5.4:1 | 6.5:1 |
| rp-ink-3 (was 3.0:1 light, 2.1:1 dark) | 4.6:1 | 5.6:1 |
| accent text / destructive text | 4.9:1 / 5.2:1 | 5.6:1 / 5.1:1 |
| text on primary button | 5.5:1 | 6.7:1 |
| status text (all four) | ≥ 4.6:1 | ≥ 6.0:1 |

`rp-ink/55` style opacity tints are **not** covered by these numbers. Use `text-muted-foreground` or `text-rp-ink-3` for secondary text instead of fading ink.

**Accent rule.** Ink blue marks primary actions, the selected state and focus. It is not for decoration, section labels or icons. There are no gradients, no purple and no glow.

### Status colors

Status is shown as **a 6px dot or colored text, never a filled card or pill.**

| Status | Class | Light | Dark |
| --- | --- | --- | --- |
| Applied | `text-status-applied` | 0.52 0.12 250 | 0.74 0.11 250 |
| Interview | `text-status-interview` | 0.53 0.13 65 | 0.80 0.13 75 |
| Offer | `text-status-offer` | 0.52 0.12 155 | 0.76 0.13 155 |
| Rejected | `text-status-rejected` | 0.53 0.16 25 | 0.72 0.15 25 |

```tsx
<span className="inline-flex items-center gap-1.5 text-meta text-status-interview">
  <span className="status-dot" aria-hidden />
  Interview
</span>
```

`.status-dot` uses `currentColor`, so set the color on the parent. Always pair it with the word. Color is never the only signal.

## Type

There is one family, **Geist**, with a system-ui fallback. **Geist Mono** is for data only: dates, salaries and IDs (`font-mono` or `.data`, both of which also set tabular figures). Both fonts load from a single `<link>` in `index.html`.

Sizes are in rem, so they follow the user's browser font size. Each size carries its own line height and tracking:

| Class (alias) | Size / line | Tracking | Use |
| --- | --- | --- | --- |
| `text-xs` (`text-caption`) | 12 / 16 | +0.01em | Captions, table headers, labels. The floor for readable text. |
| `text-meta` | 13 / 18 | +0.005em | Meta rows, secondary controls, nav links |
| `text-sm` (`text-body`) | **14 / 20** | 0 | **Base UI text** (body default) |
| `text-base` (`text-body-lg`) | 16 / 24 | −0.005em | Lead paragraphs, reading text |
| `text-xl` (`text-title`) | 20 / 28 | −0.01em | Panel and page titles |
| `text-3xl` (`text-headline`) | 28 / 34 | −0.02em | Section headlines, big counts |
| `text-5xl` (`text-display`) | 40 / 44 | −0.03em | Display |
| `text-hero` | 56 / 58 | −0.035em | Marketing hero only, never in the product |

Tailwind's legacy keys snap onto this scale: `lg` = 16, `2xl` = 20, `4xl` = 28, and `6xl`/`7xl` = 40. Weights are 400, 500 and 600 only; `font-bold` and heavier render at 600, and `font-light` at 400. Titles use `leading-tight`, never `leading-none`.

- Labels are sentence case at `text-xs font-medium`. Do not add `uppercase tracking-widest` eyebrows.
- Use `tabular-nums` on anything that counts or lines up. Tables, `[role=grid]` and `<time>` already get it.
- Keep reading text to about 72ch (`max-w-[72ch]`).

## Shape and space

- 4px grid: 4, 8, 12, 16, 24, 32, 48, 64.
- Radius: `rounded-md` (6px) for controls, `rounded-lg` (10px) for cards, sheets, popovers and menus. `xl`, `2xl` and `3xl` are capped at 10px, and `rounded-full` is for avatars, dots and switches only.
- Menu items are `rounded-md` inside a `rounded-lg` p-1 menu, so the corners stay concentric.
- Control height is 36px (`h-9`); `sm` is 32 and `lg` is 40. Table header rows are 32px.
- Borders are 1px hairlines (`border-border`).
- **Cards have no shadow.** `shadow-sm` through `shadow-2xl` resolve to nothing. Floating layers (popover, dropdown, select, tooltip, dialog, sheet, toast) use `shadow-overlay`.
- The overlay scrim is `bg-scrim`: black at 40% in light, 60% in dark.

## Materials

Translucency (`.material-bar`, a 16px blur) belongs only on chrome that content scrolls beneath, which today means the marketing nav. The app header, toolbars and overlays are solid. Never put glass on glass. Under `prefers-reduced-transparency` every backdrop filter is removed and bars turn solid.

## Motion

| What | How |
| --- | --- |
| Press | `active:scale-[0.98]` plus a darker fill in about 90ms on pointer-down. This is built into `Button` and `Toggle`; add `.pressable` to clickable cards. |
| State change (hover, color) | 150ms, `ease-out` (`duration-state`) |
| Popover, menu, select, tooltip | Scale from 0.96 plus fade, from the Radix `transform-origin`, with a 4px slide that exits the way it came. 150ms in (ease-out), 100ms out (ease-in). |
| Dialog | Centered scale from 0.96 plus fade. No slide. 200ms in, 150ms out. |
| Sheet | One duration (`duration-sheet`, 280ms) both ways: ease-out in, ease-in out |
| Toast | Exits in the direction it entered; swiping right only on a swipe dismiss |
| framer-motion | `MotionConfig` in `main.tsx` sets a critically damped spring (`bounce: 0, duration: 0.35`) and `reducedMotion="user"`. Add bounce only after a flick. |

Rules:
- Never use `transition-all`; name the properties: `transition-colors`, `transition-press` (transform plus colors), `transition-[width]`, and so on.
- Animate `transform` and `opacity`. Do not animate layout properties, except progress bars (`transition-[width]`).
- Allow one orchestrated moment per screen (for example the landing hero entrance, or a job row moving between stages). There are no scroll-triggered fades and no per-card hover lifts.
- Under `prefers-reduced-motion`, transforms, slides, scaling and loops are disabled; short opacity and color fades remain, and spinners keep spinning because they report status.
- Under `prefers-contrast: more`, hairlines, inputs and muted text get stronger.

## Do and don't

| Do | Don't |
| --- | --- |
| Use shadcn components with the tokens as they are | Hard-code hex, `hsl()` or `bg-black/80` |
| Use `text-muted-foreground` for secondary text | Fade ink with `text-rp-ink/45` |
| Use a hairline border to separate | Put a shadow under a card |
| Write sentence-case labels at `text-xs font-medium` | Use ALL CAPS with wide tracking |
| Use a dot or text for status | Use filled status pills or colored cards |
| Use Geist Mono for dates, money and IDs | Use mono as decoration |
| Make the CTA say exactly what happens ("Start free") | Append "→" to buttons and links, or use sparkle icons as decoration |
| Separate meta with commas or layout | Write "A · B · C" strings |
| Leave empty states as one sentence plus the first action | Use illustrations, mascots or gradient blobs |
| Use `cn()` (it knows our custom tokens) | Concatenate conflicting classes by hand |

## Adding tokens

1. Add the value to `:root` and `.dark` in `src/index.css`, and check contrast if it is a text color.
2. Expose it in `tailwind.config.ts`.
3. If it is a new size, shadow, transition or duration key, register it in `src/lib/utils.ts` (`extendTailwindMerge`). Otherwise `cn()` will drop classes it thinks conflict with it.
