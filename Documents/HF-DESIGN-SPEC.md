# Hugging Face Hub -- Design Specification for Replication

> Compiled from live page inspection, brand assets, and source analysis.
> Intended for the 34 Tinh Thanh wiki project UI.

---

## 1. Source Repository

The Hugging Face Hub frontend is **closed source**. The codebase lives in a private
internal repository called `moon-landing` (github.com/huggingface/moon-landing -- 404
for external users, but referenced in public commit SHAs and job postings).

The closest open-source reference is **huggingface/chat-ui** (HuggingChat):
- SvelteKit + Svelte 5 + Tailwind CSS + MongoDB
- Repository: github.com/huggingface/chat-ui

**CSS framework on the Hub**: Custom build (`kube-{hash}/style.css`) combined with
**Tailwind CSS** utility classes applied inline throughout the HTML.

---

## 2. Typography

### Font Families

| Role | Font | Weights | Source |
|------|------|---------|--------|
| **Primary (body, UI)** | `Source Sans Pro` | 200, 300, 400, 600, 700, 900 (regular + italic) | Google Fonts |
| **Monospace (code, data labels)** | `IBM Plex Mono` | 400, 600, 700 | Google Fonts |
| **Math rendering** | KaTeX default | per KaTeX spec | cdnjs |

### Google Fonts Import URLs

```
https://fonts.googleapis.com/css2?family=Source+Sans+Pro:ital,wght@0,200;0,300;0,400;0,600;0,700;0,900;1,200;1,300;1,400;1,600;1,700;1,900&display=swap
https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap
```

### Type Scale (observed / Tailwind defaults)

| Element | Font Family | Size | Weight | Color |
|---------|------------|------|--------|-------|
| Page title (h1) | Source Sans Pro | 24-30px (text-2xl/3xl) | 700-800 | #1f2937 |
| Section heading (h2) | Source Sans Pro | 20-24px (text-xl/2xl) | 600-700 | #1f2937 |
| Sub-heading (h3) | Source Sans Pro | 18-20px (text-lg/xl) | 600 | #374151 |
| Body text | Source Sans Pro | 14-16px (text-sm/base) | 400 | #4b5563 |
| Small / caption | Source Sans Pro | 12-13px (text-xs) | 400 | #6b7280 |
| Tag pill label | Source Sans Pro | 12px (text-xs) | 600 | per category |
| Code / data | IBM Plex Mono | 13-14px | 400 | #1f2937 |
| Nav link | Source Sans Pro | 14px | 600 | #4b5563 |

### Line Height & Spacing

- Body line-height: 1.5 (Tailwind `leading-normal`)
- Headings line-height: 1.25 (Tailwind `leading-tight`)
- Paragraph spacing: `margin-bottom: 0.75rem` to `1rem`

---

## 3. Color System

### Brand Colors (from huggingface.co/brand)

| Token | Hex | Usage |
|-------|-----|-------|
| **Yellow (Primary)** | `#FFD21E` | Logo, primary accent, CTA backgrounds, active states, checkboxes |
| **Orange (Secondary)** | `#FF9D00` | Hover states, warm accents, warning badges |
| **Gray (Neutral)** | `#6B7280` | Secondary text, borders, placeholder text |

### UI Color Tokens (from designmd.co + live inspection)

| Token | Hex | Tailwind Equivalent | Usage |
|-------|-----|---------------------|-------|
| `--primary` | `#FFD21E` | amber-400 | Primary accent |
| `--secondary` | `#FAFAFA` | neutral-50 | Light backgrounds |
| `--bg-dark` | `#0D1117` | gray-900 | Dark mode background |
| `--accent` | `#F3F4F6` | gray-100 | Subtle backgrounds, dividers |

### Semantic Colors

