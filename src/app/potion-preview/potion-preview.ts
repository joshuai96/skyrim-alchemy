import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import {
  DataService,
  Effect,
  EffectId,
  Ingredient,
  IngredientId,
  resolveEffects,
  softBadgeClass,
} from '../data';

/** A selected ingredient with its resolved effects. */
interface SelectedRow {
  readonly ingredient: Ingredient;
  readonly effects: readonly Effect[];
}

@Component({
  selector: 'app-potion-preview',
  templateUrl: './potion-preview.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PotionPreview {
  private readonly data = inject(DataService);

  /** The set of selected ingredient IDs (up to 3). */
  readonly selectedIngredientIds = input.required<ReadonlySet<IngredientId>>();

  /** Emits when the user wants to deselect an ingredient. */
  readonly deselect = output<IngredientId>();

  /** Resolved rows for each selected ingredient. */
  protected readonly rows = computed(() => {
    const byId = this.data.ingredientsById();
    const ebi = this.data.effectByIngredient();
    const effectsById = this.data.effectsById();
    const result: SelectedRow[] = [];

    for (const id of this.selectedIngredientIds()) {
      const ingredient = byId.get(id);
      if (!ingredient) continue;
      const effectIds = ebi.get(id);
      const effects = effectIds ? resolveEffects(effectIds, effectsById) : [];
      result.push({ ingredient, effects });
    }

    return result;
  });

  /**
   * Potion result: effects that appear on 2 or more of the selected ingredients.
   */
  protected readonly potionEffects = computed(() => {
    const selected = this.selectedIngredientIds();
    if (selected.size < 2) return [];

    const ebi = this.data.effectByIngredient();
    const effectsById = this.data.effectsById();

    const counts = new Map<EffectId, number>();
    for (const ingredientId of selected) {
      const effectIds = ebi.get(ingredientId);
      if (!effectIds) continue;
      for (const eid of effectIds) {
        counts.set(eid, (counts.get(eid) ?? 0) + 1);
      }
    }

    const result: Effect[] = [];
    for (const [eid, count] of counts) {
      if (count >= 2) {
        const effect = effectsById.get(eid);
        if (effect) result.push(effect);
      }
    }

    return result;
  });

  protected readonly badgeClass = softBadgeClass;

  protected onDeselect(id: IngredientId): void {
    this.deselect.emit(id);
  }
}
