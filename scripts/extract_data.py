#!/usr/bin/env python3

import csv
import json
import logging
import sys
import uuid
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import Protocol

###############################################################################
# Types
###############################################################################
type ID = str

type IngredientRepresentation = dict[str, str | ID]
"""Basic representation of an ingredient."""

type EffectRepresentation = dict[str, str | ID]
"""Basic representation of an effect."""

type LinkRepresentation = dict[ID, list[ID]]
"""Basic representation of links."""

type DumpResult = (
    IngredientRepresentation | EffectRepresentation | list[IngredientRepresentation] | list[EffectRepresentation] | LinkRepresentation
)
"""Union of all possible dump return types."""


class Dumper(Protocol):
    """Dumper protocol to return objects as basic representation."""

    def dump(self) -> DumpResult: ...


@dataclass(frozen=True)
class Ingredient:
    """Data for an ingredient."""

    id: ID
    name: str
    source: str

    def has_id(self) -> bool:
        """Check if the ingredient already has an ID."""
        return self.id != ""

    def dump(self) -> IngredientRepresentation:
        """Represent the ingredient in basic types."""
        return {
            "id": self.id,
            "name": self.name,
            "source": self.source,
        }


class Ingredients(set[Ingredient]):
    """Collection of ingredients."""

    def get(self, name: str) -> Ingredient | None:
        """Get an ingredient by name."""
        for ingredient in self:
            if ingredient.name == name:
                return ingredient

        return None

    def dump(self) -> list[IngredientRepresentation]:
        """Represent the ingredient list sorted by name.

        Returns:
            list[IngredientRepr]: Basic representation sorted by name.
        """
        return [ingredient.dump() for ingredient in sorted(self, key=lambda i: i.name)]


class EffectAlignment(StrEnum):
    """Effect alignment.

    Basically if this effect was applied to the player, if it is perceived
    positive or negative.
    """

    UNKNOWN = "unknown"
    POSITIVE = "positive"
    NEGATIVE = "negative"

    @staticmethod
    def from_symbol(symbol: str) -> EffectAlignment:
        """Transform symbol to alignment.

        + is positive.
        - is negative.
        """
        match symbol:
            case "+":
                return EffectAlignment.POSITIVE
            case "-":
                return EffectAlignment.NEGATIVE
            case _:
                return EffectAlignment.UNKNOWN


@dataclass(frozen=True)
class Effect:
    """Data for an effect."""

    id: ID
    name: str
    alignment: EffectAlignment

    def has_id(self) -> bool:
        """Check if the effect already has an ID."""
        return self.id != ""

    def dump(self) -> EffectRepresentation:
        """Represent the effect in basic types."""
        return {"id": self.id, "name": self.name, "alignment": str(self.alignment)}


class Effects(set[Effect]):
    """Collection of effects."""

    def get(self, name: str) -> Effect | None:
        """Get an effect by a name.

        Arguments:
            name (str): Name of effect.

        Returns:
            (Effect | None): Found effect if any.
        """
        for effect in self:
            if effect.name == name:
                return effect

        return None

    def dump(self) -> list[EffectRepresentation]:
        """Represent the effect list sorted by name."""
        return [effect.dump() for effect in sorted(self, key=lambda e: e.name)]


class EffectByIngredient(dict[ID, set[ID]]):
    """Link Effects to Ingredients.

    The key is a ingredient ID.
    The value is a set of effect IDs, which link the Effect to the Ingredient.
    """

    def dump(self) -> LinkRepresentation:
        """Represent the effect by ingredient collection."""
        return {k: sorted(v) for k, v in self.items()}


class IngredientByEffect(dict[ID, set[ID]]):
    """Link Ingredients to Effects.

    The key is an effect ID.
    The value is a set of ingredient IDs, which link the Ingredient to the Effect
    """

    def dump(self) -> LinkRepresentation:
        """Represent the effect by ingredient collection."""
        return {k: sorted(v) for k, v in self.items()}


