import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  EFFECT_ALIGNMENTS,
  type Effect,
  type EffectAlignment,
  type EffectByIngredient,
  type EffectId,
  INGREDIENT_SOURCES,
  type Ingredient,
  type IngredientByEffect,
  type IngredientId,
  type IngredientSource,
} from './data.types';

const EFFECTS_URL = 'data/effects.json';
const INGREDIENTS_URL = 'data/ingredients.json';
const EFFECT_BY_INGREDIENT_URL = 'data/effect-by-ingredient.json';
const INGREDIENT_BY_EFFECT_URL = 'data/ingredient-by-effect.json';

/**
 * Singleton data store for the application.
 *
 * Loaded once during bootstrap via `provideAppInitializer` (see
 * `app.config.ts`). Components inject this service and read the signals
 * synchronously without dealing with loading states.
 */
@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly http = inject(HttpClient);

  private readonly _effects = signal<readonly Effect[]>([]);
  private readonly _ingredients = signal<readonly Ingredient[]>([]);
  private readonly _effectByIngredient = signal<EffectByIngredient>(new Map());
  private readonly _ingredientByEffect = signal<IngredientByEffect>(new Map());

  /** All effects, in the order provided by `effects.json`. */
  readonly effects = this._effects.asReadonly();

  /** All ingredients, in the order provided by `ingredients.json`. */
  readonly ingredients = this._ingredients.asReadonly();

  /** ingredient id -> set of effect ids. */
  readonly effectByIngredient = this._effectByIngredient.asReadonly();

  /** effect id -> set of ingredient ids. */
  readonly ingredientByEffect = this._ingredientByEffect.asReadonly();

  /** O(1) lookup from {@link EffectId} to {@link Effect}. */
  readonly effectsById = computed(
    () => new Map(this._effects().map((effect) => [effect.id, effect])),
  );

  /** O(1) lookup from {@link IngredientId} to {@link Ingredient}. */
  readonly ingredientsById = computed(
    () => new Map(this._ingredients().map((ingredient) => [ingredient.id, ingredient])),
  );

  private loadPromise: Promise<void> | null = null;

  /**
   * Fetches all four JSON files in parallel, validates them, and populates
   * the internal signals. Idempotent: subsequent calls return the same
   * promise and do not re-fetch.
   */
  load(): Promise<void> {
    if (this.loadPromise !== null) {
      return this.loadPromise;
    }

    this.loadPromise = this.fetchAndPopulate().catch((error) => {
      // Reset so a future caller could retry; rethrow so the app initializer
      // surfaces the failure during bootstrap.
      this.loadPromise = null;
      throw error;
    });

    return this.loadPromise;
  }

  private async fetchAndPopulate(): Promise<void> {
    const [effectsRaw, ingredientsRaw, ebiRaw, ibeRaw] = await Promise.all([
      firstValueFrom(this.http.get<unknown>(EFFECTS_URL)),
      firstValueFrom(this.http.get<unknown>(INGREDIENTS_URL)),
      firstValueFrom(this.http.get<unknown>(EFFECT_BY_INGREDIENT_URL)),
      firstValueFrom(this.http.get<unknown>(INGREDIENT_BY_EFFECT_URL)),
    ]);

    const effects = parseEffects(effectsRaw);
    const ingredients = parseIngredients(ingredientsRaw);
    const ebi = parseLinks<IngredientId, EffectId>(ebiRaw, 'effect-by-ingredient.json');
    const ibe = parseLinks<EffectId, IngredientId>(ibeRaw, 'ingredient-by-effect.json');

    this._effects.set(effects);
    this._ingredients.set(ingredients);
    this._effectByIngredient.set(ebi);
    this._ingredientByEffect.set(ibe);
  }
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

function parseEffects(raw: unknown): readonly Effect[] {
  if (!Array.isArray(raw)) {
    throw new Error('effects.json: expected top-level array');
  }

  return raw.map((entry, index) => {
    if (!isObject(entry)) {
      throw new Error(`effects.json: entry ${index} is not an object`);
    }

    const id = requireString(entry, 'id', `effects.json[${index}]`);
    const name = requireString(entry, 'name', `effects.json[${index}]`);
    const alignment = requireString(entry, 'alignment', `effects.json[${index}]`);

    if (!EFFECT_ALIGNMENTS.has(alignment as EffectAlignment)) {
      throw new Error(
        `effects.json: entry ${index} ('${name}') has invalid alignment '${alignment}'`,
      );
    }

    return {
      id: id as EffectId,
      name,
      alignment: alignment as EffectAlignment,
    } satisfies Effect;
  });
}

function parseIngredients(raw: unknown): readonly Ingredient[] {
  if (!Array.isArray(raw)) {
    throw new Error('ingredients.json: expected top-level array');
  }

  return raw.map((entry, index) => {
    if (!isObject(entry)) {
      throw new Error(`ingredients.json: entry ${index} is not an object`);
    }

    const id = requireString(entry, 'id', `ingredients.json[${index}]`);
    const name = requireString(entry, 'name', `ingredients.json[${index}]`);
    const source = requireString(entry, 'source', `ingredients.json[${index}]`);

    if (!INGREDIENT_SOURCES.has(source as IngredientSource)) {
      throw new Error(
        `ingredients.json: entry ${index} ('${name}') has invalid source '${source}'`,
      );
    }

    return {
      id: id as IngredientId,
      name,
      source: source as IngredientSource,
    } satisfies Ingredient;
  });
}

/**
 * Parses a `dict[str, list[str]]`-shaped JSON object into a
 * `ReadonlyMap<K, ReadonlySet<V>>`. Branding is applied unchecked at the
 * boundary; both keys and values are validated to be strings.
 */
function parseLinks<K extends string, V extends string>(
  raw: unknown,
  filename: string,
): ReadonlyMap<K, ReadonlySet<V>> {
  if (!isObject(raw)) {
    throw new Error(`${filename}: expected top-level object`);
  }

  const result = new Map<K, ReadonlySet<V>>();

  for (const [key, value] of Object.entries(raw)) {
    if (!Array.isArray(value)) {
      throw new Error(`${filename}: key '${key}' does not map to an array`);
    }

    const set = new Set<V>();
    for (const [i, item] of value.entries()) {
      if (typeof item !== 'string') {
        throw new Error(`${filename}: key '${key}' item ${i} is not a string`);
      }
      set.add(item as V);
    }

    result.set(key as K, set);
  }

  return result;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(obj: Record<string, unknown>, field: string, context: string): string {
  const value = obj[field];
  if (typeof value !== 'string') {
    throw new Error(`${context}: missing or non-string field '${field}'`);
  }
  return value;
}
