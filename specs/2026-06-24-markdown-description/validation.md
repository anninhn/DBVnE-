# Markdown Description — Validation

## V1 — Dependency installed

```bash
grep -E "react-markdown|remark-gfm" package.json
```
**Pass**: both packages listed in `dependencies`.

## V2 — Build compiles

```bash
npm run build
```
**Pass**: exit 0, no TypeScript errors. The new `Markdown.tsx` is a client component imported by a server component (the detail page) — confirm no "server component can't import client component" errors (it can import, just can't pass non-serializable props; we pass only a string).

## V3 — Markdown renders (mutation test)

Set a Markdown-rich description in the DB:

```sql
UPDATE datasets SET description = '# Tiêu đề test

Đoạn **bold** và `code`.

- Item một
- Item hai

| Cột | Giá |
|-----|-----|
| a   | 1   |
| b   | 2   |' WHERE slug='ho-so-34-tinh-thanh-2025';
```

Refresh `/datasets/ho-so-34-tinh-thanh-2025`, Dataset card tab. Manually verify:

- [ ] "Tiêu đề test" renders as a large bold heading (not literal `# Tiêu đề test`).
- [ ] "bold" is bold; "code" is in a monospace pill.
- [ ] Two bullet items render with disc markers.
- [ ] A proper table renders with header row + 2 data rows + visible borders.

Then revert to the original prose description (re-run the `description` portion of `006`, or `UPDATE` it back).

## V4 — Original prose still renders

After revert, the description is plain prose (no Markdown syntax). Manually verify:

- [ ] It renders as a clean paragraph (no literal characters showing, no broken layout).

## V5 — No raw HTML injection

Set a description containing an HTML tag:

```sql
UPDATE datasets SET description = 'Hello <script>alert(1)</script> world' WHERE slug='ho-so-34-tinh-thanh-2025';
```

Refresh. **Pass**: the `<script>` tag is rendered as literal text or stripped — it does **not** execute. (react-markdown disables raw HTML by default.)

Revert.

## Not required

- YAML frontmatter parsing.
- Syntax-highlighted code blocks.
- A Markdown editor / preview in any form.
- Changes to the data dictionary display (separate spec).
