"""
SUP Monthly Report — נשלח ב-1 לכל חודש
מנתח את חודש קודם, משווה לחודש הקודם + מגמת שנה + התקדמות מ-2025.
"""

import json, os, smtplib
from pathlib import Path
from datetime import date
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from collections import defaultdict
from dotenv import load_dotenv

load_dotenv()

GMAIL_USER        = os.getenv("GMAIL_USER", "maxim.maxster@gmail.com")
GMAIL_PASSWORD    = os.getenv("GMAIL_PASSWORD", "")
REPORT_EMAIL      = "maxim.maxster@gmail.com"
ATHLETE_JSON      = Path("data/athlete1.json")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
FIRECRAWL_API_KEY = os.getenv("FIRECRAWL_API_KEY", "")

HEB_MONTHS  = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני",
               "יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"]
TYPE_ICONS  = {"אירובי":"🏄","טמפו":"🌊","אירובי ארוך":"🌅","ספרינטים":"⚡"}
TYPE_ORDER  = ["אירובי","טמפו","אירובי ארוך","ספרינטים"]
SUP_SOURCES = [
    "https://www.supracer.com/training",
    "https://www.supconnect.com/training-tips",
]

# ===== DATA =====

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
            if w.get("distance", 0) > 0
            and parse_dmy(w["date"])
            and parse_dmy(w["date"]).year == y
            and parse_dmy(w["date"]).month == m]

def workouts_for_year(workouts, y):
    return [w for w in workouts
            if w.get("distance", 0) > 0
            and parse_dmy(w["date"])
            and parse_dmy(w["date"]).year == y]

def analyze(ws):
    if not ws: return None
    by_type = defaultdict(list)
    for w in ws:
        by_type[w.get("type", "אחר")].append(w)

    def stats(lst):
        if not lst: return None
        spd_lst = [w["avg_speed"] for w in lst if w.get("avg_speed", 0) > 0]
        hr_lst  = [w["avg_hr"]    for w in lst if w.get("avg_hr",    0) > 0]
        dps_lst = [w["dps"]       for w in lst if w.get("dps",       0) > 0]
        spd = sum(spd_lst)/len(spd_lst) if spd_lst else 0
        hr  = sum(hr_lst) /len(hr_lst)  if hr_lst  else 0
        dps = sum(dps_lst)/len(dps_lst) if dps_lst else 0
        eff = round(spd/hr*100, 2) if hr > 0 else None
        return {
            "n":         len(lst),
            "dist":      round(sum(w["distance"] for w in lst), 1),
            "avg_speed": round(spd, 1),
            "avg_hr":    round(hr),
            "dps":       round(dps, 2),
            "eff":       eff,
        }

    return {"total": stats(ws), "by_type": {t: stats(lst) for t, lst in by_type.items()}}

# ===== RESEARCH + AI =====