###############################################################################
# Functions
###############################################################################
def create_new_id() -> str:
    """Create a new UUIDv4 as string.

    Returns:
        str: New UUIDv4.
    """
    return str(uuid.uuid4())


def path_representation(path: Path) -> str:
    """Represent the path relative to the current working directory.

    Arguments:
        path (Path): Path to represent.

    Returns:
        str: String representation of relative path.
    """
    return str(path.relative_to(Path.cwd()))


def ask_effect_alignment(name: str) -> EffectAlignment:
    """Interactively ask the user for an effect alignment.

    Returns:
        EffectAlignment: The chosen alignment.
    """
    logger = logging.getLogger(__name__).getChild("ask-effect-alignment")

    while True:
        symbol = input(f"enter alignment symbol for '{name}' [+/-]: ", )

        alignment = EffectAlignment.from_symbol(symbol)

        if alignment != EffectAlignment.UNKNOWN:
            return alignment

        logger.warning("unknown alignment - repeat")


def load_effects(path: Path) -> Effects:
    """Load existing effects from a JSON file.

    Fixes missing IDs, but ignores other missing data.
    If the name is missing, the effect is skipped, as it
    will be read from source data later.

    Arguments:
        path (Path): File to load.

    Returns:
        Effects: Collection of effects.
    """
    logger = logging.getLogger(__name__).getChild("load-effects")
    effects = Effects()

    if not path.exists():
        return effects

    logger.info("loading existing effects...")

    with Path(path).open("r", encoding="utf-8", newline="\n") as f:
        raw_effects: list[EffectRepresentation] = json.load(f)

    for raw in raw_effects:
        name = raw.get("name", "")
        if not name:
            logger.warning("missing name - skipping")
            continue

        effect_id = raw.get("id", "")
        if not effect_id:
            logger.warning("missing or empty id for '%s' - fixing", name)
            effect_id = create_new_id()

        alignment = EffectAlignment.UNKNOWN
        raw_alignment = raw.get("alignment")
        if raw_alignment is None:
            logger.warning("missing alignment for '%s' - ignoring", name)
        else:
            try:
                alignment = EffectAlignment(raw_alignment)
            except ValueError as e:
                logger.warning("invalid alignment value: %s", e)

        effects.add(
            Effect(
                id=effect_id,
                name=name,
                alignment=alignment,
            ),
        )

    logger.info("effects: %d", len(effects))
    return effects


def load_ingredients(path: Path) -> Ingredients:
    """Load existing ingredients from a JSON file.

    Fixes missing IDs, but ignores other missing data.
    If the name is missing, the ingredient is skipped, as
    it will be read from source data later.

    Arguments:
        path (Path): File to load.

    Returns:
        Ingredients: Collection of ingredients.
    """
    logger = logging.getLogger(__name__).getChild(
        "load-ingredients",
    )
    ingredients = Ingredients()

    if not path.exists():
        return ingredients

    logger.info("loading existing ingredients...")

    with Path(path).open("r", encoding="utf-8", newline="\n") as f:
        raw_ingredients: list[IngredientRepresentation] = json.load(f)

    for raw in raw_ingredients:
        name = raw.get("name", "")
        if not name:
            logger.warning("missing name - skipping")
            continue

        ingredient_id = raw.get("id", "")
        if not ingredient_id:
            logger.warning(
                "missing or empty id for '%s' - fixing",
                name,
            )
            ingredient_id = create_new_id()

        source = raw.get("source", "")
        if not source:
            logger.warning(
                "missing source for '%s' - ignoring",
                name,
            )

        ingredients.add(
            Ingredient(
                id=ingredient_id,
                name=name,
                source=source,
            ),
        )

    logger.info("ingredients: %d", len(ingredients))
    return ingredients


