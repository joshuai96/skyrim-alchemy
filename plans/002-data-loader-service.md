# 002 — Data Loader Service

## Overview

Introduce a singleton Angular service that loads the four JSON files produced
by `scripts/extract_data.py` (`effects.json`, `ingredients.json`,
`effect-by-ingredient.json`, `ingredient-by-effect.json`) at application
startup and exposes them through strongly-typed signals.

The data is global, immutable for the lifetime of the app, and required by
every feature that follows. Loading it once during bootstrap keeps consumer
components free of loading-state plumbing.

## Goals

1. A single `DataService` (`providedIn: 'root'`) that fetches all four JSON
   files in parallel and stores them in signals.
2. Strict TypeScript interfaces for every record and lookup map.
3. Branded ID types so `EffectId` and `IngredientId` cannot be mixed up at
   compile time when indexing the cross-reference maps.
4. Bootstrap blocks on the load via `provideAppInitializer` so consumers can
   read the signals synchronously.
5. Lightweight runtime assertions catch malformed JSON early with clear
   errors.

## Non-goals

- No reactive reload, polling, or cache busting. Data is loaded exactly once
  per page load.
- No filtering, sorting, search, or domain logic. `DataService` is purely a
  typed data source. Higher-level features build on top of it in later plans.
- No tests for this plan (the user runs them manually).

## File layout

```
src/app/data/
  data.types.ts        # Interfaces, branded IDs, literal unions
  data.service.ts      # Singleton service, signals, fetch + validation
  index.ts             # Barrel re-export
```

A new `src/app/data/` directory is preferred over a flat `services/` folder
because the types and service are tightly coupled and likely to grow (e.g.
selectors, derived maps).

## Asset configuration

The four JSON files stay in the repo-root `data/` directory (they are the
output of `scripts/extract_data.py` — moving them would split ownership).
They are exposed to the dev server and production build by adding an entry
to the `assets` array in `angular.json`:

```jsonc
"assets": [
  { "glob": "**/*", "input": "public" },
  { "glob": "*.json", "input": "data", "output": "/data" }
]
```

At runtime they are served at:

- `/data/effects.json`
- `/data/ingredients.json`
- `/data/effect-by-ingredient.json`
- `/data/ingredient-by-effect.json`

The CSV files in `data/` are intentionally excluded by the `*.json` glob.

## Type design (`data.types.ts`)

### Branded IDs

```ts
declare const __brand: unique symbol;
type Brand<T, B> = T & { readonly [__brand]: B };

export type EffectId = Brand<string, 'EffectId'>;
export type IngredientId = Brand<string, 'IngredientId'>;
```

A small internal helper casts raw strings at the JSON parsing boundary:

```ts
const asEffectId = (s: string): EffectId => s as EffectId;
const asIngredientId = (s: string): IngredientId => s as IngredientId;
```

### Literal unions

```ts
export type IngredientSource = 'base' | 'dawnguard' | 'dragonborn' | 'hearthfire' | 'creationclub';

export type EffectAlignment = 'positive' | 'negative';
```

Note: `'unknown'` is intentionally excluded. The Python script resolves all
unknown alignments interactively before writing JSON, so the runtime type
system reflects that invariant. The validator below rejects `'unknown'` if
it ever slips through.

### Records

```ts
export interface Effect {
  readonly id: EffectId;
  readonly name: string;
  readonly alignment: EffectAlignment;
}

export interface Ingredient {
  readonly id: IngredientId;
  readonly name: string;
  readonly source: IngredientSource;
}
```

### Cross-reference maps

```ts
export type EffectByIngredient = ReadonlyMap<IngredientId, ReadonlySet<EffectId>>;
export type IngredientByEffect = ReadonlyMap<EffectId, ReadonlySet<IngredientId>>;
```

`Map`/`Set` rather than `Record` because:

- The on-disk format is `dict[ID, list[ID]]`; converting to `Map`+`Set`
  matches the Python `dict[ID, set[ID]]` semantics and gives O(1) `has()`.
- Branded keys play nicely with `Map<EffectId, …>` but not with index
  signatures (`Record<EffectId, …>` collapses the brand back to `string` in
  most TS positions).

## Service design (`data.service.ts`)

### Public surface

```ts
@Injectable({ providedIn: 'root' })
export class DataService {
  readonly effects: Signal<readonly Effect[]>;
  readonly ingredients: Signal<readonly Ingredient[]>;
  readonly effectByIngredient: Signal<EffectByIngredient>;
  readonly ingredientByEffect: Signal<IngredientByEffect>;

  /** Lookup helpers — computed from the raw signals. */
  readonly effectsById: Signal<ReadonlyMap<EffectId, Effect>>;
  readonly ingredientsById: Signal<ReadonlyMap<IngredientId, Ingredient>>;

  /** Called once by the app initializer. Resolves when all data is loaded. */
  load(): Promise<void>;
}
```