| Context | Background | Text | Border |
|---------|-----------|------|--------|
| Page background | `#FFFFFF` | -- | -- |
| Sidebar background | `#F9FAFB` (gray-50) | `#111827` (gray-900) | `#E5E7EB` (gray-200) |
| Card background | `#FFFFFF` | `#111827` | `#E5E7EB` (gray-200) |
| Card hover | `#F9FAFB` (gray-50) | `#111827` | `#D1D5DB` (gray-300) |
| Header background | `#FFFFFF` | `#111827` | `#E5E7EB` (bottom border) |
| Code block bg | `#1F2937` (gray-800) | `#E5E7EB` (gray-200) | -- |
| Input / textarea | `#FFFFFF` | `#111827` | `#D1D5DB` (gray-300) |
| Input focus border | `#FFD21E` | -- | `#FFD21E` (2px) |
| Active tab | underline `#FFD21E` | `#111827` | -- |
| Inactive tab | transparent | `#6B7280` (gray-500) | -- |
| Error | `#FEE2E2` (red-100) | `#991B1B` (red-800) | `#F87171` (red-400) |
| Success | `#D1FAE5` (green-100) | `#065F46` (green-800) | `#34D399` (green-400) |
| Warning | `#FEF3C7` (amber-100) | `#92400E` (amber-800) | `#FBBF24` (amber-400) |

### Text Colors

| Role | Hex | Tailwind |
|------|-----|----------|
| Primary text | `#111827` | gray-900 |
| Secondary text | `#4B5563` | gray-600 |
| Tertiary / muted | `#6B7280` | gray-500 |
| Placeholder | `#9CA3AF` | gray-400 |
| Link | `#2563EB` | blue-600 |
| Link hover | `#1D4ED8` | blue-700 |
| Inverse (on dark bg) | `#F9FAFB` | gray-50 |

---

## 4. Layout Structure

### 4.1 Page Anatomy

```
+------------------------------------------------------+
|  HEADER (fixed top, h-14, white bg, border-bottom)   |
+------------------------------------------------------+
|           |                                           |
| SIDEBAR   |   MAIN CONTENT                           |
| (w-64)    |   (flex-1)                                |
|           |                                           |
| Filters   |   Search bar + Sort dropdown              |
| Tags      |   Grid of Cards                           |
| Categories|                                           |
|           |                                           |
+-----------+-------------------------------------------+
```

### 4.2 Header / Navigation

- **Height**: 56px (h-14)
- **Background**: `#FFFFFF`
- **Border**: `1px solid #E5E7EB` (bottom only)
- **Layout**: Flex row, space-between
- **Left section**: HF logo (hugging face emoji icon) + nav links
  - Nav links: Models, Datasets, Spaces, Buckets, Docs, Enterprise, Pricing
  - Font: Source Sans Pro, 14px, weight 600
  - Color: `#4B5563` (default), `#111827` (active)
  - Hover: `#111827`, subtle underline
  - Active page indicator: yellow underline or bolder weight
- **Right section**: Search icon, Theme toggle (sun/moon), Login/Sign Up buttons
- **Logo**: Hugging Face emoji-style icon (the hugging face character)
- **Sticky**: `position: sticky; top: 0; z-index: 50`

### 4.3 Sidebar (Listing Pages)

- **Width**: 256px (w-64)
- **Background**: `#F9FAFB` (gray-50) or `#FFFFFF` with right border
- **Border**: `1px solid #E5E7EB` (right side)
- **Padding**: 16px (p-4)
- **Sections**: Main, Tasks, Libraries, Languages, Licenses, Other
- **Section headers**: 12px uppercase, weight 600, color `#6B7280`
- **Filter items**: Checkbox + label, 14px, color `#374151`
- **Active filter**: Checkbox filled with `#FFD21E` background
- **Collapsible**: Each section can expand/collapse with chevron icon

### 4.4 Main Content Area

- **Padding**: 24px (p-6)
- **Max-width**: Full width of remaining space (no max-width constraint on listing pages)
- **Detail pages**: max-width ~900px centered for README content

---

## 5. Card Component

### 5.1 Dataset / Model Card (Listing)

```
+------------------------------------------------------+
| [Icon] owner/dataset-name              Updated X ago  |
|                                                       |
|  Short description text truncated to 2 lines...      |
|                                                       |
|  [tag] [tag] [tag] [tag]                              |
|                                                       |
|  Downloads: 1.2M    Likes: 34                         |
+------------------------------------------------------+
```

**Specifications:**

| Property | Value |
|----------|-------|
| Padding | 16px (p-4) |
| Border | 1px solid #E5E7EB (gray-200) |
| Border-radius | 8px (rounded-lg) |
| Background | #FFFFFF |
| Hover background | #F9FAFB (gray-50) |
| Hover border | #D1D5DB (gray-300) |
| Hover shadow | 0 1px 3px rgba(0,0,0,0.1) |
| Hover transition | all 150ms ease |
| Grid layout | 1 column on mobile, 2 on md, 3 on lg |
| Grid gap | 16px (gap-4) |
| Cursor | pointer |

