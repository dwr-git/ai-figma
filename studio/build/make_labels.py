#!/usr/bin/env python3
"""Russian names for the assistant's command search.

Reads AI-Figma's Russian catalog (crates/ui-egui/locales/ru.toml) and writes
studio/web/ru-labels.json:

    {"text": {"Theme": "Тема", ...}, "id": {"view.themeBrand": "Фирменная тема", ...}}

`text` translates interface words and menu-path segments ([ui] and the menu titles); `id` holds
each command's Russian name ([commands], else its menu label from [menu]). The assistant panel
uses both to show and search commands in Russian. Run by studio/build/package.sh; Python 3.11+.
"""

import json
import sys
import tomllib
from pathlib import Path


def plain(v):
    """A catalog value: a string, or plural forms (the `other` form is the name)."""
    if isinstance(v, str):
        return v
    if isinstance(v, dict):
        return v.get("other") or v.get("many") or next(iter(v.values()), "")
    return ""


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    src = root / "crates/ui-egui/locales/ru.toml"
    dst = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "studio/web/ru-labels.json"
    cat = tomllib.loads(src.read_text(encoding="utf-8"))
    text = {k: plain(v) for k, v in cat.get("ui", {}).items() if plain(v)}
    ids = {k: plain(v) for k, v in cat.get("menu", {}).items() if plain(v)}
    ids.update({k: plain(v) for k, v in cat.get("commands", {}).items() if plain(v)})
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps({"text": text, "id": ids}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{dst}: {len(text)} labels, {len(ids)} command names")
    return 0


if __name__ == "__main__":
    sys.exit(main())