def research_sup_tips(curr, prev_month, ytd_curr, ytd_prev, month_name):
    if not ANTHROPIC_API_KEY:
        return "חסר ANTHROPIC_API_KEY."

    research_text = ""
    if FIRECRAWL_API_KEY:
        try:
            from firecrawl import FirecrawlApp
            fc = FirecrawlApp(api_key=FIRECRAWL_API_KEY)
            for url in SUP_SOURCES:
                try:
                    result = fc.scrape(url, formats=["markdown"])
                    md = result.markdown if hasattr(result, "markdown") else str(result)
                    research_text += f"\n\n=== {url} ===\n{md[:2500]}"
                except Exception as e:
                    print(f"  Firecrawl {url}: {e}")
        except ImportError:
            pass

    def fmt(a):
        if not a or not a.get("total"): return "אין נתונים"
        t = a["total"]
        lines = [f"סה\"כ: {t['n']} אימונים, {t['dist']} ק\"מ, מהירות {t['avg_speed']} קמ\"ש, דופק {t['avg_hr']} BPM, יעילות {t['eff']}"]
        for tp in TYPE_ORDER:
            s = a["by_type"].get(tp)
            if s:
                lines.append(f"  {tp}: {s['n']} × {s['dist']}ק\"מ | מהירות {s['avg_speed']} | דופק {s['avg_hr']} | יעילות {s['eff']}")
        return "\n".join(lines)

    prompt = f"""אתה מאמן SUP מקצועי. לפניך נתוני אימוני SUP של ספורטאי חובב מנוסה.

=== {month_name} ===
{fmt(curr)}

=== חודש קודם ===
{fmt(prev_month)}

=== שנה נוכחית (YTD) ===
{fmt(ytd_curr)}

=== שנה קודמת (2025 מלא) ===
{fmt(ytd_prev)}

=== מחקר מאתרי SUP ===
{research_text[:4000] if research_text else "לא זמין"}

כתוב ניתוח בעברית, קצר ומעשי, בגוף שני:
1. **סיכום {month_name}** — 2-3 משפטים על החודש
2. **השוואה לחודש קודם** — מה השתנה (טוב/פחות טוב)
3. **מגמה שנתית** — האם 2026 טוב יותר מ-2025? מה הכיוון?
4. **3-4 המלצות ספציפיות לחודש הבא** — על בסיס הנתונים + המחקר
5. **יעד מספרי אחד** לחודש הבא

אל תחזור על הנתונים — נתח אותם."""

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1800,
            messages=[{"role": "user", "content": prompt}]
        )
        return msg.content[0].text
    except Exception as e:
        return f"שגיאת Claude: {e}"

# ===== HTML =====

def pct_arrow(curr_val, prev_val, higher_is_better=True):
    if not curr_val or not prev_val or prev_val == 0: return ""
    diff = curr_val - prev_val
    pct  = diff / prev_val * 100
    good = (diff > 0) == higher_is_better
    color = "#4CAF50" if good else "#f44336"
    arrow = "↑" if diff > 0 else "↓"
    return f'<span style="color:{color};font-size:0.82em;margin-right:4px">{arrow}{abs(pct):.1f}%</span>'

def kpi_card(val, label, sub=""):
    return f"""<div style="flex:1;min-width:120px;background:rgba(255,255,255,0.04);border-radius:12px;
padding:14px 10px;text-align:center;border:1px solid rgba(255,255,255,0.08)">
<div style="font-size:1.5em;font-weight:700;color:#00D4FF">{val}</div>
<div style="font-size:0.76em;color:rgba(230,238,250,0.5);margin-top:3px">{label}</div>
{f'<div style="font-size:0.7em;color:rgba(230,238,250,0.35);margin-top:2px">{sub}</div>' if sub else ''}
</div>"""

def section_header(title, color="rgba(212,97,10,0.4)"):
    return f'<div style="padding:12px 16px;background:{color};font-weight:700;font-size:0.92em;border-radius:8px 8px 0 0">{title}</div>'

def type_table(curr_a, prev_a, label_curr, label_prev):
    rows = ""
    for t in TYPE_ORDER:
        s = (curr_a or {}).get("by_type", {}).get(t)
        p = (prev_a or {}).get("by_type", {}).get(t)
        if not s: continue
        icon = TYPE_ICONS.get(t, "")
        rows += f"""<tr>
          <td style="padding:9px 12px;border-bottom:1px solid rgba(255,255,255,0.06)">{icon} {t}</td>
          <td style="padding:9px 12px;border-bottom:1px solid rgba(255,255,255,0.06);text-align:center">{s['n']}</td>
          <td style="padding:9px 12px;border-bottom:1px solid rgba(255,255,255,0.06);text-align:center">{s['dist']}ק"מ {pct_arrow(s['dist'], p['dist'] if p else None)}</td>
          <td style="padding:9px 12px;border-bottom:1px solid rgba(255,255,255,0.06);text-align:center">{s['avg_speed']}קמ"ש {pct_arrow(s['avg_speed'], p['avg_speed'] if p else None)}</td>
          <td style="padding:9px 12px;border-bottom:1px solid rgba(255,255,255,0.06);text-align:center">{s['avg_hr']}BPM {pct_arrow(s['avg_hr'], p['avg_hr'] if p else None, False)}</td>
          <td style="padding:9px 12px;border-bottom:1px solid rgba(255,255,255,0.06);text-align:center">{s['eff'] or '—'} {pct_arrow(s['eff'], p['eff'] if p else None)}</td>
        </tr>"""

    header_style = "padding:8px 12px;text-align:center;color:rgba(230,238,250,0.45);font-weight:400;font-size:0.82em"
    return f"""<table style="width:100%;border-collapse:collapse;font-size:0.86em">
      <thead><tr>
        <th style="{header_style};text-align:right">סוג</th>
        <th style="{header_style}">#</th>
        <th style="{header_style}">מרחק</th>
        <th style="{header_style}">מהירות</th>
        <th style="{header_style}">דופק</th>
        <th style="{header_style}">יעילות</th>
      </tr></thead>
      <tbody>{rows}</tbody>
    </table>"""

