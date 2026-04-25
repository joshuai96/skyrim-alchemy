import { Effect, EffectAlignment, EffectId } from './data.types';

/**
 * Resolves a set of effect IDs into an array of Effect objects.
 * Unknown IDs are silently skipped.
 */
export function resolveEffects(
  ids: ReadonlySet<EffectId>,
  effectsById: ReadonlyMap<EffectId, Effect>,
): readonly Effect[] {
  const result: Effect[] = [];
  for (const id of ids) {
    const effect = effectsById.get(id);
    if (effect) result.push(effect);
  }
  return result;
}

/** Returns the daisyUI color class for an effect alignment. */
export function alignmentColor(alignment: EffectAlignment): string {
  return alignment === 'positive' ? 'badge-success' : 'badge-error';
}

/** Returns the badge class for an effect displayed in a "soft" (filled) style. */
export function softBadgeClass(effect: Effect): string {
  return `${alignmentColor(effect.alignment)} badge-soft`;
}
