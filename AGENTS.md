# Agents

You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

## Project Overview

This is a Skyrim Alchemy helper built with Angular 21, Tailwind CSS 4, and Vitest. Python utility scripts in `scripts/` handle data extraction and transformation from CSV sources into JSON consumed by the Angular app. A Nix flake (`flake.nix`) provides the reproducible dev shell with Node.js 24, Python 3.14, Ruff, and Just.

## TypeScript

- Use strict type checking (strict mode is enabled in `tsconfig.json`)
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when the type is uncertain

## Angular

- Always use standalone components. Do NOT set `standalone: true` in decorators -- it is the default in Angular v21+.
- Use signals for local component state
- Use `computed()` for derived state
- Implement lazy loading for feature routes
- Do NOT use `@HostBinding` or `@HostListener`. Use the `host` object in the `@Component` or `@Directive` decorator instead.
- Use `NgOptimizedImage` for all static images. It does not work for inline base64 images.

### Components

- Keep components small and focused on a single responsibility
- Set `changeDetection: ChangeDetectionStrategy.OnPush` in `@Component`
- Use `input()` and `output()` functions instead of decorators
- Prefer inline templates for small components
- When using external templates/styles, use paths relative to the component file
- Prefer Reactive forms over Template-driven forms
- Use `class` bindings instead of `ngClass`
- Use `style` bindings instead of `ngStyle`

### Templates

- Keep templates simple; avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the `async` pipe for observables
- Do not assume globals like `new Date()` are available in templates

### State Management

- Use signals for state; use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals; use `update` or `set` instead

### Services

- Design services around a single responsibility
- Use `providedIn: 'root'` for singleton services
- Use the `inject()` function instead of constructor injection

## Styling

- Use **Tailwind CSS v4** for all styling (imported via `@import 'tailwindcss'` in `src/styles.css`)
- Utility-first approach; extract components only when duplication is clear
- Configured via PostCSS (`.postcssrc.json` with `@tailwindcss/postcss`)

## Testing

- Use **Vitest** as the test runner (integrated via `@angular/build:unit-test`)
- Run tests with `ng test`
- Test files use the `*.spec.ts` convention
- jsdom is the DOM environment

## Accessibility

- All UI must pass AXE checks
- Follow WCAG AA minimums: focus management, color contrast, and ARIA attributes

## Formatting and Linting

- **Prettier** formats TypeScript, HTML, and CSS
  - `printWidth: 100`, `singleQuote: true`
  - Angular HTML parser for `*.html` files
- **EditorConfig** enforces 2-space indent (4-space for `*.py`), UTF-8, LF line endings
- No ESLint is configured; rely on strict TypeScript compiler settings for static analysis

## Git Conventions

- Use **Conventional Commits**: `<type>(<scope>): <description>`
- Scopes: `angular`, `scripts`, `ingredients`, `effects`, or other relevant domain terms
- Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`, `perf`

## Python Scripts (`scripts/`)

The `scripts/` directory contains standalone Python utility scripts for data extraction and transformation. These are NOT part of the Angular application.

### General

- Target Python 3.14+
- Use `#!/usr/bin/env python3` shebang
- Each script must have a `main() -> int` entry point called via `if __name__ == "__main__"`
- Use `pathlib.Path` over `os.path`
- Use `logging` for output; avoid bare `print()` except for interactive prompts
- Use type hints on all function signatures and variables where the type is not obvious
- Prefer `NamedTuple`, `dataclass`, or `TypedDict` for structured data
- Use modern Python features: `match` statements, `StrEnum`, PEP 695 type aliases (`type X = ...`)

### Style and Linting

- Use **Ruff** for linting and formatting (`ruff check` and `ruff format`)
- Run via **Just** task runner: `just lint` and `just format` (from `scripts/`)
- Configuration lives in `scripts/ruff.toml`:
  - Line length: **120**, indent width: 4
  - Double quotes, space indentation, LF line endings
  - Google docstring convention
  - Preview mode enabled
- Prefer the standard library; if third-party packages are needed, document them in `scripts/requirements.txt`

### Error Handling

- Prefer explicit error handling over broad `except Exception`
- Use custom exceptions or narrow built-in exceptions
- Log errors with context before re-raising or returning

## Planning

Create plans in the `plans/` directory. Prefix all plans with a three-digit incrementing number (e.g., `001-plan-name.md`).
