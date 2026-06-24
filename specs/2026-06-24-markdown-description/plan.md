# Markdown Description — Plan

## Group 1 — Dependency

1. `npm install react-markdown remark-gfm`
2. Confirm both appear in `package.json` `dependencies`. Note: this adds a new dependency — approved by this spec (the constitution's "no new dependencies without user approval" rule is satisfied by the spec being approved).

## Group 2 — Markdown component

3. Create `src/app/datasets/[slug]/Markdown.tsx`:
   - `"use client"` — `react-markdown` is client-only (it uses React state internally).
   - Export a `<Markdown>{children}</Markdown>` wrapper around `ReactMarkdown` with `remarkPlugins={[remarkGfm]}`.
   - Pass a `components` map styling each element with Tailwind classes matching the page's HF tokens:
     - `h1` → `text-xl font-bold text-hf-text mt-6 mb-3`
     - `h2` → `text-lg font-semibold text-hf-text mt-5 mb-2 pb-1.5 border-b border-hf-border`
     - `h3` → `text-base font-semibold text-hf-text mt-4 mb-2`
     - `p` → `mb-2.5 text-hf-text leading-relaxed`
     - `ul` → `list-disc ml-5 mb-2.5`
     - `ol` → `list-decimal ml-5 mb-2.5`
     - `li` → `mb-1`
     - `code` (inline) → `font-mono text-sm bg-hf-bg-muted px-1.5 py-0.5 rounded`
     - `pre` → `bg-hf-bg-muted p-3 rounded-md overflow-x-auto mb-2.5 font-mono text-sm`
     - `a` → `text-hf-link hover:underline`
     - `strong` → `font-semibold text-hf-text`
     - `table` → `w-full border-collapse text-sm mb-2.5`
     - `th` → `text-left px-3 py-2 bg-hf-bg-subtle border border-hf-border font-medium text-hf-text`
     - `td` → `px-3 py-1.5 border border-hf-border text-hf-text`
     - `blockquote` → `border-l-4 border-hf-border pl-3 text-hf-text-muted italic mb-2.5`

## Group 3 — Wire into detail page

4. Edit `src/app/datasets/[slug]/page.tsx`:
   - Import the new component: `import Markdown from "./Markdown";`
   - Replace the description `<p>`:
     ```tsx
     // Before
     <p className="mb-2.5 text-hf-text leading-relaxed">{dataset.description}</p>
     // After
     <Markdown>{dataset.description}</Markdown>
     ```
   - Leave the "Nguồn:" line and the data dictionary list as-is (the dictionary list is replaced by the separate data-dictionary-table feature, but that's a different spec — don't touch it here).

## Group 4 — Verify

5. `npm run build` — exit 0.
6. Temporarily test Markdown rendering: set the hero dataset's description in the DB to a string containing a heading, list, and table:
   ```sql
   UPDATE datasets SET description = '# Test heading

   Some **bold** text and `code`.

   - Item 1
   - Item 2

   | Col | Val |
   |-----|-----|
   | a   | 1   |' WHERE slug='ho-so-34-tinh-thanh-2025';
   ```
   Refresh the detail page → confirm the heading, bold, code, list, and table all render correctly.
7. Revert the description to the original prose (re-pull from `006` or restore manually).
8. Confirm the original prose still renders cleanly (as a single paragraph, no literal `#` or `*` showing).
