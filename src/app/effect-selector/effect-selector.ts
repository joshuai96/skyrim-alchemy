import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';

import {
  DataService,
  Effect,
  EffectId,
  alignmentColor,
  resolveEffects,
  softBadgeClass,
} from '../data';

/** An effect suggestion in the dropdown, possibly disabled. */
interface EffectOption {
  readonly effect: Effect;
  readonly disabled: boolean;
}

/** Unique ID counter for multiple instances. */
let nextInstanceId = 0;

@Component({
  selector: 'app-effect-selector',
  templateUrl: './effect-selector.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class EffectSelector {
  private readonly data = inject(DataService);
  private readonly elementRef = inject(ElementRef);
  protected readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  /** Unique prefix for ARIA IDs to avoid collisions with multiple instances. */
  protected readonly idPrefix = `effect-sel-${nextInstanceId++}`;

  /** Two-way bound set of selected effect IDs. */
  readonly selectedIds = model<ReadonlySet<EffectId>>(new Set());

  /** Set of effect IDs reachable from the selected ingredients. */
  readonly availableEffectIds = input<ReadonlySet<EffectId>>(new Set());

  /** Whether to constrain the dropdown to only available effects. */
  readonly constrainToAvailable = input(false);

  /** Current search text. */
  protected readonly query = signal('');

  /** Index of the keyboard-highlighted suggestion. */
  protected readonly activeIndex = signal(-1);

  /** Whether the input is focused (used to show dropdown). */
  private readonly inputFocused = signal(false);

  /** Resolved Effect objects for every selected ID. */
  protected readonly selectedEffectsList = computed(() =>
    resolveEffects(this.selectedIds(), this.data.effectsById()),
  );

  /** Effects matching the query, excluding already-selected ones. Includes disabled flag. */
  protected readonly filteredEffects = computed(() => {
    const q = this.query().trim().toLowerCase();
    const selected = this.selectedIds();
    const available = this.availableEffectIds();
    const all = this.data.effects();

    const candidates = all.filter((e) => !selected.has(e.id));

    let matched: readonly Effect[];
    if (q.length === 0) {
      matched = this.inputFocused() ? candidates : [];
    } else {
      matched = candidates.filter((e) => e.name.toLowerCase().includes(q));
    }

    // When no constraint, everything is enabled.
    if (!this.constrainToAvailable()) {
      return matched.map((effect) => ({ effect, disabled: false }));
    }

    // Sort: available first, then unavailable. Mark unavailable as disabled.
    const options: EffectOption[] = matched.map((effect) => ({
      effect,
      disabled: !available.has(effect.id),
    }));
    options.sort((a, b) => {
      if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
      return 0;
    });
    return options;
  });

  /** Show the dropdown when there are filtered results and input is active. */
  protected readonly isDropdownOpen = computed(() => {
    return this.filteredEffects().length > 0 && this.inputFocused();
  });

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    this.activeIndex.set(-1);
  }

  protected onFocus(): void {
    this.inputFocused.set(true);
  }

  protected onDocumentClick(event: Event): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.inputFocused.set(false);
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    const filtered = this.filteredEffects();
    if (filtered.length === 0) return;

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        const next = this.findNextEnabled(this.activeIndex(), 1, filtered);
        if (next !== -1) this.activeIndex.set(next);
        break;
      }

      case 'ArrowUp': {
        event.preventDefault();
        const next = this.findNextEnabled(this.activeIndex(), -1, filtered);
        if (next !== -1) this.activeIndex.set(next);
        break;
      }

      case 'Enter': {
        event.preventDefault();
        let option: EffectOption | undefined;
        if (this.activeIndex() >= 0 && this.activeIndex() < filtered.length) {
          option = filtered[this.activeIndex()];
        } else if (filtered.length > 0) {
          option = filtered.find((o) => !o.disabled);
        }
        if (option && !option.disabled) {
          this.selectEffect(option.effect);
        }
        break;
      }

      case 'Escape':
        this.inputFocused.set(false);
        this.searchInput()?.nativeElement.blur();
        break;
    }
  }

  protected selectEffect(effect: Effect): void {
    const next = new Set(this.selectedIds());
    next.add(effect.id);
    this.selectedIds.set(next);
    this.query.set('');
    this.activeIndex.set(-1);

    const input = this.searchInput()?.nativeElement;
    if (input) {
      input.value = '';
      input.focus();
    }
  }

  protected removeEffect(id: EffectId): void {
    const next = new Set(this.selectedIds());
    next.delete(id);
    this.selectedIds.set(next);
  }

  protected readonly badgeClass = softBadgeClass;

  protected dotClass(effect: Effect): string {
    return alignmentColor(effect.alignment);
  }

  /**
   * Find the next enabled option index in a given direction.
   * Returns -1 if none found.
   */
  private findNextEnabled(
    current: number,
    direction: 1 | -1,
    options: readonly EffectOption[],
  ): number {
    let idx = current + direction;
    while (idx >= 0 && idx < options.length) {
      if (!options[idx].disabled) return idx;
      idx += direction;
    }
    return -1;
  }
}
