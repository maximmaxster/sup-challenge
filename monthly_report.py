"""
SUP Monthly Report — נשלח ב-1 לכל חודש
מנתח את חודש קודם, משווה למגמה, חוקר אתרי SUP, ושולח המלצות למקסים.
"""

import json, os, smtplib, sys
from pathlib import Path
from datetime import date, datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from collections import defaultdict
from dotenv import load_dotenv

load_dotenv()

# ===== CONFIG =====
GMAIL_USER     = os.getenv("GMAIL_USER", "maxim.maxster@gmail.com")
GMAIL_PASSWORD = os.getenv("GMAIL_PASSWORD", "")
REPORT_EMAIL   = "maxim.maxster@gmail.com"
ATHLETE_JSON   = Path("data/athlete1.json")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
FIRECRAWL_API_KEY = os.getenv("FIRECRAWL_API_KEY", "")

HEB_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני",
               "יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"]
TYPE_ICONS = {"אירובי": "🏄", "טמפו": "🌊", "אירובי ארוך": "🌅", "ספרינטים": "⚡"}
SUP_SOURCES = [
    "https://www.supracer.com/training",
    "https://www.supconnect.com/training-tips",
    "https://www.paddlefit.co.uk",
    "https://www.sup-athlète.com",
]

# ===== HELPERS =====

def load_workouts():
    data = json.loads(ATHLETE_JSON.read_text(encoding="utf-8-sig"))
    return data.get("workouts", [])

def parse_dmy(s):
    try:
        d, m, y = s.split(".")
        return date(int(y), int(m), int(d))
    except Exception:
        return None

def workouts_for_month(workouts, y, m):
    return [w for w in workouts
            if w.get("distance", 0) > 0 and
            parse_dmy(w["date"]) and
            parse_dmy(w["date"]).year == y and
            parse_dmy(w["date"]).month == m]

def analyze_month(ws):
    """מחזיר dict עם סטטיסטיקות לפי סוג + סיכום כולל."""
    by_type = defaultdict(list)
    for w in ws:
        by_type[w.get("type", "אחר")].append(w)

    def stats(lst):
        if not lst: return None
        n    = len(lst)
        dist = sum(w["distance"] for w in lst)
        spd  = sum(w.get("avg_speed", 0) for w in lst if w.get("avg_speed")) / max(1, sum(1 for w in lst if w.get("avg_speed")))
        hr   = sum(w.get("avg_hr",    0) for w in lst if w.get("avg_hr"))    / max(1, sum(1 for w in lst if w.get("avg_hr")))
        dps  = sum(w.get("dps",       0) for w in lst if w.get("dps"))       / max(1, sum(1 for w in lst if w.get("dps")))
        eff  = round(spd / hr * 100, 2) if hr > 0 else None
        return {"n": n, "dist": round(dist, 1), "avg_speed": round(spd, 1),
                "avg_hr": round(hr), "dps": round(dps, 2), "eff": eff}

    total_stats = stats(ws)
    return {"total": total_stats, "by_type": {t: stats(lst) for t, lst in by_type.items()}}

def research_sup_tips(month_analysis):
    """מחקר Firecrawl + ניתוח Claude."""
    if not FIRECRAWL_API_KEY or not ANTHROPIC_API_KEY:
        return "לא ניתן לבצע מחקר — חסרים מפתחות API."

    # Firecrawl
    research_text = ""
    try:
        from firecrawl import FirecrawlApp
        fc = FirecrawlApp(api_key=FIRECRAWL_API_KEY)
        for url in SUP_SOURCES[:2]:  # מגבלה — 2 אתרים
            try:
                result = fc.scrape_url(url, formats=["markdown"])
                md = result.markdown if hasattr(result, "markdown") else str(result)
                research_text += f"\n\n=== {url} ===\n{md[:3000]}"
            except Exception as e:
                print(f"  Firecrawl {url}: {e}")
    except ImportError:
        research_text = "(Firecrawl לא מותקן)"

    # בניית פרומפט לClaude
    analysis_text = json.dumps(month_analysis, ensure_ascii=False, indent=2)
    prompt = f"""אתה מאמן SUP מקצועי. לפניך נתוני אימוני SUP של ספורטאי חובב מנוסה לחודש האחרון:

{analysis_text}

מחקר מאתרי SUP מובילים:
{research_text[:4000] if research_text else "לא זמין"}

כתוב ניתוח והמלצות בעברית, מובנה, ללא בולשיט. כלול:
1. סיכום קצר של החודש (2-3 משפטים)
2. ניתוח לפי סוג אימון — מה טוב, מה ניתן לשפר
3. 3-5 המלצות ספציפיות לשיפור לחודש הבא (על בסיס הנתונים + המחקר)
4. מטרה מספרית אחת לחודש הבא

כתוב בגוף שני, קצר ומעשי."""

    # Claude API
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}]
        )
        return msg.content[0].text
    except Exception as e:
        return f"שגיאת Claude API: {e}"