def year_compare_row(label, curr_val, prev_val, unit="", higher_is_better=True):
    arrow = pct_arrow(curr_val, prev_val, higher_is_better)
    cv = f"{curr_val}{unit}" if curr_val else "—"
    pv = f"{prev_val}{unit}" if prev_val else "—"
    return f"""<tr>
      <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);color:rgba(230,238,250,0.7)">{label}</td>
      <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);text-align:center;color:rgba(230,238,250,0.45)">{pv}</td>
      <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);text-align:center;font-weight:600">{cv} {arrow}</td>
    </tr>"""

def build_html(month_name, curr, prev_month, ytd_curr, ytd_prev, recommendations):
    t  = (curr  or {}).get("total") or {}
    pt = (prev_month or {}).get("total") or {}
    yt = (ytd_curr or {}).get("total") or {}
    yp = (ytd_prev or {}).get("total") or {}

    recs_html = ""
    for line in recommendations.split("\n"):
        line = line.strip()
        if not line: continue
        recs_html += f'<p style="margin:0 0 9px;line-height:1.75;font-size:0.91em">{line}</p>'

    return f"""<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0e1a;color:#e6eefa;font-family:Arial,sans-serif;direction:rtl">
<div style="max-width:700px;margin:0 auto;padding:20px 14px">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#0d1526,#162040);border-radius:16px;padding:26px;
  margin-bottom:18px;text-align:center;border:1px solid rgba(0,212,255,0.2)">
    <div style="font-size:2em;margin-bottom:6px">🏄</div>
    <h1 style="margin:0;font-size:1.4em;color:#00D4FF">דו"ח SUP חודשי</h1>
    <p style="margin:5px 0 0;color:rgba(230,238,250,0.5);font-size:0.9em">{month_name}</p>
  </div>

  <!-- KPIs -->
  <div style="display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap">
    {kpi_card(t.get('n','—'), 'אימונים', f'לעומת {pt.get("n","—")} חודש קודם')}
    {kpi_card(f"{t.get('dist','—')}ק\"מ", 'מרחק', f'לעומת {pt.get("dist","—")}ק"מ')}
    {kpi_card(f"{t.get('avg_speed','—')}קמ\"ש", 'מהירות ממוצעת', f'לעומת {pt.get("avg_speed","—")}')}
    {kpi_card(t.get('eff','—'), 'יעילות', f'לעומת {pt.get("eff","—")}')}
  </div>

  <!-- פירוט חודש + השוואה לחודש קודם -->
  <div style="background:rgba(255,255,255,0.03);border-radius:12px;margin-bottom:18px;
  overflow:hidden;border:1px solid rgba(255,255,255,0.07)">
    {section_header(f'📊 {month_name} — פירוט לפי סוג (מול חודש קודם)')}
    {type_table(curr, prev_month, month_name, 'חודש קודם')}
  </div>

  <!-- השוואה שנתית -->
  <div style="background:rgba(255,255,255,0.03);border-radius:12px;margin-bottom:18px;
  overflow:hidden;border:1px solid rgba(255,255,255,0.07)">
    {section_header('📈 השוואה שנתית — 2025 מול 2026 (עד כה)', 'rgba(0,100,180,0.4)')}
    <table style="width:100%;border-collapse:collapse;font-size:0.86em">
      <thead><tr>
        <th style="padding:8px 12px;text-align:right;color:rgba(230,238,250,0.45);font-weight:400">מדד</th>
        <th style="padding:8px 12px;text-align:center;color:rgba(230,238,250,0.45);font-weight:400">2025</th>
        <th style="padding:8px 12px;text-align:center;color:rgba(230,238,250,0.45);font-weight:400">2026 (YTD)</th>
      </tr></thead>
      <tbody>
        {year_compare_row('אימונים', yt.get('n'), yp.get('n'))}
        {year_compare_row('מרחק כולל', yt.get('dist'), yp.get('dist'), 'ק"מ')}
        {year_compare_row('מהירות ממוצעת', yt.get('avg_speed'), yp.get('avg_speed'), 'קמ"ש')}
        {year_compare_row('דופק ממוצע', yt.get('avg_hr'), yp.get('avg_hr'), 'BPM', False)}
        {year_compare_row('יעילות ממוצעת', yt.get('eff'), yp.get('eff'))}
      </tbody>
    </table>
  </div>

  <!-- המלצות -->
  <div style="background:rgba(0,212,255,0.05);border-radius:12px;padding:18px;
  border:1px solid rgba(0,212,255,0.18);margin-bottom:18px">
    <div style="font-weight:700;font-size:0.95em;margin-bottom:12px;color:#00D4FF">💡 ניתוח והמלצות לחודש הבא</div>
    {recs_html}
  </div>

  <p style="text-align:center;color:rgba(230,238,250,0.25);font-size:0.75em;margin-top:16px">
    SUP Challenge · דו"ח חודשי אוטומטי · maximmaxster.github.io/sup-challenge
  </p>
</div>
</body></html>"""

