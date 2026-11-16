"""Finding the person someone means from how they typed the name.

People are asked about the way colleagues speak of them: "SAM", "Shahryar",
"Shahryad Ahmad (SAM)" with a typo, "daniel perez". Matching the whole
phrase as one substring failed both ways: a typo or an added nickname found
nobody, and "SAM" found everyone whose name merely contains those letters --
Samuel, Osama -- listed alphabetically, with the right person among them.

So each word of the query is matched against each word of the name and the
username, and scored: a whole word (a nickname in brackets included) counts
most, then the start of a word, then a near-spelling, then letters inside a
word. When one person clearly fits best they are named as the match; when
several fit equally the caller is told to ask which.
"""
from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Any, Optional

from sqlalchemy import or_

from app.models.user import User

_WORD = re.compile(r"[a-z0-9]+")

# A clear match: good enough on its own, and well ahead of anyone else.
CLEAR_SCORE = 0.7
CLEAR_MARGIN = 0.2


def _words(text: Optional[str]) -> list[str]:
    return _WORD.findall((text or "").lower())


def _word_score(query_word: str, name_words: list[str]) -> float:
    best = 0.0
    for word in name_words:
        if word == query_word:
            return 1.0
        if len(query_word) >= 3 and word.startswith(query_word):
            best = max(best, 0.7)
        if len(query_word) >= 4 and len(word) >= 4:
            ratio = SequenceMatcher(None, query_word, word).ratio()
            if ratio >= 0.8:
                best = max(best, 0.9 * ratio)
        if len(query_word) >= 3 and query_word in word:
            best = max(best, 0.4)
    return best


def score_person(query: str, full_name: Optional[str], username: Optional[str]) -> float:
    """0..1: how well a typed name fits this person."""
    query_words = [w for w in _words(query) if len(w) >= 2]
    if not query_words:
        return 0.0
    if " ".join(_words(full_name)) == " ".join(query_words):
        return 1.0
    name_words = _words(full_name) + _words(username)
    return sum(_word_score(word, name_words) for word in query_words) / len(query_words)


def match_people(db, query: str, limit: int = 5) -> list[dict[str, Any]]:
    """The people a typed name may mean, best first, each with its score.

    Candidates are everyone sharing the first three letters of any word typed
    -- which a one-letter typo later in a word does not lose -- then ranked.
    Someone inactive ranks a little below an active person of equal fit.
    """
    query_words = [w for w in _words(query) if len(w) >= 2]
    if not query_words:
        return []
    stems = {w[:3] for w in query_words}
    conditions = []
    for stem in stems:
        like = "%{}%".format(stem)
        conditions.append(User.full_name.ilike(like))
        conditions.append(User.username.ilike(like))
    rows = (
        db.query(User.id, User.full_name, User.username, User.role, User.is_active)
        .filter(or_(*conditions))
        .limit(2000)
        .all()
    )
    scored = []
    for row in rows:
        score = score_person(query, row.full_name, row.username)
        if score <= 0:
            continue
        if not row.is_active:
            score *= 0.9
        scored.append({
            "user_id": row.id,
            "full_name": row.full_name,
            "username": row.username,
            "role": getattr(row.role, "value", str(row.role)),
            "is_active": bool(row.is_active),
            "match_score": round(score, 2),
        })
    scored.sort(key=lambda person: (-person["match_score"], person["full_name"] or ""))
    return scored[:max(1, limit)]


def close_candidates(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The people worth asking about: those nearly as close as the best fit.

    "Which SAM -- Sam Lee or Shahryar Ahmed (SAM)?" -- not also Samuel and
    Osama, who only share the letters.
    """
    if not candidates:
        return []
    floor = candidates[0]["match_score"] - CLEAR_MARGIN
    return [person for person in candidates if person["match_score"] >= floor]


def clear_match(candidates: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
    """The one person meant, when one clearly fits best; None when it is a guess."""
    if not candidates or candidates[0]["match_score"] < CLEAR_SCORE:
        return None
    if len(candidates) > 1 and candidates[0]["match_score"] - candidates[1]["match_score"] < CLEAR_MARGIN:
        return None
    return candidates[0]