def build_html(prev_month_name, curr_analysis, prev_analysis, recommendations):
    """בונה HTML מייל."""
    total = curr_analysis["total"] or {}
    prev_total = prev_analysis["total"] if prev_analysis else {}

    def delta(curr_val, prev_val, fmt=".1f", higher_is_better=True):
        if not curr_val or not prev_val: return ""
        diff = curr_val - prev_val
        pct  = diff / prev_val * 100
        color = "#4CAF50" if (diff > 0) == higher_is_better else "#f44336"
        arrow = "↑" if diff > 0 else "↓"
        return f' <span style="color:{color};font-size:0.85em">{arrow} {abs(pct):.1f}%</span>'

    rows_by_type = ""
    for t, s in curr_analysis["by_type"].items():
        if not s: continue
        icon = TYPE_ICONS.get(t, "🏄")
        p    = (prev_analysis or {}).get("by_type", {}).get(t)
        rows_by_type += f"""
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.08)">{icon} {t}</td>
          <td style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.08);text-align:center">{s['n']}</td>
          <td style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.08);text-align:center">{s['dist']} ק"מ{delta(s['dist'], p['dist'] if p else None)}</td>
          <td style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.08);text-align:center">{s['avg_speed']} קמ"ש{delta(s['avg_speed'], p['avg_speed'] if p else None)}</td>
          <td style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.08);text-align:center">{s['avg_hr']} BPM{delta(s['avg_hr'], p['avg_hr'] if p else None, higher_is_better=False)}</td>
          <td style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.08);text-align:center">{s['eff'] or '—'}{delta(s['eff'], p['eff'] if p else None)}</td>
        </tr>"""

    recs_html = ""
    for line in recommendations.split("\n"):
        line = line.strip()
        if not line: continue
        recs_html += f'<p style="margin:0 0 10px;line-height:1.7">{line}</p>'

    return f"""<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0e1a;color:#e6eefa;font-family:Arial,sans-serif;direction:rtl">
  <div style="max-width:680px;margin:0 auto;padding:24px 16px">

    <div style="background:linear-gradient(135deg,#0d1526,#162040);border-radius:16px;padding:28px;margin-bottom:20px;text-align:center;border:1px solid rgba(0,212,255,0.2)">
      <div style="font-size:2.2em;margin-bottom:8px">🏄</div>
      <h1 style="margin:0;font-size:1.5em;color:#00D4FF">דו"ח חודשי SUP</h1>
      <p style="margin:6px 0 0;color:rgba(230,238,250,0.6);font-size:0.95em">{prev_month_name}</p>
    </div>

    <!-- KPIs -->
    <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
      {''.join(f"""<div style="flex:1;min-width:130px;background:rgba(255,255,255,0.04);border-radius:12px;padding:16px;text-align:center;border:1px solid rgba(255,255,255,0.08)">
        <div style="font-size:1.6em;font-weight:700;color:#00D4FF">{v}</div>
        <div style="font-size:0.78em;color:rgba(230,238,250,0.5);margin-top:4px">{l}</div>
      </div>""" for v, l in [
          (f"{total.get('n','—')}", "אימונים"),
          (f"{total.get('dist','—')} ק\"מ", "מרחק כולל"),
          (f"{total.get('avg_speed','—')} קמ\"ש", "מהירות ממוצעת"),
          (f"{total.get('eff','—')}", "יעילות"),
      ])}
    </div>

    <!-- טבלה לפי סוג -->
    <div style="background:rgba(255,255,255,0.04);border-radius:12px;margin-bottom:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.08)">
      <div style="padding:14px 16px;background:rgba(212,97,10,0.35);font-weight:700;font-size:0.95em">פירוט לפי סוג אימון</div>
      <table style="width:100%;border-collapse:collapse;font-size:0.88em">
        <thead>
          <tr style="background:rgba(255,255,255,0.04)">
            <th style="padding:10px 14px;text-align:right;color:rgba(230,238,250,0.5);font-weight:400">סוג</th>
            <th style="padding:10px 14px;text-align:center;color:rgba(230,238,250,0.5);font-weight:400">#</th>
            <th style="padding:10px 14px;text-align:center;color:rgba(230,238,250,0.5);font-weight:400">מרחק</th>
            <th style="padding:10px 14px;text-align:center;color:rgba(230,238,250,0.5);font-weight:400">מהירות</th>
            <th style="padding:10px 14px;text-align:center;color:rgba(230,238,250,0.5);font-weight:400">דופק</th>
            <th style="padding:10px 14px;text-align:center;color:rgba(230,238,250,0.5);font-weight:400">יעילות</th>
          </tr>
        </thead>
        <tbody>{rows_by_type}</tbody>
      </table>
    </div>

    <!-- המלצות -->
    <div style="background:rgba(255,255,255,0.04);border-radius:12px;padding:20px;border:1px solid rgba(0,212,255,0.15)">
      <div style="font-weight:700;font-size:1em;margin-bottom:14px;color:#00D4FF">💡 ניתוח והמלצות לחודש הבא</div>
      {recs_html}
    </div>

    <p style="text-align:center;color:rgba(230,238,250,0.3);font-size:0.78em;margin-top:20px">
      SUP Challenge · דו"ח חודשי אוטומטי
    </p>
  </div>
</body>
</html>"""

