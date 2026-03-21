# DataRuler - Development Guidelines

## Project Overview

DataRuler is an AI-powered data management and analytics platform built with Next.js 14 (App Router), Tailwind CSS, shadcn/ui, and Zustand for state management.

## Internationalization (i18n) & RTL Support

### Architecture

The application supports **English (LTR)** and **Hebrew (RTL)** with a custom lightweight i18n system (no external library dependencies).

**Key files:**
- `apps/web/lib/i18n/en.ts` — English translation strings (source of truth for type safety)
- `apps/web/lib/i18n/he.ts` — Hebrew translation strings
- `apps/web/lib/i18n/index.ts` — Locale type definitions, RTL helpers, re-exports
- `apps/web/stores/language-store.ts` — Zustand store managing locale, translations, and RTL state
- `apps/web/components/language-provider.tsx` — Sets `lang` and `dir` attributes on `<html>` element
- `apps/web/components/language-switcher.tsx` — Dropdown component for switching languages

### Language Preference Persistence

- The user's language preference is saved in `localStorage` under the key `data-ruler-language`.
- On page load, the store reads from `localStorage` and applies the saved locale.
- When the user switches language, `localStorage` is updated immediately.
- The `<html>` element's `lang` and `dir` attributes are updated reactively.

### How to Use Translations in Components

1. Import the language store:
   ```tsx
   import { useLanguageStore } from '@/stores/language-store';
   ```

2. Access translations in your component:
   ```tsx
   const { t } = useLanguageStore();
   // Use: t.nav.files, t.settings.title, etc.
   ```

3. For RTL-aware logic:
   ```tsx
   const { t, isRtl } = useLanguageStore();
   // Use isRtl for conditional rendering (e.g., chevron direction, tooltip side)
   ```

### Rules for Adding New Strings

1. **NEVER hardcode user-facing strings in JSX.** Always add them to both `en.ts` and `he.ts`.
2. Add the English string to `apps/web/lib/i18n/en.ts` first — the TypeScript type is derived from this file.
3. Add the corresponding Hebrew translation to `apps/web/lib/i18n/he.ts` — it must match the exact same structure.
4. Use nested objects for grouping (e.g., `nav.files`, `settings.title`, `auth.signIn`).
5. Access translations via `const { t } = useLanguageStore()` and reference like `t.section.key`.

### RTL (Right-to-Left) Guidelines

1. **Use logical CSS properties** instead of physical ones:
   - Use `ms-*` / `me-*` (margin-inline-start/end) instead of `ml-*` / `mr-*`
   - Use `ps-*` / `pe-*` (padding-inline-start/end) instead of `pl-*` / `pr-*`
   - Use `start-*` / `end-*` instead of `left-*` / `right-*`
   - Use `text-start` / `text-end` instead of `text-left` / `text-right`
   - Use `border-s` / `border-e` instead of `border-l` / `border-r`

2. **Directional icons** (chevrons, arrows) must flip in RTL:
   ```tsx
   const { isRtl } = useLanguageStore();
   // Use isRtl to swap ChevronLeft/ChevronRight
   ```

3. **Tooltip and dropdown positioning** must be RTL-aware:
   ```tsx
   <TooltipContent side={isRtl ? "left" : "right"}>
   ```

4. **Sidebar and layout** — The sidebar renders on the inline-start side naturally via flexbox `dir` inheritance.

5. **Do NOT use `flex-row-reverse`** for RTL layout — the `dir="rtl"` attribute handles this automatically for flexbox.

6. **Global RTL overrides** are in `apps/web/app/globals.css` under the `[dir="rtl"]` selector block. These handle cases where Tailwind physical classes are used by third-party components.

### Adding a New Language

1. Create a new translation file in `apps/web/lib/i18n/` (e.g., `ar.ts`).
2. Import `TranslationKeys` type from `en.ts` and type the new file as `TranslationKeys`.
3. Add the new locale to the `Locale` type in `apps/web/lib/i18n/index.ts`.
4. If RTL, add it to the `RTL_LOCALES` array.
5. Import and add it to the `translations` record in `apps/web/stores/language-store.ts`.
6. Add a new entry in the `languages` array in `apps/web/components/language-switcher.tsx`.
7. Add label entries in all existing translation files (e.g., `settings.arabic: 'العربية'`).

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript 5.4
- **Styling:** Tailwind CSS 3.4 with dark mode (`class` strategy)
- **Components:** shadcn/ui (Radix UI primitives)
- **State:** Zustand 4.5
- **Icons:** Lucide React
- **Charts:** Apache ECharts
- **Database:** SQLite + DuckDB
- **AI Backend:** Python FastAPI with Ollama

## Project Structure

```
apps/
  web/                    # Next.js frontend
    app/                  # App Router pages
      (auth)/             # Login, Register
      (dashboard)/        # Authenticated pages (files, dashboards, notes, reports, settings)
      api/                # API routes
    components/           # React components
      ui/                 # shadcn/ui base components
      layout/             # App shell, sidebar, chat sidebar
    stores/               # Zustand stores
    lib/                  # Utilities
      i18n/               # Translation files
  ai-service/             # Python FastAPI backend
```

## Development Conventions

- All pages are client components (`'use client'`)
- Use Zustand stores for state management (not React Context)
- Use `cn()` utility from `@/lib/utils` for merging Tailwind classes
- Follow the existing dark theme color scheme (zinc-based)
- Use `me-*` / `ms-*` logical margins for RTL compatibility
- Keep all user-facing text in translation files
