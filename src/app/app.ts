import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { DataService, EffectId, IngredientId } from './data';
import { EffectSelector } from './effect-selector/effect-selector';
import { IngredientList } from './ingredient-list/ingredient-list';

@Component({
  selector: 'app-root',
  imports: [EffectSelector, IngredientList],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly data = inject(DataService);

  protected readonly selectedEffectIds = signal<ReadonlySet<EffectId>>(new Set());
  protected readonly selectedIngredientIds = signal<ReadonlySet<IngredientId>>(new Set());

  /** Whether any ingredients are currently selected. */
  protected readonly hasSelectedIngredients = computed(() => this.selectedIngredientIds().size > 0);

  /**
   * Union of all effect IDs carried by the currently selected ingredients.
   * Empty set when no ingredients are selected.
   */
  protected readonly reachableEffectIds = computed(() => {
    const ingredientIds = this.selectedIngredientIds();
    const ebi = this.data.effectByIngredient();
    const result = new Set<EffectId>();
    for (const id of ingredientIds) {
      const effectIds = ebi.get(id);
      if (effectIds) {
        for (const eid of effectIds) {
          result.add(eid);
        }
      }
    }
    return result as ReadonlySet<EffectId>;
  });
}
