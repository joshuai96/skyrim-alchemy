import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';

import {
  DataService,
  Effect,
  EffectId,
  Ingredient,
  IngredientId,
  alignmentColor,
  resolveEffects,
} from '../data';
import { PotionPreview } from '../potion-preview/potion-preview';

/** An ingredient row enriched with its resolved effects and overlap count. */
interface IngredientRow {
  readonly ingredient: Ingredient;
  readonly effects: readonly Effect[];
  readonly overlapCount: number;
  readonly disabled: boolean;
}

@Component({
  selector: 'app-ingredient-list',
  imports: [PotionPreview],
  templateUrl: './ingredient-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IngredientList {
  private readonly data = inject(DataService);

  /** Effect IDs selected via the effect search (read-only input from parent). */
  readonly selectedEffectIds = input<ReadonlySet<EffectId>>(new Set());

  /** Up to 3 selected ingredient IDs — two-way bound with parent. */
  readonly selectedIngredientIds = model<ReadonlySet<IngredientId>>(new Set());

  /** Whether we've hit the 3-ingredient cap. */
  protected readonly isMaxSelected = computed(() => this.selectedIngredientIds().size >= 3);

  /** Whether any relevance filter is active (effects or ingredients selected). */
  protected readonly hasFilter = computed(() => this.relevantEffectIds().size > 0);

  /**
   * Union of effects from the effect search AND the selected ingredients.
   * This is the full "relevance" set used for sorting and highlighting.
   */
  private readonly relevantEffectIds = computed(() => {
    const result = new Set<EffectId>(this.selectedEffectIds());
    const ebi = this.data.effectByIngredient();

    for (const ingredientId of this.selectedIngredientIds()) {
      const effectIds = ebi.get(ingredientId);
      if (effectIds) {
        for (const eid of effectIds) {
          result.add(eid);
        }
      }
    }

    return result as ReadonlySet<EffectId>;
  });

  /**
   * All ingredients sorted by relevance to the combined effect set
   * (effect search + selected ingredients). Excludes already-selected ingredients.
   */
  protected readonly sortedIngredients = computed(() => {
    const allIngredients = this.data.ingredients();
    const ebi = this.data.effectByIngredient();
    const effectsById = this.data.effectsById();
    const relevant = this.relevantEffectIds();
    const selectedIngredients = this.selectedIngredientIds();
    const hasFilter = relevant.size > 0;

    const rows: IngredientRow[] = [];

    for (const ingredient of allIngredients) {
      if (selectedIngredients.has(ingredient.id)) continue;

      const effectIds = ebi.get(ingredient.id);
      const effects = effectIds ? resolveEffects(effectIds, effectsById) : [];

      let overlapCount = 0;
      if (hasFilter && effectIds) {
        for (const eid of effectIds) {
          if (relevant.has(eid)) overlapCount++;
        }
      }

      const disabled = hasFilter && overlapCount === 0;

      rows.push({ ingredient, effects, overlapCount, disabled });
    }

    if (hasFilter) {
      rows.sort((a, b) => {
        if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
        if (b.overlapCount !== a.overlapCount) return b.overlapCount - a.overlapCount;
        return a.ingredient.name.localeCompare(b.ingredient.name);
      });
    } else {
      rows.sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name));
    }

    return rows;
  });

  protected onRowClick(row: IngredientRow): void {
    if (row.disabled || this.isMaxSelected()) return;
    this.selectIngredient(row.ingredient.id);
  }

  protected isRowDisabled(row: IngredientRow): boolean {
    return row.disabled || this.isMaxSelected();
  }

  protected selectIngredient(id: IngredientId): void {
    if (this.isMaxSelected()) return;
    const next = new Set(this.selectedIngredientIds());
    next.add(id);
    this.selectedIngredientIds.set(next);
  }

  protected deselectIngredient(id: IngredientId): void {
    const next = new Set(this.selectedIngredientIds());
    next.delete(id);
    this.selectedIngredientIds.set(next);
  }

  /** Badge class for effects in the table — outlined when matching, soft otherwise. */
  protected tableBadgeClass(effect: Effect): string {
    const color = alignmentColor(effect.alignment);

    if (!this.hasFilter()) {
      return `${color} badge-soft`;
    }

    return this.relevantEffectIds().has(effect.id)
      ? `${color} badge-outline`
      : `${color} badge-soft`;
  }
}
