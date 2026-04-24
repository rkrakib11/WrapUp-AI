from __future__ import annotations

import regex

# `\p{M}` (combining marks) must be in the character class or scripts with
# diacritics/vowel signs — Bengali halant, Devanagari matra, Arabic shadda —
# get split mid-word. Verified against nomoskar / namaste / marhaba / urdu
# sample strings before shipping.
_WORD_RE = regex.compile(r"[\p{L}\p{N}\p{M}]+", flags=regex.UNICODE)

_CJK_LANGS = frozenset({"zh", "ja", "ko", "yue"})


def count_words(text: str, language: str | None = None) -> int:
    """Unicode-aware word count that works for Bengali, Hindi, Arabic, Urdu, etc.

    `text.split()` returns the wrong count for scripts that don't separate words
    with whitespace (CJK) and can over- or under-count for scripts that use
    combining marks. This uses a Unicode letter/digit regex that honours word
    boundaries in every script.

    For CJK languages (zh/ja/ko) a character count is a better heuristic than
    a regex token count, because a single "word" in the dictionary sense can
    be one character or several and the ASR output rarely inserts spaces.
    """
    if not text:
        return 0
    lang = (language or "").lower().split("-")[0]
    if lang in _CJK_LANGS:
        return sum(1 for ch in text if ch.strip() and not ch.isspace())
    matches = _WORD_RE.findall(text)
    if matches:
        return len(matches)
    return len([tok for tok in text.split() if tok])