def load_links[T: EffectByIngredient | IngredientByEffect](path: Path, link_type: type[T]) -> T :
    """Load existing link data from a JSON file.

    Arguments:
        path (Path): File to load.

    Returns:
        dict[ID, set[ID]]: Loaded links, empty dict if file missing.
    """
    logger = logging.getLogger(__name__).getChild("load-links")

    links = link_type()

    if not path.exists():
        return links

    logger.info(
        "loading existing '%s' links from '%s'...",
        link_type.__name__,
        path_representation(path),
    )

    with Path(path).open("r", encoding="utf-8", newline="\n") as f:
        raw_links: LinkRepresentation = json.load(f)

    for key, link_list in raw_links.items():
        links[key] = set(link_list)

    return links


def handle_data(
    paths: set[Path],
    effects: Effects,
    ingredients: Ingredients,
    effect_by_ingredient: EffectByIngredient,
    ingredient_by_effect: IngredientByEffect,
) -> tuple[Effects, Ingredients, EffectByIngredient, IngredientByEffect]:
    """Read CSV files, resolve ingredients/effects, and build linking objects.

    Arguments:
        paths: CSV files to process.
        effects: Existing effects collection.
        ingredients: Existing ingredients collection.
        effect_by_ingredient: Existing ingredient->effects links.
        ingredient_by_effect: Existing effect->ingredients links.

    Returns:
        Updated effects, ingredients, effect_by_ingredient,
        ingredient_by_effect.
    """
    logger = logging.getLogger(__name__).getChild("handle-data")

    for path in paths:
        source = path.stem
        logger.info("reading '%s'...", path_representation(path))

        with path.open("r", encoding="utf-8", newline="\n") as f:
            reader = csv.DictReader(f)

            for row in reader:
                ingredient_name = row["ingredient"]
                effect_names = [
                    row[col]
                    for col in (
                        "primary",
                        "secondary",
                        "tertiary",
                        "quaternary",
                    )
                    if row[col] != ""
                ]

                logger.debug("resolve ingredient '%s'...", ingredient_name)
                known_ingredient = ingredients.get(ingredient_name)

                if known_ingredient is not None:
                    logger.debug(
                        "duplicate ingredient: '%s'",
                        ingredient_name,
                    )

                    ingredient = known_ingredient
                    if not ingredient.has_id():
                        logger.debug("fix missing id")

                        ingredients.remove(ingredient)
                        ingredient = Ingredient(
                            id=create_new_id(),
                            name=ingredient.name,
                            source=ingredient.source,
                        )
                        ingredients.add(ingredient)
                else:
                    logger.debug(
                        "new ingredient: '%s'",
                        ingredient_name,
                    )

                    ingredient = Ingredient(
                        id=create_new_id(),
                        name=ingredient_name,
                        source=source,
                    )

                    ingredients.add(ingredient)

                # Init new set if non exists.
                effect_by_ingredient.setdefault(ingredient.id, set())

                # Resolve effects.
                for effect_name in effect_names:
                    logger.debug("resolve effect '%s'...", effect_name)

                    known_effect = effects.get(effect_name)

                    if known_effect is not None:
                        logger.debug(
                            "duplicate effect: '%s'",
                            effect_name,
                        )

                        effect = known_effect
                        if not effect.has_id():
                            logger.debug("fix missing id")

                            effects.remove(effect)
                            effect = Effect(
                                id=create_new_id(),
                                name=effect.name,
                                alignment=effect.alignment,
                            )
                            effects.add(effect)
                    else:
                        logger.debug(
                            "new effect: '%s'",
                            effect_name,
                        )
                        effect = Effect(
                            id=create_new_id(),
                            name=effect_name,
                            alignment=EffectAlignment.UNKNOWN,
                        )
                        effects.add(effect)

                    logger.debug("check alignment...")

                    if effect.alignment == EffectAlignment.UNKNOWN:
                        logger.debug(
                            "alignment prompt for: '%s'",
                            effect.name,
                        )

                        alignment = ask_effect_alignment(effect_name)

                        effects.remove(effect)
                        effect = Effect(
                            id=effect.id,
                            name=effect.name,
                            alignment=alignment,
                        )
                        effects.add(effect)

                    logger.debug("build links...")

                    # Init new set if non exists.
                    ebi_set = effect_by_ingredient.setdefault(
                        ingredient.id,
                        set(),
                    )

                    if effect.id not in ebi_set:
                        logger.debug(
                            "linking effect '%s' -> ingredient '%s'",
                            effect.name,
                            ingredient.name,
                        )

                        ebi_set.add(effect.id)

                    # Init new set if non exists.
                    ibe_set = ingredient_by_effect.setdefault(
                        effect.id,
                        set(),
                    )

                    if ingredient.id not in ibe_set:
                        ibe_set.add(ingredient.id)

    logger.info(
        "effects: %d, ingredients: %d, links: %d",
        len(effects),
        len(ingredients),
        sum(len(v) for v in effect_by_ingredient.values()), # Link count should be equal on both.
    )

    return (effects, ingredients, effect_by_ingredient, ingredient_by_effect)

