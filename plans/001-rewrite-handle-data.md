# 002 — Rewrite `handle_data`

## Overview

Rewrite the `handle_data` function in `scripts/extract_data.py` to properly read
all provided CSV files, parse ingredients and effects, build linking objects, and
interactively resolve unknown effect alignments.

The current implementation is buggy and incomplete: it references a nonexistent
`tags` field on `Effect`, never processes ingredients, never builds linking
objects, and is never called from `main()`.

## Scope

Only the `handle_data` function body and its signature change. Supporting types,
classes, and the rest of the script remain unchanged unless a prerequisite
modification is listed explicitly.

## Prerequisites

Before rewriting `handle_data`, four changes are needed elsewhere in the file:

### P1 — Add `Ingredients.get` method

`Ingredients` (line 55) has no `get(name)` lookup method like `Effects` does
(line 114). Add one so `handle_data` can check if an ingredient already exists by
name:

```python
class Ingredients(set[Ingredient]):

    def get(self, name: str) -> Ingredient | None:
        """Get an ingredient by name."""
        for ingredient in self:
            if ingredient.name == name:
                return ingredient
        return None
```

### P2 — Fix `ask_effect_alignment` log message

Line 186 prints `"unknown alignment - repeat"` on the _success_ branch. Move the
message to the failure branch so users get correct feedback:

```python
def ask_effect_alignment() -> EffectAlignment:
    while True:
        symbol = input("enter alignment symbol [+/-]: ")
        alignment = EffectAlignment.from_symbol(symbol)
        if alignment != EffectAlignment.UNKNOWN:
            return alignment
        print("unknown alignment - repeat")
```

### P3 — Call `handle_data` from `main()`

`main()` currently loads effects/ingredients then immediately writes them back
(lines 415-418). Insert a call to `handle_data` between loading and writing, and
write the additional linking data to JSON files.

### P4 — Add `load_links` function

Add a function to load existing linking data from a JSON file so links are not
regenerated from scratch on every run. The on-disk format uses sorted lists (from
`dump_links`), so the loader must convert them back to sets:

```python
def load_links(path: Path) -> dict[ID, set[ID]]:
    """Load existing link data from a JSON file.

    Arguments:
        path (Path): File to load.

    Returns:
        dict[ID, set[ID]]: Loaded links, empty dict if file missing.
    """
    logger = logging.getLogger(__name__).getChild("load-links")

    if not path.exists():
        return {}

    logger.info("loading existing links from '%s'...", path_repr(path))

    with open(path, "r", encoding="utf-8", newline="\n") as f:
        raw: dict[str, list[str]] = json.load(f)

    return {k: set(v) for k, v in raw.items()}
```

This function is generic — it works for both `EffectByIngredient` and
`IngredientByEffect` since they share the same underlying type
`dict[ID, set[ID]]`.

## New Signature

```python
def handle_data(
    paths: set[Path],
    effects: Effects,
    ingredients: Ingredients,
    effect_by_ingredient: EffectByIngredient,
    ingredient_by_effect: IngredientByEffect,
) -> tuple[Effects, Ingredients, EffectByIngredient, IngredientByEffect]:
```

The function now receives the existing linking objects as parameters (loaded by
`load_links` in `main()`) and merges new links into them, rather than starting
from empty dicts every run. The return type adds `EffectByIngredient` and
`IngredientByEffect` — both type aliases already defined in the script
(lines 134-147).

## Algorithm

```
# effect_by_ingredient and ingredient_by_effect are received as parameters
# (pre-loaded from JSON or empty dicts if no file existed)

for each csv path in paths:
    source = path.stem                          # e.g. "base", "dragonborn"
    open and read csv with DictReader

    for each row:
        ingredient_name = row["ingredient"]
        effect_names = [row[col] for col in (primary, secondary, tertiary, quaternary)
                        if row[col] != ""]

        # --- resolve ingredient ---
        known_ingredient = ingredients.get(ingredient_name)

        if known_ingredient exists:
            ingredient = known_ingredient
            # ensure it has an ID
            if not ingredient.has_id():
                ingredients.remove(ingredient)
                ingredient = Ingredient(id=create_new_id(),
                                        name=ingredient.name,
                                        source=ingredient.source)
                ingredients.add(ingredient)
        else:
            ingredient = Ingredient(id=create_new_id(),
                                    name=ingredient_name,
                                    source=source)
            ingredients.add(ingredient)

        # initialise linking set for this ingredient
        effect_by_ingredient.setdefault(ingredient.id, set())

        # --- resolve effects ---
        for effect_name in effect_names:
            known_effect = effects.get(effect_name)

            if known_effect exists:
                effect = known_effect
                # ensure it has an ID
                if not effect.has_id():
                    effects.remove(effect)
                    effect = Effect(id=create_new_id(),
                                   name=effect.name,
                                   alignment=effect.alignment)
                    effects.add(effect)
            else:
                effect = Effect(id=create_new_id(),
                                name=effect_name,
                                alignment=EffectAlignment.UNKNOWN)
                effects.add(effect)

            # --- check alignment ---
            if effect.alignment == EffectAlignment.UNKNOWN:
                print(f"effect '{effect.name}' has unknown alignment")
                alignment = ask_effect_alignment()
                effects.remove(effect)
                effect = Effect(id=effect.id,
                                name=effect.name,
                                alignment=alignment)
                effects.add(effect)

            # --- build links (merge into existing) ---
            ebi_set = effect_by_ingredient.setdefault(ingredient.id, set())
            if effect.id not in ebi_set:
                logger.debug("linking effect '%s' -> ingredient '%s'",
                             effect.name, ingredient.name)
                ebi_set.add(effect.id)

            ibe_set = ingredient_by_effect.setdefault(effect.id, set())
            if ingredient.id not in ibe_set:
                ibe_set.add(ingredient.id)

return (effects, ingredients, effect_by_ingredient, ingredient_by_effect)
```