def send_report(html, month_name):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f'🏄 דו"ח SUP — {month_name}'
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
    if today.month == 1:
        ry, rm = today.year - 1, 12
    else:
        ry, rm = today.year, today.month - 1

    month_name = f"{HEB_MONTHS[rm-1]} {ry}"
    print(f"{'='*52}\nSUP Monthly Report — {month_name}\n{'='*52}")

    workouts = load_workouts()

    ws_curr = workouts_for_month(workouts, ry, rm)
    if not ws_curr:
        print(f"⚠ אין אימונים ל-{month_name}"); return

    # חודש קודם
    pm_y, pm_m = (ry-1, 12) if rm == 1 else (ry, rm-1)
    ws_prev  = workouts_for_month(workouts, pm_y, pm_m)

    # שנה נוכחית YTD (עד סוף חודש הדיווח)
    ws_ytd_curr = [w for w in workouts
                   if w.get("distance", 0) > 0
                   and parse_dmy(w["date"])
                   and parse_dmy(w["date"]).year == ry
                   and parse_dmy(w["date"]).month <= rm]

    # שנה קודמת — כל 2025
    prev_full_year = ry - 1
    ws_ytd_prev = workouts_for_year(workouts, prev_full_year)

    curr      = analyze(ws_curr)
    prev_month = analyze(ws_prev)
    ytd_curr  = analyze(ws_ytd_curr)
    ytd_prev  = analyze(ws_ytd_prev)

    print(f"  חודש נוכחי: {len(ws_curr)} אימונים, {curr['total']['dist']}ק\"מ")
    print(f"  YTD {ry}: {len(ws_ytd_curr)} אימונים")
    print(f"  {prev_full_year} מלא: {len(ws_ytd_prev)} אימונים")
    print(f"  מחקר + המלצות מ-Claude...")

    recommendations = research_sup_tips(curr, prev_month, ytd_curr, ytd_prev, month_name)

    html = build_html(month_name, curr, prev_month, ytd_curr, ytd_prev, recommendations)
    send_report(html, month_name)
    print(f"\n✓ דו\"ח חודשי הושלם!")

if __name__ == "__main__":
    main()