def send_report(html, month_name):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"🏄 דו\"ח SUP חודשי — {month_name}"
    msg["From"]    = GMAIL_USER
    msg["To"]      = REPORT_EMAIL
    msg.attach(MIMEText(html, "html", "utf-8"))

    with smtplib.SMTP("smtp.gmail.com", 587) as s:
        s.starttls()
        s.login(GMAIL_USER, GMAIL_PASSWORD)
        s.sendmail(GMAIL_USER, REPORT_EMAIL, msg.as_string())
    print(f"  ✓ נשלח ל-{REPORT_EMAIL}")

# ===== MAIN =====

def main():
    today = date.today()

    # חודש לדיווח = חודש קודם
    if today.month == 1:
        report_year, report_month = today.year - 1, 12
    else:
        report_year, report_month = today.year, today.month - 1

    month_name = f"{HEB_MONTHS[report_month - 1]} {report_year}"
    print(f"{'='*50}")
    print(f"SUP Monthly Report — {month_name}")
    print(f"{'='*50}")

    workouts = load_workouts()

    # ניתוח חודש דיווח
    ws_curr  = workouts_for_month(workouts, report_year, report_month)
    if not ws_curr:
        print(f"⚠ אין אימונים לחודש {month_name} — מייל לא נשלח.")
        return

    curr_analysis = analyze_month(ws_curr)

    # ניתוח חודש קודם להשוואה
    if report_month == 1:
        prev_year, prev_month = report_year - 1, 12
    else:
        prev_year, prev_month = report_year, report_month - 1

    ws_prev      = workouts_for_month(workouts, prev_year, prev_month)
    prev_analysis = analyze_month(ws_prev) if ws_prev else None

    print(f"  אימונים בחודש: {len(ws_curr)}")
    print(f"  מרחק כולל: {curr_analysis['total']['dist']} ק\"מ")
    print(f"  מחקר + המלצות...")

    recommendations = research_sup_tips(curr_analysis)

    html = build_html(month_name, curr_analysis, prev_analysis, recommendations)

    print(f"  שולח מייל...")
    send_report(html, month_name)
    print(f"\n✓ דו\"ח חודשי הושלם!")

if __name__ == "__main__":
    main()