### Key behaviours

| Concern                   | Behaviour                                                                                                                                                                                                                                                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Duplicate effects**     | Matched by name via `Effects.get()`. An existing effect is reused; only a missing ID is fixed.                                                                                                                                                                                                                        |
| **Duplicate ingredients** | Matched by name via `Ingredients.get()` (new method from P1). An existing ingredient is reused; only a missing ID is fixed.                                                                                                                                                                                           |
| **Ingredient source**     | Set to `path.stem` (e.g. `"base"`, `"dragonborn"`) when creating a new ingredient. Existing ingredients keep their stored source.                                                                                                                                                                                     |
| **Unknown alignment**     | Checked on every effect encounter. If `UNKNOWN`, the user is prompted once via `ask_effect_alignment()`. The corrected effect replaces the old one in the set so subsequent encounters of the same effect skip the prompt.                                                                                            |
| **Linking objects**       | `EffectByIngredient` maps ingredient ID → set of effect IDs. `IngredientByEffect` maps effect ID → set of ingredient IDs. Both are received as parameters (pre-loaded from disk or empty) and merged into — existing links are preserved, new links are added. Duplicate links are skipped via set membership checks. |

## Logging

Use the existing logger pattern (`logging.getLogger(__name__).getChild("handle-data")`).

| Level   | When                                                                                                                    |
| ------- | ----------------------------------------------------------------------------------------------------------------------- |
| `info`  | Starting to read a file; final counts of effects, ingredients, links.                                                   |
| `debug` | New effect found; duplicate effect found; new ingredient found; duplicate ingredient found; alignment prompt triggered. |

Use `path_repr(path)` (called correctly, not passed as a function reference) for
all path logging.

## Changes to `main()`

`main()` must load existing linking data before calling `handle_data`, pass it in,
and write all four outputs afterward:

```python
ebi_file = data_dir / "effect-by-ingredient.json"
ibe_file = data_dir / "ingredient-by-effect.json"

effects = load_effects(effects_file)
ingredients = load_ingredients(ingredients_file)
ebi = load_links(ebi_file)
ibe = load_links(ibe_file)

effects, ingredients, ebi, ibe = handle_data(
    data_files, effects, ingredients, ebi, ibe
)

write_data(effects_file, effects)
write_data(ingredients_file, ingredients)
```

The linking data (`ebi`, `ibe`) needs serialisation too. Since `dict[ID, set[ID]]`
is not directly JSON-serialisable (sets aren't), convert sets to lists
before writing. This can be a small helper or done inline:

```python
def dump_links(links: dict[ID, set[ID]]) -> dict[str, list[str]]:
    return {k: list(v) for k, v in links.items()}
```

Write them to `data/effect-by-ingredient.json` and
`data/ingredient-by-effect.json`.

## Files Modified

| #   | File                      | Action                                                                                                                                        |
| --- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `scripts/extract_data.py` | Modify — add `Ingredients.get`, fix `ask_effect_alignment`, add `load_links`, rewrite `handle_data`, update `main()`, add `dump_links` helper |

## Testing

Do not run tests. A human operator can execute the script.

Run the script manually from the project root:

```sh
python3 scripts/extract_data.py
```

Verify:

1. All 189 ingredients from the 5 CSV files are written to `ingredients.json`.
2. All effects (including any newly discovered from CSVs) are in `effects.json`
   with non-`"unknown"` alignments (user was prompted for each).
3. `effect-by-ingredient.json` and `ingredient-by-effect.json` exist and contain
   valid cross-references.
4. Running the script a second time produces no alignment prompts (all effects
   already have alignments) and identical output files.
