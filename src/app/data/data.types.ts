/**
 * Strongly-typed domain model for the Skyrim Alchemy dataset.
 *
 * The shapes here mirror the JSON files emitted by `scripts/extract_data.py`:
 *   - effects.json                  -> Effect[]
 *   - ingredients.json              -> Ingredient[]
 *   - effect-by-ingredient.json     -> EffectByIngredient
 *   - ingredient-by-effect.json     -> IngredientByEffect
 */

declare const __brand: unique symbol;

/** Generic nominal/branded type helper. */
type Brand<T, B extends string> = T & { readonly [__brand]: B };

/** Effect identifier (UUID string). Distinct from {@link IngredientId} at compile time. */
export type EffectId = Brand<string, 'EffectId'>;

/** Ingredient identifier (UUID string). Distinct from {@link EffectId} at compile time. */
export type IngredientId = Brand<string, 'IngredientId'>;

/**
 * Origin of an ingredient. Matches the CSV stems consumed by the Python
 * extraction script.
 */
export type IngredientSource = 'base' | 'dawnguard' | 'dragonborn' | 'hearthfire' | 'creationclub';

/**
 * Whether an effect is desirable (`positive`) or harmful (`negative`).
 *
 * `'unknown'` is intentionally absent: the Python script resolves every
 * unknown alignment interactively before writing JSON, so the runtime type
 * system reflects that invariant. The data-loader validators reject
 * `'unknown'` explicitly if it ever slips through.
 */
export type EffectAlignment = 'positive' | 'negative';

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

/** ingredient id -> set of effect ids produced by that ingredient. */
export type EffectByIngredient = ReadonlyMap<IngredientId, ReadonlySet<EffectId>>;

/** effect id -> set of ingredient ids that produce that effect. */
export type IngredientByEffect = ReadonlyMap<EffectId, ReadonlySet<IngredientId>>;

/** Set of every valid {@link IngredientSource}. */
export const INGREDIENT_SOURCES: ReadonlySet<IngredientSource> = new Set<IngredientSource>([
  'base',
  'dawnguard',
  'dragonborn',
  'hearthfire',
  'creationclub',
]);

/** Set of every valid {@link EffectAlignment}. */
export const EFFECT_ALIGNMENTS: ReadonlySet<EffectAlignment> = new Set<EffectAlignment>([
  'positive',
  'negative',
]);
