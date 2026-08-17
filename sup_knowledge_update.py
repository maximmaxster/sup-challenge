"""
SUP Knowledge Base Updater
מריץ Firecrawl על אתרי SUP מקצועיים + Claude מחלץ benchmarks ותובנות.
מופעל שבועית (ראשון 09:00) דרך /etc/cron.d/sup-challenge.
תוצאה נשמרת ב: data/sup_knowledge.json
"""

import json, os, sys
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

FIRECRAWL_API_KEY = os.getenv("FIRECRAWL_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
KB_PATH = Path("data/sup_knowledge.json")

SOURCES = [
    {"url": "https://distancepaddler.com/training",      "focus": "distance pacing, DPS, aerobic base"},
    {"url": "https://www.supracer.com/training",         "focus": "technique, race training, stroke efficiency"},
    {"url": "https://paddlecamp.com/technique",          "focus": "stroke mechanics, DPS optimization, catch phase"},
    {"url": "https://www.supconnect.com/training-tips",  "focus": "interval training, tempo, aerobic base"},
]

# ── Benchmarks ברירת מחדל — יוחלפו בנתונים מהמחקר אם נמצאים ──
DEFAULT_BENCHMARKS = {
    "aerobic": {
        "dps_m":        2.8,   # מטרים למשיכה — יעד אירובי
        "spm":          42,    # משיכות לדקה
        "pa_hr_pct":    5.0,   # Aerobic Decoupling — <5% = מצוין
        "z2_pct":       70,    # % זמן ב-Z2
        "pace_cv_pct":  5.0,   # עקביות קצב
        "dps_cv_pct":   5.0,   # עקביות DPS
    },
    "aerobic_long": {
        "dps_m":        2.7,
        "spm":          40,
        "pa_hr_pct":    5.0,
        "z2_pct":       75,
        "pace_cv_pct":  5.0,
        "dps_cv_pct":   6.0,
    },
    "tempo": {
        "dps_m":        3.0,
        "spm":          47,
        "pa_hr_pct":    None,  # לא רלוונטי לטמפו
        "z34_pct":      60,    # % זמן ב-Z3+Z4
        "pace_cv_pct":  4.5,
        "dps_cv_pct":   6.0,
    },
    "sprints": {
        "peak_speed_kmh":   11.0,
        "spm":               54,
        "z45_pct":           60,   # % ספרינטים ב-Z4+Z5
        "hr_recovery_bpm":   15,   # ירידת דופק בין ספרינטים
        "dps_cv_pct":        8.0,
    },
}

TYPE_MAP = {
    "אירובי":      "aerobic",
    "אירובי ארוך": "aerobic_long",
    "טמפו":        "tempo",
    "ספרינטים":    "sprints",
}


def scrape_sources() -> str:
    """Firecrawl → markdown מכל המקורות."""
    if not FIRECRAWL_API_KEY:
        print("  [Knowledge] אין FIRECRAWL_API_KEY — דולג")
        return ""
    try:
        from firecrawl import FirecrawlApp
        fc = FirecrawlApp(api_key=FIRECRAWL_API_KEY)
    except ImportError:
        print("  [Knowledge] firecrawl לא מותקן")
        return ""

    content = ""
    for src in SOURCES:
        try:
            result = fc.scrape(src["url"], formats=["markdown"])
            md = result.markdown if hasattr(result, "markdown") else str(result)
            content += f"\n\n=== SOURCE: {src['url']} ===\nFOCUS: {src['focus']}\n{md[:2500]}"
            print(f"  [Knowledge] scraped: {src['url']}")
        except Exception as e:
            print(f"  [Knowledge] {src['url']}: {e}")
    return content


def extract_knowledge(raw_content: str) -> dict:
    """Claude מחלץ benchmarks ותובנות מהתוכן הגולמי."""
    if not ANTHROPIC_API_KEY or not raw_content:
        return {}
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    except ImportError:
        return {}

    prompt = f"""You are a professional SUP (Stand-Up Paddleboarding) coach analyzing training articles.
Extract structured training benchmarks and insights for SUP competitive paddlers.

SOURCES:
{raw_content[:7000]}

Return ONLY valid JSON with this exact structure (use null for values not found in articles):
{{
  "benchmarks": {{
    "aerobic": {{
      "dps_m": <float or null>,
      "spm": <int or null>,
      "pa_hr_pct": <float or null>,
      "z2_pct": <int or null>,
      "pace_cv_pct": <float or null>
    }},
    "aerobic_long": {{
      "dps_m": <float or null>,
      "spm": <int or null>,
      "pa_hr_pct": <float or null>,
      "z2_pct": <int or null>,
      "pace_cv_pct": <float or null>
    }},
    "tempo": {{
      "dps_m": <float or null>,
      "spm": <int or null>,
      "z34_pct": <int or null>,
      "pace_cv_pct": <float or null>
    }},
    "sprints": {{
      "peak_speed_kmh": <float or null>,
      "spm": <int or null>,
      "z45_pct": <int or null>,
      "hr_recovery_bpm": <int or null>
    }}
  }},
  "insights": [
    {{
      "workout_types": ["aerobic"],
      "metric": "dps",
      "insight_he": "<one sentence in Hebrew explaining the insight>",
      "threshold": <numeric value or null>,
      "source_domain": "<domain.com>"
    }}
  ]
}}

Extract 6-10 insights covering: DPS targets, SPM ranges, aerobic base building, pacing strategy,
cardiac efficiency, sprint power development. All Hebrew text must be clear and actionable.
Return ONLY the JSON, no other text."""

    try:
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2500,
            messages=[{"role": "user", "content": prompt}]
        )
        text = msg.content[0].text.strip()
        # strip markdown fences if present
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text)
    except Exception as e:
        print(f"  [Knowledge] Claude extract error: {e}")
        return {}


def merge_with_defaults(extracted: dict) -> dict:
    """ממזג benchmarks מהמחקר עם ברירות מחדל — מחקר מנצח."""
    benchmarks = {}
    for t, defaults in DEFAULT_BENCHMARKS.items():
        extracted_bm = (extracted.get("benchmarks") or {}).get(t, {})
        merged = dict(defaults)
        for k, v in extracted_bm.items():
            if v is not None:
                merged[k] = v
        benchmarks[t] = merged

    return {
        "updated":    datetime.now().strftime("%d.%m.%Y %H:%M"),
        "sources":    [s["url"] for s in SOURCES],
        "benchmarks": benchmarks,
        "insights":   (extracted.get("insights") or []),
    }


def main():
    print("=" * 50)
    print(f"SUP Knowledge Update — {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    print("=" * 50)

    raw = scrape_sources()
    extracted = extract_knowledge(raw) if raw else {}
    kb = merge_with_defaults(extracted)

    KB_PATH.parent.mkdir(exist_ok=True)
    KB_PATH.write_text(json.dumps(kb, ensure_ascii=False, indent=2), encoding="utf-8")

    n_insights = len(kb.get("insights", []))
    print(f"\n✓ נשמר {KB_PATH}")
    print(f"  תובנות: {n_insights} | מקורות: {len(kb['sources'])}")
    print(f"  benchmarks: {list(kb['benchmarks'].keys())}")


if __name__ == "__main__":
    main()