**Card Title:**
- Font: Source Sans Pro, 16px (text-base), weight 600-700
- Color: `#111827` (gray-900)
- Icon: Small colored circle or emoji before name (org avatar)
- Hover: color changes to `#2563EB` (blue-600)

**Card Description:**
- Font: Source Sans Pro, 14px (text-sm), weight 400
- Color: `#6B7280` (gray-500)
- Line-clamp: 2 lines
- Overflow: hidden, ellipsis

**Card Metadata (bottom row):**
- Font: Source Sans Pro, 12px (text-xs)
- Color: `#9CA3AF` (gray-400)
- Icons: Download arrow, Heart/like icon
- Display: inline-flex, gap 16px

### 5.2 Entity Card (for 34 Tinh Thanh project)

Adapted from HF card pattern:

```
+------------------------------------------------------+
| [emoji] Tinh Thanh Name             Region badge      |
|                                                       |
|  Mo ta ngan gon ve tinh thanh...                      |
|                                                       |
|  [v макро] [giao duc] [y te]    15 resources         |
+------------------------------------------------------+
```

---

## 6. Tag / Badge Pill Component

### 6.1 Standard Tag Pill

**Specifications:**

| Property | Value |
|----------|-------|
| Padding | 2px 8px (px-2 py-0.5) to 4px 12px (px-3 py-1) |
| Border-radius | 9999px (rounded-full) -- capsule/pill shape |
| Font | Source Sans Pro, 11-12px (text-xs), weight 600 |
| Border | none (background-based only) |
| Line-height | 1.25 |
| Display | inline-flex, items-center |
| Gap (icon + text) | 4px (gap-1) |

### 6.2 Tag Color Categories

| Category | Background | Text Color | Example |
|----------|-----------|------------|---------|
| Task (e.g., text-classification) | `#DBEAFE` (blue-100) | `#1E40AF` (blue-800) | text-classification |
| Modality (e.g., image, text) | `#E0E7FF` (indigo-100) | `#3730A3` (indigo-800) | image |
| Language | `#D1FAE5` (green-100) | `#065F46` (green-800) | vi, en |
| License | `#FEF3C7` (amber-100) | `#92400E` (amber-800) | mit, apache-2.0 |
| Size | `#F3E8FF` (purple-100) | `#6B21A8` (purple-800) | 1K-10K |
| Format | `#FCE7F3` (pink-100) | `#9D174D` (pink-800) | parquet, csv |
| Type (benchmark) | `#FED7AA` (orange-100) | `#9A3412` (orange-800) | benchmark |
| Library | `#CFFAFE` (cyan-100) | `#155E75` (cyan-800) | datasets, pandas |
| Region (custom) | `#E9D5FF` (violet-100) | `#5B21B6` (violet-800) | Dong Nam Bo |
| Default / Other | `#F3F4F6` (gray-100) | `#374151` (gray-700) | misc tags |

### 6.3 Tag Pill Hover

- Background darkens by one shade (e.g., blue-100 -> blue-200)
- Cursor: pointer
- Transition: 150ms ease

### 6.4 Active / Selected Tag (in sidebar filter)

- Background: `#FFD21E` (primary yellow)
- Text: `#111827` (gray-900)
- Font weight: 600

---

## 7. Button Styles

### 7.1 Primary Button

| Property | Value |
|----------|-------|
| Background | `#FFD21E` (yellow) |
| Text color | `#111827` (gray-900) |
| Font | Source Sans Pro, 14px, weight 600 |
| Padding | 8px 16px (px-4 py-2) |
| Border-radius | 8px (rounded-lg) |
| Border | none |
| Hover | background `#F59E0B` (amber-500), brightness(0.95) |
| Active | background `#D97706` (amber-600) |
| Transition | 150ms ease |

### 7.2 Secondary / Outline Button

| Property | Value |
|----------|-------|
| Background | transparent |
| Text color | `#374151` (gray-700) |
| Border | 1px solid `#D1D5DB` (gray-300) |
| Border-radius | 8px |
| Padding | 8px 16px |
| Hover | background `#F9FAFB` (gray-50), border `#9CA3AF` (gray-400) |