def write_data(path: Path, data: Dumper) -> None:
    """Serialize a Dumper to a JSON file.

    Arguments:
        path (Path): Destination file path.
        data (Dumper): Object to serialize.
    """
    logger = logging.getLogger(__name__).getChild("write-data")
    logger.info("writing to '%s'", path_representation(path))
    with Path(path).open("w", encoding="utf-8", newline="\n") as f:
        json.dump(data.dump(), f, indent=2)

###############################################################################
# Main.
###############################################################################
def main() -> int:
    """Entry point for the data extraction script."""
    # Logging.
    logger = logging.getLogger(__name__)
    logger.setLevel(logging.DEBUG)

    formatter = logging.Formatter("%(asctime)s [%(levelname)s]: %(name)s : %(message)s")

    console = logging.StreamHandler()
    console.setFormatter(formatter)

    logger.addHandler(console)

    # Files.
    data_dir = (Path.cwd() / "data").resolve()
    data_files = {
        data_dir / f
        for f in [
            "base.csv",
            "dawnguard.csv",
            "dragonborn.csv",
            "hearthfire.csv",
            "creationclub.csv",
        ]
    }
    effects_file = data_dir / "effects.json"
    ingredients_file = data_dir / "ingredients.json"
    ebi_file = data_dir / "effect-by-ingredient.json"
    ibe_file = data_dir / "ingredient-by-effect.json"

    logger.info("reading input from")
    logger.info("  %s/", path_representation(data_dir))

    missing = False

    for file in data_files:
        exists = file.exists()
        status = "ok" if exists else "MISSING"
        logger.info(
            "    %s: %s",
            file.relative_to(data_dir),
            status,
        )
        if not exists:
            missing = True

    if missing:
        logger.error("At least one file is missing. Check output above.")
        return 1

    logger.info(
        "writing effects to: '%s' (exists: %s)",
        path_representation(effects_file),
        effects_file.exists(),
    )

    logger.info(
        "writing ingredients to: '%s' (exists: %s)",
        path_representation(ingredients_file),
        ingredients_file.exists(),
    )

    logger.info(
        "writing effects by ingredient to: '%s' (exists: %s)",
        path_representation(ebi_file),
        ebi_file.exists(),
    )

    logger.info(
        "writing ingredient by effect to: '%s' (exists: %s)",
        path_representation(ibe_file),
        ibe_file.exists(),
    )

    effects = load_effects(effects_file)
    ingredients = load_ingredients(ingredients_file)
    ebi = load_links(ebi_file, EffectByIngredient)
    ibe = load_links(ibe_file, IngredientByEffect)

    effects, ingredients, ebi, ibe = handle_data(
        data_files,
        effects,
        ingredients,
        ebi,
        ibe,
    )

    write_data(effects_file, effects)
    write_data(ingredients_file, ingredients)
    write_data(ebi_file, ebi)
    write_data(ibe_file, ibe)

    return 0


if __name__ == "__main__":
    sys.exit(main())
