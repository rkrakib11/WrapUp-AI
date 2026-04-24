from __future__ import annotations

import bisect
from typing import Any

from structlog import get_logger

from backend.diarization.pyannote_client import DiarizationTurn
from backend.language import count_words
from backend.models.domain import TranscriptSegment

logger = get_logger(__name__)

# Words shorter than this in seconds that are entirely surrounded by silence
# will not trigger a new segment on their own.
_MIN_WORD_DURATION = 0.02


def align_words_with_diarization(
    *,
    words: list[dict[str, Any]],
    turns: list[DiarizationTurn],
    merge_gap: float = 0.5,
    min_segment_duration: float = 0.3,
) -> list[TranscriptSegment]:
    """
    Assign each Deepgram word-token to a speaker using pyannote speaker turns,
    then group into ``TranscriptSegment`` objects.

    Algorithm
    ---------
    1. For each word, compute its midpoint and find the diarization turn that
       best covers it (maximum overlap within a small window).
    2. Group consecutive same-speaker words into raw segments.
    3. Merge consecutive same-speaker segments whose gap is ≤ *merge_gap*.
    4. Drop segments whose duration is below *min_segment_duration* (unless
       they are the only segment or contain enough text).

    Overlapping speech
    ------------------
    pyannote's speaker-diarization-3.1 pipeline explicitly annotates overlapping
    speech.  When a word midpoint falls inside two turns, the turn with the
    greater time overlap with that word wins.  If the word falls in a gap, it is
    assigned to the nearest turn.

    Parameters
    ----------
    words:
        Raw word list from Deepgram (each dict has ``start``, ``end``,
        ``word`` / ``punctuated_word``).
    turns:
        Sorted diarization turns from ``PyannoteDiarizationService``.
    merge_gap:
        Maximum silence gap (seconds) between consecutive same-speaker
        segments to trigger a merge.
    min_segment_duration:
        Segments shorter than this (in seconds) *and* with fewer than 5 words
        are filtered out, unless they are the sole segment.
    """
    if not words:
        return []
    if not turns:
        logger.warning("align_words_with_diarization: no diarization turns — all words → Speaker 1")
        return _words_to_single_speaker(words)

    # Pre-build start-time index for fast binary search
    turn_starts = [t.start for t in turns]

    def _speaker_for_word(w_start: float, w_end: float) -> str:
        midpoint = (w_start + w_end) / 2.0

        # Candidate window: turns that *could* overlap with this word
        lo = bisect.bisect_right(turn_starts, midpoint + 0.5) - 1
        lo = max(0, lo - 2)
        hi = bisect.bisect_left(turn_starts, midpoint + 1.0)
        hi = min(len(turns), hi + 1)

        best_speaker = "Speaker 1"
        best_overlap = -1.0

        for i in range(lo, hi):
            t = turns[i]
            # Overlap of word interval with turn interval
            ol = min(w_end, t.end) - max(w_start, t.start)
            if ol > best_overlap:
                best_overlap = ol
                best_speaker = t.speaker

        # Fallback: find the nearest turn by midpoint distance
        if best_overlap <= 0:
            nearest = min(
                turns,
                key=lambda t: abs((t.start + t.end) / 2.0 - midpoint),
            )
            best_speaker = nearest.speaker

        return best_speaker

    # ---- Step 1: assign speaker to every word ----
    assigned: list[tuple[str, dict[str, Any]]] = []
    for w in words:
        text = (w.get("punctuated_word") or w.get("word") or "").strip()
        if not text:
            continue
        w_start = float(w.get("start", 0.0))
        w_end = float(w.get("end", w_start))
        if w_end < w_start:
            w_end = w_start
        speaker = _speaker_for_word(w_start, w_end)
        assigned.append((speaker, w))

    if not assigned:
        return []

    # ---- Step 2: group consecutive same-speaker words ----
    raw_segments: list[TranscriptSegment] = []
    cur_speaker, cur_word = assigned[0]
    cur_words: list[str] = [(cur_word.get("punctuated_word") or cur_word.get("word") or "").strip()]
    cur_start = float(cur_word.get("start", 0.0))
    cur_end = float(cur_word.get("end", cur_start))

    for speaker, w in assigned[1:]:
        text = (w.get("punctuated_word") or w.get("word") or "").strip()
        w_start = float(w.get("start", 0.0))
        w_end = float(w.get("end", w_start))

        if speaker == cur_speaker:
            cur_words.append(text)
            cur_end = w_end
        else:
            raw_segments.append(
                TranscriptSegment(
                    speaker=cur_speaker,
                    text=" ".join(cur_words),
                    start=cur_start,
                    end=cur_end,
                )
            )
            cur_speaker = speaker
            cur_words = [text]
            cur_start = w_start
            cur_end = w_end

    # flush last group
    raw_segments.append(
        TranscriptSegment(
            speaker=cur_speaker,
            text=" ".join(cur_words),
            start=cur_start,
            end=cur_end,
        )
    )

    # ---- Step 3: merge close same-speaker segments ----
    merged = _merge_segments(raw_segments, gap_threshold=merge_gap)

    # ---- Step 4: filter micro-segments ----
    if len(merged) > 1:
        merged = [
            s for s in merged
            if (s.end - s.start) >= min_segment_duration
            or count_words(s.text) >= 5
        ]
        if not merged:
            merged = raw_segments  # safety: keep something

    logger.info(
        "diarization_alignment_complete",
        total_words=len(assigned),
        raw_segments=len(raw_segments),
        merged_segments=len(merged),
        unique_speakers=len({s.speaker for s in merged}),
    )
    return merged


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------


def _words_to_single_speaker(words: list[dict[str, Any]]) -> list[TranscriptSegment]:
    texts: list[str] = []
    start = 0.0
    end = 0.0
    first = True
    for w in words:
        text = (w.get("punctuated_word") or w.get("word") or "").strip()
        if not text:
            continue
        w_start = float(w.get("start", 0.0))
        w_end = float(w.get("end", w_start))
        if first:
            start = w_start
            first = False
        end = w_end
        texts.append(text)
    if not texts:
        return []
    return [
        TranscriptSegment(
            speaker="Speaker 1",
            text=" ".join(texts),
            start=start,
            end=end,
        )
    ]


def _merge_segments(
    segments: list[TranscriptSegment],
    gap_threshold: float = 0.5,
) -> list[TranscriptSegment]:
    """Merge consecutive same-speaker segments whose gap ≤ *gap_threshold*."""
    if not segments:
        return []
    merged = [segments[0]]
    for seg in segments[1:]:
        prev = merged[-1]
        gap = seg.start - prev.end
        if seg.speaker == prev.speaker and gap <= gap_threshold:
            merged[-1] = TranscriptSegment(
                speaker=prev.speaker,
                text=f"{prev.text} {seg.text}",
                start=prev.start,
                end=seg.end,
            )
        else:
            merged.append(seg)
    return merged