### 7.3 Ghost / Text Button

| Property | Value |
|----------|-------|
| Background | transparent |
| Text color | `#4B5563` (gray-600) |
| Padding | 8px 12px |
| Border-radius | 8px |
| Hover | background `#F3F4F6` (gray-100) |

---

## 8. Input / Form Elements

| Property | Value |
|----------|-------|
| Height | 36-40px |
| Padding | 8px 12px (px-3 py-2) |
| Border | 1px solid #D1D5DB (gray-300) |
| Border-radius | 8px (rounded-lg) |
| Font | Source Sans Pro, 14px |
| Focus ring | 2px solid #FFD21E, offset 0 |
| Placeholder color | #9CA3AF (gray-400) |
| Background | #FFFFFF |

### Search Bar

- Full-width with search icon prefix
- Border-radius: 8px
- Height: 40px
- Icon: magnifying glass, color `#9CA3AF`

---

## 9. Dataset Detail Page Structure

### 9.1 Page Layout

```
+------------------------------------------------------+
|  HEADER                                               |
+------------------------------------------------------+
|                                                       |
|  [Owner avatar] owner/dataset-name                   |
|  [task] [modality] [language] [license] [size]       |
|                                                       |
|  [Tab: Dataset Card] [Tab: Files & Versions] [Tab: Community]  |
|  ─────────────────────────────────────────────────    |
|                                                       |
|  ## Dataset Card (default tab)                        |
|  +--------+  +------------------------------------+   |
|  | Metadata|  |  README.md rendered content         |   |
|  | sidebar |  |                                    |   |
|  | (right) |  |  ## Dataset Summary                |   |
|  |         |  |  ## Dataset Structure              |   |
|  | License |  |  ## Data Fields                    |   |
|  | Size    |  |  ## Citation                       |   |
|  | Downloads| |                                    |   |
|  | Tags    |  +------------------------------------+   |
|  +--------+                                           |
|                                                       |
+------------------------------------------------------+
```

### 9.2 Tab Bar

- **Style**: Horizontal row of tab links, border-bottom separator
- **Active tab**: Bold text + yellow underline (`#FFD21E`, 2px)
- **Inactive tab**: Regular weight, `#6B7280` (gray-500)
- **Font**: Source Sans Pro, 14px
- **Tabs**: Dataset Card (default), Files & Versions, Community
- **Gap**: 24px between tabs

### 9.3 Metadata Sidebar (right side of detail page)

- **Position**: Right column, ~280px width
- **Background**: `#F9FAFB` (gray-50)
- **Border-radius**: 8px
- **Padding**: 16px
- **Sections**: License, Size, Downloads, Likes, Tags
- **Section labels**: 12px, uppercase, weight 600, `#6B7280`
- **Section values**: 14px, weight 400, `#111827`

### 9.4 Files & Versions Tab

- **Table layout**: File name | Size | Last modified | Download button
- **Row hover**: `#F9FAFB` background
- **File icon**: Folder icon for directories, file icon for files
- **Pagination**: "Load more files" link at bottom (subtle, text-only)
- **Commit history**: SHA hash (monospace, truncated) + message + timestamp

---

## 10. Spacing System

Based on Tailwind CSS default spacing scale (used by HF):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px (0.25rem) | Tight gaps, icon padding |
| sm | 8px (0.5rem) | Tag padding, small gaps |
| md | 12px (0.75rem) | Input padding, inter-element |
| base | 16px (1rem) | Card padding, section gaps |
| lg | 24px (1.5rem) | Page padding, section margins |
| xl | 32px (2rem) | Page-level margins |
| 2xl | 48px (3rem) | Section separators |
| 3xl | 64px (4rem) | Hero / page header spacing |

---

## 11. Shadows & Elevation

| Level | Value | Usage |
|-------|-------|-------|
| sm | `0 1px 2px rgba(0,0,0,0.05)` | Cards at rest |
| md | `0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)` | Card hover, dropdowns |
| lg | `0 4px 6px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06)` | Modals, popovers |
| none | `none` | Flat elements (sidebar, header) |

**Note**: HF uses very subtle shadows. Many elements rely on borders only, not shadows.

---

