"""validate_artifact.py の recommendations 検証テスト (uv run --with pytest pytest scripts/test_validate_artifact.py)"""
import copy
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from validate_artifact import validate_content  # noqa: E402


def _rec(i, pick="gem", **kw):
    r = {
        "asin": f"B0{i:08d}", "title": f"商品{i}", "price": 1000, "category": f"cat{i}",
        "reason": "理由", "whyBuyNow": f"冬の生活で役立つ理由その{i}です",
        "source": {"name": "サイト内詳細検証"}, "highlights": ["a", "b", "c"],
        "url": "https://www.amazon.co.jp/dp/x/", "rankReason": f"掲載理由{i}番",
        "scoreDisclaimer": None, "imageUrl": f"https://img/{i}.jpg",
    }
    if pick:
        r["pickType"] = pick
        r["catchphrase"] = "これは十分な長さのキャッチフレーズです、本当に"
    r.update(kw)
    return r


def _data(recs=None, overview="冷え込む今週の快適ギアを厳選しました。"):
    return {"date": "2026-11-25", "headline": "h", "recommendations": recs or [_rec(i) for i in range(10)],
            "searchContext": {"todayOverview": overview, "searchedCategories": []}}


def test_valid_new_format_passes():
    assert validate_content(_data()) == []


def test_legacy_format_without_new_fields_passes():
    recs = [_rec(i, pick=None) for i in range(10)]
    assert validate_content(_data(recs)) == []


def test_invalid_pick_type_and_catchphrase():
    recs = [_rec(i) for i in range(10)]
    recs[0]["pickType"] = "bogus"
    recs[1]["catchphrase"] = "短い"
    errs = validate_content(_data(recs))
    assert any("pickType" in e for e in errs)
    assert any("catchphrase" in e for e in errs)


def test_keepa_in_why_buy_now_detected():
    recs = [_rec(i) for i in range(10)]
    recs[0]["whyBuyNow"] = "Keepaの直近90日で最安水準です、お得です"
    assert any("Keepa" in e for e in validate_content(_data(recs)))


def test_overview_too_long_or_system_wording():
    assert any("todayOverview" in e for e in validate_content(_data(overview="あ" * 161)))
    assert any("Creators API" in e for e in validate_content(_data(overview="Creators APIから取得しました")))


def test_deal_ratio_guard():
    recs = [_rec(i, pick="deal") for i in range(6)] + [_rec(i) for i in range(6, 10)]
    assert any("セール枠" in e for e in validate_content(_data(recs)))
    recs = [_rec(i, pick=None, source={"name": "Amazon 特選タイムセール"}) for i in range(6)] + [_rec(i) for i in range(6, 10)]
    assert any("セール枠" in e for e in validate_content(_data(recs)))