### Internals

- Backing state held in `private readonly _effects = signal<readonly Effect[]>([])`
  (and similar for the others). Public signals are exposed via `.asReadonly()`.
- `effectsById` / `ingredientsById` are `computed()` from the arrays so
  consumers can resolve names from IDs without rebuilding the map.
- HTTP fetching uses Angular's `HttpClient` (requires `provideHttpClient()`
  in `app.config.ts`).
- `load()` issues four `firstValueFrom(http.get(...))` calls in parallel via
  `Promise.all`, validates each response, sets the signals, and returns
  `void`.
- `load()` is idempotent: a second call resolves immediately. Implemented
  with a `private loadPromise: Promise<void> | null` field.
- On HTTP or validation failure, `load()` rejects with a descriptive
  `Error`. The app initializer surfaces this via Angular's
  `provideBrowserGlobalErrorListeners()`.

### Validation

A handful of pure functions live alongside the service (not exported):

```ts
function parseEffects(raw: unknown): readonly Effect[];
function parseIngredients(raw: unknown): readonly Ingredient[];
function parseLinks<K extends string, V extends string>(
  raw: unknown,
  keyName: string,
): ReadonlyMap<K, ReadonlySet<V>>;
```

Each one:

1. Asserts the top-level shape (`Array.isArray` / plain object).
2. Iterates entries, asserting required fields are present and of the right
   primitive type.
3. Asserts `alignment` is `'positive' | 'negative'` and `source` is one of
   the literal-union values.
4. Throws `new Error(\`invalid <thing> at index N: <reason>\`)` on the first
   failure.

No third-party dependency is added. The functions are short
(~20 lines each) and double as documentation of the expected schema.

## App-config wiring

`src/app/app.config.ts` gains two providers:

```ts
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { DataService } from './data';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
    provideRouter(routes),
    provideAppInitializer(() => inject(DataService).load()),
  ],
};
```

`provideAppInitializer` is the v19+ replacement for the legacy
`APP_INITIALIZER` token; it accepts a function returning `void | Promise<void>`
and runs it during bootstrap.

## Algorithm — `DataService.load`

```
if loadPromise is not null:
    return loadPromise

loadPromise = Promise:
    [effectsRaw, ingredientsRaw, ebiRaw, ibeRaw] = await Promise.all([
        http.get('/data/effects.json'),
        http.get('/data/ingredients.json'),
        http.get('/data/effect-by-ingredient.json'),
        http.get('/data/ingredient-by-effect.json'),
    ])

    effects = parseEffects(effectsRaw)
    ingredients = parseIngredients(ingredientsRaw)
    ebi = parseLinks<IngredientId, EffectId>(ebiRaw, 'effect-by-ingredient')
    ibe = parseLinks<EffectId, IngredientId>(ibeRaw, 'ingredient-by-effect')

    _effects.set(effects)
    _ingredients.set(ingredients)
    _effectByIngredient.set(ebi)
    _ingredientByEffect.set(ibe)

return loadPromise
```

## Files Modified / Created

| #   | File                           | Action                                                                                           |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------ |
| 1   | `angular.json`                 | Modify — add `data/*.json` to the `assets` array under the build target                          |
| 2   | `src/app/app.config.ts`        | Modify — add `provideHttpClient()` and `provideAppInitializer(() => inject(DataService).load())` |
| 3   | `src/app/data/data.types.ts`   | Create — branded IDs, literal unions, `Effect`, `Ingredient`, link map aliases                   |
| 4   | `src/app/data/data.service.ts` | Create — `DataService` with signals, computed lookup maps, `load()`, internal validators         |
| 5   | `src/app/data/index.ts`        | Create — barrel re-export of types and service                                                   |

## Open questions resolved

- **Asset path:** keep JSON in repo-root `data/`, expose via `angular.json`
  assets entry mapped to `/data`.
- **Loader pattern:** `provideAppInitializer` + signals.
- **ID typing:** branded types (`EffectId`, `IngredientId`).
- **Source typing:** literal union.
- **Validation:** hand-written assertions, no new dependency.

## Testing

Do not run tests as part of this plan. A human operator can verify by:

1. `ng serve` — the app boots without console errors.
2. Network tab shows four `200` responses for the JSON files under
   `/data/...`.
3. In the browser devtools, inspecting any component that injects
   `DataService` (or running `ng.getComponent($0).dataService` on a
   component in elements) shows non-empty signal values immediately after
   bootstrap.
4. Temporarily corrupt one JSON file (e.g. change an `alignment` to
   `"unknown"`) and confirm the app fails to bootstrap with a clear error
   message naming the offending file and entry.
