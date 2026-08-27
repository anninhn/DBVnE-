# Spec 1.2 — Design System

## Scope

Thiết lập HF design system: fonts, colors, CSS tokens. Foundation cho tất cả pages sau.

## Files

- `src/app/globals.css` — CSS custom properties + base styles
- `src/app/layout.tsx` — Google Fonts `<link>` tags

## Deliverables

### Fonts
- Source Sans 3 (400, 500, 600, 700) — body text
- IBM Plex Mono (400, 500, 600) — code, IDs, data values
- Load qua `<link>` trong layout.tsx (không CSS `@import` — Tailwind v4 incompatible)

### Color Tokens (CSS custom properties)
```
--hf-yellow: #FFD21E        — primary accent
--hf-yellow-hover: #FFC107   — accent hover
--hf-bg: #f9fafb             — page background
--hf-card: #ffffff            — card background
--hf-border: #e5e7eb         — borders
--hf-text: #111827            — primary text
--hf-muted: #6b7280           — secondary text
```

### Base Rules
- `body` font-family: Source Sans 3
- `code`, `pre`, `.font-mono`: IBM Plex Mono
- `a` color: inherit (no blue links by default)

## Decisions

### Google Fonts `<link>` thay vì CSS `@import`
**Why**: Tailwind v4 dùng `@import "tailwindcss"` — CSS `@import` cho fonts bị conflict.
**How**: `<link rel="stylesheet">` trong `<head>` qua layout.tsx.

## Out of Scope
- Không component (chỉ CSS + fonts)
- Không dark mode
- Không Tailwind config changes

## Validation
- `npm run build` exit 0
- Browser: Source Sans 3 load cho body (Network tab)
- Browser: IBM Plex Mono load cho `.font-mono` elements
- CSS custom properties hiển thị trong DevTools computed styles
