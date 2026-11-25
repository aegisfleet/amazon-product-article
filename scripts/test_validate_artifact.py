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
        "source": {"name": "ASCII.jp 製品レビュー記事" if pick else "トレンド調査", "url": "https://example.com/product"},
        "highlights": ["a", "b", "c"],
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
    assert validate_content(_data(), investigations_dir=None) == []


def test_legacy_format_without_new_fields_passes():
    recs = [_rec(i, pick=None) for i in range(10)]
    assert validate_content(_data(recs), investigations_dir=None) == []


def test_invalid_pick_type_and_catchphrase():
    recs = [_rec(i) for i in range(10)]
    recs[0]["pickType"] = "bogus"
    recs[1]["catchphrase"] = "短い"
    errs = validate_content(_data(recs), investigations_dir=None)
    assert any("pickType" in e for e in errs)
    assert any("catchphrase" in e for e in errs)


def test_keepa_in_why_buy_now_detected():
    recs = [_rec(i) for i in range(10)]
    recs[0]["whyBuyNow"] = "Keepaの直近90日で最安水準です、お得です"
    assert any("Keepa" in e for e in validate_content(_data(recs), investigations_dir=None))


def test_overview_too_long_or_system_wording():
    assert any("todayOverview" in e for e in validate_content(_data(overview="あ" * 161), investigations_dir=None))
    assert any("Creators API" in e for e in validate_content(_data(overview="Creators APIから取得しました"), investigations_dir=None))


def test_deal_ratio_guard():
    recs = [_rec(i, pick="deal") for i in range(6)] + [_rec(i) for i in range(6, 10)]
    assert any("セール枠" in e for e in validate_content(_data(recs), investigations_dir=None))
    recs = [_rec(i, pick=None, source={"name": "Amazon 特選タイムセール"}) for i in range(6)] + [_rec(i) for i in range(6, 10)]
    assert any("セール枠" in e for e in validate_content(_data(recs), investigations_dir=None))


def test_self_referencing_source_name_rejected():
    recs = [_rec(i) for i in range(10)]
    recs[0]["source"] = {"name": "サイト内詳細検証（高スコア名品）", "url": "https://example.com/p"}
    assert any("自己言及表現" in e for e in validate_content(_data(recs), investigations_dir=None))


def test_non_deal_external_source_url_rules():
    recs = [_rec(i) for i in range(10)]
    recs[0]["pickType"] = "gem"
    recs[0]["source"] = {"name": "製品レビュー記事", "url": "https://www.amazon.co.jp/dp/B0DH7QY2HM"}
    recs[1]["pickType"] = "seasonal"
    recs[1]["source"] = {"name": "記事", "url": "https://www.amazon-hikaku.com/b0fmjn4jj7/"}
    recs[2]["pickType"] = "niche"
    recs[2]["source"] = {"name": "メディア記事", "url": ""}
    recs[3]["pickType"] = "niche"
    recs[3]["source"] = {"name": "メディア記事", "url": None}
    errs = validate_content(_data(recs), investigations_dir=None)
    assert any("recommendations[0]" in e and "source.url" in e for e in errs)
    assert any("recommendations[1]" in e and "source.url" in e for e in errs)
    assert any("recommendations[2]" in e and "source.url" in e for e in errs)
    assert any("recommendations[3]" in e and "source.url" in e for e in errs)


def test_valid_external_and_deal_sources_pass():
    recs = [_rec(i) for i in range(10)]
    recs[0]["pickType"] = "gem"
    recs[0]["source"] = {"name": "ASCII.jp 製品レビュー記事", "url": "https://ascii.jp/elem/000/000/000/"}
    recs[1]["pickType"] = "deal"
    recs[1]["source"] = {"name": "Amazon 限定タイムセール", "url": "https://www.amazon.co.jp/dp/B0BJQ7F16T"}
    assert validate_content(_data(recs), investigations_dir=None) == []


def test_static_catalog_source_name_rejected():
    recs = [_rec(i) for i in range(10)]
    recs[0]["pickType"] = "gem"
    recs[0]["source"] = {"name": "ビクトリノックス 公式製品ページ", "url": "https://example.com/victorinox"}
    assert any("静的カタログページ" in e for e in validate_content(_data(recs), investigations_dir=None))


def test_unregistered_picks_limit(tmp_path):
    inv_dir = tmp_path / "investigations"
    inv_dir.mkdir()
    for i in range(5):
        (inv_dir / f"B0{i:08d}.json").write_text("{}", encoding="utf-8")

    # 5 registered + 5 unregistered -> passes
    assert validate_content(_data(), investigations_dir=str(inv_dir)) == []

    # 7 registered + 3 unregistered -> passes
    for i in range(5, 7):
        (inv_dir / f"B0{i:08d}.json").write_text("{}", encoding="utf-8")
    assert validate_content(_data(), investigations_dir=str(inv_dir)) == []

    # 8 registered + 2 unregistered -> fails (lower bound)
    (inv_dir / "B000000007.json").write_text("{}", encoding="utf-8")
    errs_low = validate_content(_data(), investigations_dir=str(inv_dir))
    assert any("2件 しか含まれていません" in e for e in errs_low)

    # < 10 items -> lower bound skipped
    assert validate_content(_data([_rec(i) for i in range(8)]), investigations_dir=str(inv_dir)) == []

    # 4 registered + 6 unregistered -> fails (upper bound)
    for i in range(4, 8):
        (inv_dir / f"B0{i:08d}.json").unlink()
    errs = validate_content(_data(), investigations_dir=str(inv_dir))
    assert any("サイト未登録の商品が 6件" in e for e in errs)

    # non-existent investigations_dir -> skipped safely
    assert validate_content(_data(), investigations_dir=str(tmp_path / "missing")) == []