## 12. Dark Mode

HF supports system-theme-based dark mode. Key changes:

| Element | Light | Dark |
|---------|-------|------|
| Page background | `#FFFFFF` | `#0D1117` |
| Card background | `#FFFFFF` | `#161B22` |
| Sidebar background | `#F9FAFB` | `#0D1117` |
| Text primary | `#111827` | `#E5E7EB` |
| Text secondary | `#4B5563` | `#9CA3AF` |
| Border | `#E5E7EB` | `#30363D` |
| Tag background | pastel colors | darkened pastel (e.g., blue-900/50) |

---

## 13. CSS Framework & Build

### Primary: Tailwind CSS

HF Hub uses **Tailwind CSS** utility classes extensively. The custom build is compiled
to `/front/build/kube-{hash}/style.css` which includes:
- Tailwind utility layer
- Custom component styles
- Font imports (delegated to Google Fonts CDN)

### For replication, use Tailwind with this config:

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        hf: {
          yellow: '#FFD21E',
          orange: '#FF9D00',
          gray: '#6B7280',
        }
      },
      fontFamily: {
        sans: ['Source Sans Pro', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '8px',
      }
    }
  }
}
```

---

## 14. Responsive Breakpoints

| Breakpoint | Width | Layout change |
|------------|-------|---------------|
| Mobile | < 640px | Single column, sidebar hidden (drawer), cards 1 col |
| Tablet | 640-1023px | Cards 2 columns, sidebar collapsed |
| Desktop | >= 1024px | Sidebar visible, cards 2-3 columns |
| Wide | >= 1280px | Full layout, cards 3 columns |

---

## 15. Iconography

- **Style**: Outline / line icons (similar to Heroicons)
- **Size**: 16px (inline), 20px (standalone), 24px (header actions)
- **Color**: Inherits from parent text color
- **Source**: Custom SVG icons + standard UI icon set

---

## 16. Animation & Transitions

| Property | Duration | Easing | Usage |
|----------|----------|--------|-------|
| Color / background | 150ms | ease | Hover states |
| Border-color | 150ms | ease | Focus, hover |
| Opacity | 200ms | ease | Show/hide, tooltips |
| Transform | 200ms | ease-out | Sidebar collapse |
| Box-shadow | 150ms | ease | Card hover elevation |

---

## 17. Special UI Patterns

### 17.1 Sort Dropdown (listing pages)

- Trigger: "Sort: Trending" text + chevron-down icon
- Style: Ghost button with border
- Dropdown: White bg, shadow-md, border-radius 8px, 8px padding
- Options: Trending, Most Downloads, Most Likes, Recently Updated
- Active option: Bold text, checkmark icon

### 17.2 Filter Sidebar Sections

- Collapsible with chevron-right/down animation
- Checkbox: Custom styled, `#FFD21E` when checked
- Count badge: Gray pill next to filter label showing count

### 17.3 Breadcrumbs

- Format: `Datasets > owner > dataset-name`
- Font: 13px, `#6B7280`
- Separator: `/` or chevron-right
- Current: Bold, `#111827`

---

## 18. Key Differences for 34 Tinh Thanh Adaptation

Since this project is a wiki-style knowledge repository (not a model/dataset hub),
adapt as follows:

| HF Pattern | 34 Tinh Thanh Adaptation |
|-----------|-------------------------|
| Models / Datasets / Spaces nav | Tinh Thanh / Chi So / Tai Nguyen / Tu Dien |
| Dataset card grid | Tinh card grid (34 provinces) |
| Tags (task, modality) | Tags (vi mo, giao duc, y te, ha tang) |
| Files & Versions tab | Tai Nguyen + Versions |
| Dataset Card tab | Ho So Tinh (wiki content) |
| Download count | Luot xem / So tai nguyen |
| License tag | Nguon tai lieu |
| Owner avatar | Region badge (Dong Nam Bo, Tay Nguyen, etc.) |

---

## Sources

- huggingface.co/brand -- Brand colors
- huggingface.co/datasets -- Live page structure
- huggingface.co/datasets/mnist -- CSS imports, font loading
- designmd.co/d/huggingface -- Design tokens
- github.com/huggingface/chat-ui -- Open-source reference (package.json)
- huggingface.co/docs/hub/datasets-cards -- Dataset card metadata spec
