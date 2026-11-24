#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "sudachipy==0.7.0",
#     "sudachidict_core==20261015",
# ]
# ///
"""Generate Sudachi morpheme data for the site search (search-core.js).

The site search matches query text by substring, which structurally
misses Japanese compound variants: the query 衣類乾燥機 never
substring-matches 衣類ケア乾燥機, and 布団乾燥機 never matches
ふとん乾燥機 titles. Adding synonyms one by one is whack-a-mole, so —
exactly as the amazon-hikaku MCP server does — matching is extended
with Sudachi SplitMode B morphemes: a query matches when its morpheme
set is a subset of the document's.

This script runs AFTER the Hugo build (it reads the built
public/index.json) and writes two files next to it:

- search-morphs.json: {asin: {"m": "doc morphemes", "t": "title morphemes"}}
  (space-joined, normalized with Sudachi normalized_form + NFKC)
- search-vocab.json: {site-normalized surface: morpheme}
  The browser has no Sudachi, so search-core.js segments queries by
  longest match against this vocabulary, which is harvested from the
  catalog itself during the same tokenization pass.

Requires the pinned pair (same versions as the MCP server; 0.7 changed
the dictionary binary format, so upgrade them together). The pair is
declared in the PEP 723 block above, so locally it just runs via uv
(AGENTS.md 2.3):

    uv run scripts/generate_search_morphs.py [--index public/index.json]
                                             [--out-dir public]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata

STOP_POS = {"助詞", "助動詞", "記号", "補助記号", "感動詞", "接続詞", "連体詞"}
_KATAKANA_RE = re.compile(r"[ァ-ヶ]")


def nfkc(text: str) -> str:
    return unicodedata.normalize("NFKC", text or "").lower()


def site_norm(text: str) -> str:
    """Mirror search-core.js normalizeSearchText: NFKC, lowercase,
    katakana -> hiragana, full-width space -> space."""
    out = nfkc(text)
    out = _KATAKANA_RE.sub(lambda m: chr(ord(m.group(0)) - 0x60), out)
    return out.replace("　", " ").strip()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", default="public/index.json")
    parser.add_argument("--out-dir", default="public")
    args = parser.parse_args()

    try:
        from sudachipy import Dictionary, SplitMode
    except ImportError:
        print(
            "sudachipy is required: pip install sudachipy==0.7.0 sudachidict_core==20261015",
            file=sys.stderr,
        )
        return 1

    with open(args.index, encoding="utf-8") as fh:
        items = json.load(fh)
    if not items:
        print(f"no items in {args.index}", file=sys.stderr)
        return 1

    dictionary = Dictionary()
    tokenizer = dictionary.tokenizer() if hasattr(dictionary, "tokenizer") else dictionary.create()

    def tokenize(text: str):
        return tokenizer.tokenize(text, SplitMode.B)

    morphs: dict[str, dict[str, str]] = {}
    vocab: dict[str, str] = {}
    for item in items:
        asin = str(item.get("asin") or "").upper()
        if not asin:
            continue
        categories = item.get("categories") or []
        if isinstance(categories, str):
            categories = [categories]
        doc_text = " ".join(
            [
                item.get("title") or "",
                " ".join(categories),
                item.get("amazon_category") or "",
                item.get("summary") or "",
                item.get("specs") or "",
            ]
        )
        doc_morphs: set[str] = set()
        for m in tokenize(doc_text):
            if m.part_of_speech()[0] in STOP_POS or not m.normalized_form():
                continue
            value = nfkc(m.normalized_form())
            doc_morphs.add(value)
            surface_key = site_norm(m.surface())
            if surface_key:
                vocab[surface_key] = value
        title_morphs: set[str] = set()
        for m in tokenize(item.get("title") or ""):
            if m.part_of_speech()[0] in STOP_POS or not m.normalized_form():
                continue
            title_morphs.add(nfkc(m.normalized_form()))
        morphs[asin] = {
            "m": " ".join(sorted(doc_morphs)),
            "t": " ".join(sorted(title_morphs)),
        }

    if not morphs or not vocab:
        print("morph generation produced no data", file=sys.stderr)
        return 1

    with open(f"{args.out_dir}/search-morphs.json", "w", encoding="utf-8") as fh:
        json.dump(morphs, fh, ensure_ascii=False, separators=(",", ":"))
    with open(f"{args.out_dir}/search-vocab.json", "w", encoding="utf-8") as fh:
        json.dump(vocab, fh, ensure_ascii=False, separators=(",", ":"))

    print(f"search morphs: {len(morphs)} products, vocab {len(vocab)} surfaces")
    return 0


if __name__ == "__main__":
    sys.exit(main())
