# Markdown Description

> **Branch**: `f1-dataset-catalog` (continues on the F1 branch)
> **Type**: small improvement to the Dataset card tab
> **Status**: Spec — not yet implemented

## What this feature does

Renders the dataset description (`datasets.description`) as **Markdown** instead of a single plain-text paragraph, so dataset authors can write structured documentation (headings, lists, tables, code blocks) and have it display properly on the detail page.

## Why this feature exists

The detail page's "Dataset card" tab renders the description in a section labeled "README" (`src/app/datasets/[slug]/page.tsx:113-121`), but the rendering is just `<p>{dataset.description}</p>` — no Markdown parsing. The label "README" promises something richer than what's delivered.

Hugging Face renders the dataset card as a full Markdown README (headings, tables, YAML metadata, citation blocks). Authors write structured docs; readers get structured docs. This feature brings our description rendering up to that standard.

The description column already exists in the database (`datasets.description TEXT`, populated by seed `006`). The data model does not change — only how the string is rendered.

## Current state

- `datasets.description` — TEXT column. For the hero dataset, contains a single paragraph of prose.
- `src/app/datasets/[slug]/page.tsx:118` — renders as `<p className="...">{dataset.description}</p>`. Newlines collapse, Markdown syntax (`#`, `**`, `-`, `|`) shows as literal characters.
- No Markdown library in the project (`package.json` has no `react-markdown`, `marked`, `remark`, etc.).

## Target state

- Add `react-markdown` (+ `remark-gfm` for GitHub-Flavored Markdown: tables, strikethrough, task lists) as a dependency.
- Replace the `<p>` with a `<Markdown>` component that styles headings, paragraphs, lists, tables, code, and links to match the existing HF-style design tokens (navy headings, hairline borders under `<h2>`, monospace `<code>`, etc.).
- The hero dataset's description stays as-is for now (prose). The benefit shows when authors write richer Markdown — which becomes possible once this lands. (Optional follow-up: update the hero seed to a richer Markdown README. Not required here.)

## Decisions

### `react-markdown` + `remark-gfm`, not `marked`
`react-markdown` renders to React elements (safe by default — no `dangerouslySetInnerHTML`), integrates with Tailwind classes via a `components` map, and is the standard choice for Next.js apps. `remark-gfm` adds table/strikethrough/autolink support that plain CommonMark lacks. `marked` outputs raw HTML (XSS risk, harder to style). One new dependency, well-maintained.

### Style via a `components` map, not a global CSS sheet
`react-markdown` accepts a `components` prop mapping element types (`h2`, `p`, `ul`, `table`, `code`, `a`) to custom React components. We map each to Tailwind classes matching the existing page (e.g. `h2` → `text-lg font-semibold text-hf-text border-b border-hf-border`). This keeps styling co-located and avoids a separate markdown.css.

### No YAML frontmatter parsing
HF supports YAML metadata blocks at the top of the README (tags, license, etc.). We already store that metadata as structured DB columns (`tags`, `license`, `category`). Parsing YAML from the description would duplicate it. Out of scope.

### No raw HTML allowed
`react-markdown` disables raw HTML by default. Keep that default — descriptions are author-written but the platform is internal-only; disallowing raw HTML is still the safe default and prevents accidental breakage.

## Out of scope

- YAML frontmatter parsing.
- Richer seed content for the hero dataset (the existing prose stays; richer Markdown becomes *possible* but isn't written here).
- A Markdown editor for the upload form (upload is deferred).
- Syntax highlighting for code blocks (descriptions rarely contain code; add `rehype-highlight` later if needed).

## Personas

- **Ninh (Data Journalist)** — primary beneficiary: can now write dataset docs with structure (sections, field tables) instead of a wall of text.
- **Minh (Editor)** — reads clearer documentation.
