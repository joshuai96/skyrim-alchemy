#!/usr/bin/env python3

from pathlib import Path
import os

import csv
import json

def main() -> None:
    data_dir = Path(os.getcwd()).joinpath("data").resolve()
    data_files = [data_dir.joinpath(f) for f in ["base.csv", "dawnguard.csv", "dragonborn.csv", "hearthfire.csv", "creationclub.csv"]]

    effects: set[str] = set()

    for data_file in data_files:
        with open(data_file, 'r', encoding="utf-8", newline="\n") as f:
            reader = csv.DictReader(f)
            for row in reader:
                effects.update({row["primary"], row["secondary"], row["tertiary"], row["quaternary"]})

    with open(data_dir.joinpath("effects.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(sorted(list(effects)), f, indent=2)


if __name__ == "__main__":
    main()
