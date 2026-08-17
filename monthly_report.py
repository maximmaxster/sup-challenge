"""
SUP Monthly Report — נשלח ב-2 לכל חודש
מנתח את חודש קודם, משווה לחודש הקודם + מגמת שנה + התקדמות מ-2025.
"""

import json, os, smtplib
from pathlib import Path
from datetime import date, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from collections import defaultdict
from dotenv import load_dotenv

load_dotenv()

GMAIL_USER        = os.getenv("GMAIL_USER", "maxim.maxster@gmail.com")
GMAIL_PASSWORD    = os.getenv("GMAIL_PASSWORD", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
FIRECRAWL_API_KEY = os.getenv("FIRECRAWL_API_KEY", "")

ATHLETES = [
    {
        "name": os.getenv("ATHLETE1_NAME", "מקסים רפופורט"),
        "email": "maxim.maxster@gmail.com",
        "json": Path("data/athlete1.json"),
        "garmin_email": os.getenv("GARMIN_EMAIL_1"),
        "garmin_password": os.getenv("GARMIN_PASSWORD_1"),
        "token_dir": ".garth_tokens_1",
    },
    {
        "name": os.getenv("ATHLETE2_NAME", "ויקטור מורטוב"),
        "email": "Victormuratov@gmail.com",
        "json": Path("data/athlete2.json"),
        "garmin_email": os.getenv("GARMIN_EMAIL_2"),
        "garmin_password": os.getenv("GARMIN_PASSWORD_2"),
        "token_dir": ".garth_tokens_2",
    },
]

HEB_MONTHS  = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני",
               "יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"]
TYPE_ICONS  = {"אירובי":"🏄","טמפו":"🌊","אירובי ארוך":"🌅","ספרינטים":"⚡"}
TYPE_ORDER  = ["אירובי","טמפו","אירובי ארוך","ספרינטים"]
SUP_SOURCES = [
    "https://distancepaddler.com/training",
    "https://www.supracer.com/training",
    "https://paddlecamp.com/technique",
]

# ===== DATA =====

def load_workouts(json_path: Path):
    data = json.loads(json_path.read_text(encoding="utf-8-sig"))
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
        spm_lst = [w["spm"]       for w in lst if w.get("spm",       0) > 0]
        spd = sum(spd_lst)/len(spd_lst) if spd_lst else 0
        hr  = sum(hr_lst) /len(hr_lst)  if hr_lst  else 0
        dps = sum(dps_lst)/len(dps_lst) if dps_lst else 0
        spm = sum(spm_lst)/len(spm_lst) if spm_lst else 0
        eff = round(spd/hr*100, 2) if hr > 0 else None
        return {
            "n":         len(lst),
            "dist":      round(sum(w["distance"] for w in lst), 1),
            "avg_speed": round(spd, 1),
            "avg_hr":    round(hr),
            "dps":       round(dps, 2),
            "spm":       round(spm, 1),
            "eff":       eff,
        }

    return {"total": stats(ws), "by_type": {t: stats(lst) for t, lst in by_type.items()}}

def analyze_technical(ws):
    """מצבר מדדי lap analysis שנשמרו בכל אימון: Pa:HR, pace_cv, dps_cv, hr_zones."""
    if not ws: return {}
    by_type = defaultdict(list)
    for w in ws:
        t = w.get("type", "")
        if t: by_type[t].append(w)

    def _avg(lst): return round(sum(lst)/len(lst), 1) if lst else None

    def tech_stats(lst):
        pa   = [w['pa_hr']   for w in lst if w.get('pa_hr')   is not None]
        cv   = [w['pace_cv'] for w in lst if w.get('pace_cv') is not None]
        dcv  = [w['dps_cv']  for w in lst if w.get('dps_cv')  is not None]
        z2   = [w['hr_z2']   for w in lst if w.get('hr_z2')   is not None]
        z3   = [w['hr_z3']   for w in lst if w.get('hr_z3')   is not None]
        z4   = [w['hr_z4']   for w in lst if w.get('hr_z4')   is not None]
        return {
            "pa_hr":      _avg(pa),
            "pace_cv":    _avg(cv),
            "dps_cv":     _avg(dcv),
            "avg_z2":     _avg(z2),
            "avg_z3":     _avg(z3),
            "avg_z4":     _avg(z4),
            "n_analyzed": len([w for w in lst if w.get('hr_z2') is not None]),
        }

    # התפלגות כוללת של אזורי דופק — ממוצע כל האימונים
    zone_vals = {z: [] for z in range(1, 6)}
    for w in ws:
        for z in range(1, 6):
            v = w.get(f'hr_z{z}')
            if v is not None:
                zone_vals[z].append(v)
    overall_zones = {z: round(sum(zone_vals[z])/len(zone_vals[z])) if zone_vals[z] else 0 for z in range(1, 6)}

    return {
        "by_type":      {t: tech_stats(lst) for t, lst in by_type.items()},
        "overall_zones": overall_zones,
        "n_analyzed":   len([w for w in ws if w.get('hr_z2') is not None]),
    }


def monthly_avg(ytd_analysis, n_months):
    """מחשב ממוצע חודשי מתוך נתוני YTD."""
    if not ytd_analysis or not ytd_analysis.get("total") or n_months == 0:
        return None
    t = ytd_analysis["total"]
    avg_total = {
        "n":         round(t["n"] / n_months, 1),
        "dist":      round(t["dist"] / n_months, 1),
        "avg_speed": t["avg_speed"],
        "avg_hr":    t["avg_hr"],
        "dps":       t["dps"],
        "spm":       t.get("spm", 0),
        "eff":       t["eff"],
    }
    avg_by_type = {}
    for tp, s in ytd_analysis["by_type"].items():
        if not s: continue
        avg_by_type[tp] = {
            "n":         round(s["n"] / n_months, 1),
            "dist":      round(s["dist"] / n_months, 1),
            "avg_speed": s["avg_speed"],
            "avg_hr":    s["avg_hr"],
            "dps":       s["dps"],
            "spm":       s.get("spm", 0),
            "eff":       s["eff"],
        }
    return {"total": avg_total, "by_type": avg_by_type}

# ===== GARMIN WELLNESS =====

def connect_garmin_for_report(athlete: dict):
    try:
        import garminconnect
        api = garminconnect.Garmin(athlete["garmin_email"], athlete["garmin_password"])
        api.login(tokenstore=athlete["token_dir"])
        return api
    except Exception as e:
        print(f"  [Garmin] חיבור נכשל ({athlete['name']}): {e}")
        return None


def fetch_monthly_wellness(api, year: int, month: int) -> dict:
    """Fetch sleep + body battery + RHR for every day of the month. Returns aggregated stats."""
    from calendar import monthrange
    if api is None:
        return {}

    _, days_in_month = monthrange(year, month)
    sleep_hours, deep_pcts, rem_pcts, bbs, rhrs, stresses = [], [], [], [], [], []
    bad_sleep_days = 0  # < 6h OR deep_pct < 13%

    print(f"  [Wellness] שולף {days_in_month} ימים...")
    for day in range(1, days_in_month + 1):
        d = date(year, month, day)
        d_iso = d.isoformat()
        try:
            sleep = api.get_sleep_data(d_iso)
            dto = (sleep or {}).get("dailySleepDTO", {})
            if dto:
                total = dto.get("sleepTimeSeconds", 0) or 0
                deep  = dto.get("deepSleepSeconds",  0) or 0
                rem   = dto.get("remSleepSeconds",   0) or 0
                if total > 3600:  # לפחות שעה — יום שהייתה שינה
                    hrs = total / 3600
                    dp  = round(deep / total * 100) if total else 0
                    rp  = round(rem  / total * 100) if total else 0
                    sleep_hours.append(hrs)
                    deep_pcts.append(dp)
                    rem_pcts.append(rp)
                    if hrs < 6 or dp < 13:
                        bad_sleep_days += 1
        except Exception:
            pass
        try:
            bb_data = api.get_body_battery(d_iso)
            for entry in (bb_data or []):
                if entry.get("date") == d_iso:
                    vals = entry.get("bodyBatteryValuesArray", [])
                    if vals:
                        bbs.append(vals[-1][1])
                    break
        except Exception:
            pass
        try:
            rhr = api.get_rhr_day(d_iso)
            val = ((rhr or {}).get("allMetrics", {})
                   .get("metricsMap", {})
                   .get("WELLNESS_RESTING_HEART_RATE", [{}])[0]
                   .get("value"))
            if val:
                rhrs.append(float(val))
        except Exception:
            pass
        try:
            stress = api.get_stress_data(d_iso)
            avg_s = (stress or {}).get("avgStressLevel")
            if avg_s and avg_s > 0:
                stresses.append(avg_s)
        except Exception:
            pass

    def avg(lst): return round(sum(lst)/len(lst), 1) if lst else None
    def iavg(lst): return round(sum(lst)/len(lst)) if lst else None

    return {
        "sleep_hours":   avg(sleep_hours),
        "deep_pct":      iavg(deep_pcts),
        "rem_pct":       iavg(rem_pcts),
        "body_battery":  iavg(bbs),
        "rhr":           iavg(rhrs),
        "avg_stress":    iavg(stresses),
        "bad_sleep_days": bad_sleep_days,
        "days_tracked":  len(sleep_hours),
    }


# ===== RESEARCH + AI =====

def research_sup_tips(curr, ytd_avg, ytd_curr, ytd_prev, month_name):
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
        lines = [f"כולל: מהירות {t['avg_speed']}קמ\"ש | דופק {t['avg_hr']}BPM | DPS {t['dps']}מ' | SPM {t['spm']} | יעילות {t['eff']}"]
        for tp in TYPE_ORDER:
            s = a["by_type"].get(tp)
            if s:
                lines.append(
                    f"  {tp}: מהירות {s['avg_speed']}קמ\"ש | "
                    f"דופק {s['avg_hr']}BPM | DPS {s['dps']}מ' | "
                    f"SPM {s['spm']} | יעילות {s['eff']}"
                )
        return "\n".join(lines)

    prompt = f"""אתה מאמן SUP מקצועי. לפניך נתוני אימוני SUP של ספורטאי חובב מנוסה.

=== {month_name} ===
{fmt(curr)}

=== ממוצע חודשי YTD (ינואר–חודש קודם) ===
{fmt(ytd_avg)}

=== שנה נוכחית מצטבר (YTD) ===
{fmt(ytd_curr)}

=== שנה קודמת (2025 מלא) ===
{fmt(ytd_prev)}

=== מחקר מאתרי SUP מקצועיים ===
{research_text[:4000] if research_text else "לא זמין"}

כתוב ניתוח בעברית, קצר ומעשי, בגוף שני. **אל תדון בכמות אימונים — התמקד אך ורק בביצועים טכניים.**

1. **ביצועים {month_name}** — מה קורה עם המהירות, DPS, SPM ויעילות? מה הכיוון מאז 2025?

2. **ניתוח טכני מעמיק לפי סוג אימון:**
   - האם ה-DPS (מרחק למשיכה) גדל/קטן? מה זה אומר על טכניקת החתירה?
   - האם ה-SPM (קצב משיכות) מתאים לסוג האימון?
   - Pa:HR (Aerobic Decoupling) — האם הלב מתאושש טוב לאורך אימון? <5%=מצוין, >9%=עומס יתר
   - עקביות קצב (Pace CV) — האם הקצב אחיד? <4%=מצוין ב-SUP
   - מה מחקר SUP מקצועי אומר על ערכים אלה לספורטאי תחרותי?

3. **3-4 המלצות ספציפיות לשיפור טכני לחודש הבא:**
   - כל המלצה עם יעד מספרי (למשל: "שאף ל-DPS מעל 3.2 בטמפו", "Pa:HR <6% באירובי ארוך")
   - מבוסס על הנתונים + מחקר SUP מקצועי
   - לא להזכיר כמות אימונים — רק איך לשפר

4. **יעד אחד מדיד לחודש הבא** — מספר ספציפי (DPS / Pa:HR / Pace CV / מהירות)

אל תחזור על הנתונים הגולמיים — נתח, השווה לסטנדרטים מקצועיים, והמלץ."""

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

def wellness_kpi(val, label, unit="", higher_better=True, thresholds=None):
    """Single KPI card with color coding."""
    if val is None:
        color = "rgba(230,238,250,0.3)"
        display = "—"
    else:
        display = f"{val}{unit}"
        if thresholds:
            good, ok = thresholds
            if higher_better:
                color = "#4CAF50" if val >= good else ("#ffa726" if val >= ok else "#f44336")
            else:
                color = "#4CAF50" if val <= good else ("#ffa726" if val <= ok else "#f44336")
        else:
            color = "#00D4FF"
    return f"""<div style="flex:1;min-width:110px;background:rgba(255,255,255,0.04);border-radius:12px;
padding:14px 10px;text-align:center;border:1px solid rgba(255,255,255,0.08)">
<div style="font-size:1.45em;font-weight:700;color:{color}">{display}</div>
<div style="font-size:0.75em;color:rgba(230,238,250,0.45);margin-top:4px">{label}</div>
</div>"""


def wellness_compare_row(label, curr_val, prev_val, unit="", higher_better=True):
    if curr_val is None:
        return ""
    arrow = pct_arrow(curr_val, prev_val, higher_better) if prev_val else ""
    return f"""<tr>
      <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);color:rgba(230,238,250,0.7)">{label}</td>
      <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);text-align:center;color:rgba(230,238,250,0.4)">{f"{prev_val}{unit}" if prev_val else "—"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);text-align:center;font-weight:600">{curr_val}{unit} {arrow}</td>
    </tr>"""


def build_wellness_html(w_curr: dict, w_prev: dict, month_name: str, prev_month_name: str) -> str:
    if not w_curr:
        return ""

    bad = w_curr.get("bad_sleep_days", 0)
    bad_color = "#4CAF50" if bad == 0 else ("#ffa726" if bad <= 3 else "#f44336")
    bad_text  = "ללא ימי שינה ירודה ✓" if bad == 0 else f'<span style="color:{bad_color}">{bad} ימי שינה ירודה (&lt;6h או עמוקה&lt;13%)</span>'

    return f"""
  <div style="background:rgba(255,255,255,0.03);border-radius:12px;margin-bottom:18px;
  overflow:hidden;border:1px solid rgba(255,255,255,0.07)">
    <div style="padding:12px 16px;background:rgba(0,100,60,0.4);font-weight:700;font-size:0.92em;border-radius:8px 8px 0 0">
      🛌 בריאות והתאוששות — {month_name}
    </div>
    <div style="padding:16px">
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
        {wellness_kpi(w_curr.get('sleep_hours'), 'שינה ממוצעת', 'h', True, (7, 6))}
        {wellness_kpi(w_curr.get('deep_pct'), 'שינה עמוקה', '%', True, (20, 13))}
        {wellness_kpi(w_curr.get('rem_pct'), 'REM', '%', True, (20, 15))}
        {wellness_kpi(w_curr.get('body_battery'), 'Body Battery', '', True, (70, 50))}
        {wellness_kpi(w_curr.get('rhr'), 'דופק מנוחה', 'bpm', False, (52, 60))}
        {wellness_kpi(w_curr.get('avg_stress'), 'מתח ממוצע', '', False, (25, 40))}
      </div>
      <p style="font-size:0.83em;color:rgba(230,238,250,0.5);margin:0 0 12px">{bad_text}</p>
      <table style="width:100%;border-collapse:collapse;font-size:0.85em">
        <thead><tr>
          <th style="padding:8px 12px;text-align:right;color:rgba(230,238,250,0.4);font-weight:400">מדד</th>
          <th style="padding:8px 12px;text-align:center;color:rgba(230,238,250,0.4);font-weight:400">{prev_month_name}</th>
          <th style="padding:8px 12px;text-align:center;color:rgba(230,238,250,0.4);font-weight:400">{month_name}</th>
        </tr></thead>
        <tbody>
          {wellness_compare_row('שינה ממוצעת', w_curr.get('sleep_hours'), (w_prev or {}).get('sleep_hours'), 'h')}
          {wellness_compare_row('שינה עמוקה', w_curr.get('deep_pct'), (w_prev or {}).get('deep_pct'), '%')}
          {wellness_compare_row('REM', w_curr.get('rem_pct'), (w_prev or {}).get('rem_pct'), '%')}
          {wellness_compare_row('Body Battery', w_curr.get('body_battery'), (w_prev or {}).get('body_battery'), '')}
          {wellness_compare_row('דופק מנוחה', w_curr.get('rhr'), (w_prev or {}).get('rhr'), 'bpm', False)}
          {wellness_compare_row('מתח ממוצע', w_curr.get('avg_stress'), (w_prev or {}).get('avg_stress'), '', False)}
        </tbody>
      </table>
    </div>
  </div>"""


def build_technical_html(tech_curr: dict, tech_prev: dict, month_name: str, prev_month_name: str) -> str:
    if not tech_curr or tech_curr.get('n_analyzed', 0) == 0:
        return ""

    z_colors = {1:'#37474f', 2:'#1565c0', 3:'#2e7d32', 4:'#e65100', 5:'#b71c1c'}
    z_names  = {1:'Z1', 2:'Z2 אירובי', 3:'Z3 סף', 4:'Z4 לקטי', 5:'Z5 אנאירובי'}

    # ── התפלגות אזורי דופק חודשית ──
    oz      = tech_curr.get('overall_zones', {})
    oz_prev = (tech_prev or {}).get('overall_zones', {})
    zone_bars = ""
    for z in range(1, 6):
        pct = oz.get(z, 0)
        if pct == 0: continue
        pp  = oz_prev.get(z)
        cmp_txt = f'← {pp}%' if pp is not None else ''
        cmp_color = "#4CAF50" if (pp and pct > pp and z == 2) or (pp and pct < pp and z >= 4) else "rgba(230,238,250,0.3)"
        zone_bars += (
            f'<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">'
            f'<div style="width:80px;font-size:0.78em;color:{z_colors[z]};font-weight:600">{z_names[z]}</div>'
            f'<div style="flex:1;background:rgba(255,255,255,0.05);border-radius:4px;height:20px;overflow:hidden">'
            f'<div style="width:{min(pct,100)}%;height:100%;background:{z_colors[z]};display:flex;align-items:center;padding:0 8px">'
            f'<span style="font-size:0.76em;color:white;font-weight:700">{pct}%</span></div></div>'
            f'<div style="font-size:0.74em;color:{cmp_color};width:55px;text-align:right">{cmp_txt}</div>'
            f'</div>'
        )

    # SUP zone targets: אירובי Z2≥70%, טמפו Z3+Z4≥60%, ספרינטים Z4+Z5≥50%
    z2_total = oz.get(2, 0); z34_total = oz.get(3, 0) + oz.get(4, 0)
    if z2_total >= 70:
        zone_verdict = f"✓ {z2_total}% אימון ב-Z2 — בסיס אירובי נבנה נכון"
    elif z2_total >= 55:
        zone_verdict = f"⚡ {z2_total}% Z2 — קרוב ליעד, שקול להוסיף אימוני אירובי"
    else:
        zone_verdict = f"⚠️ Z2 רק {z2_total}% מנפח האימון — עומס גבוה מדי, DPS ייפגע"

    # ── טבלה טכנית לפי סוג ──
    hs = "padding:7px 10px;text-align:center;color:rgba(230,238,250,0.4);font-weight:400;font-size:0.8em"
    type_rows = ""
    for t in TYPE_ORDER:
        s = tech_curr.get('by_type', {}).get(t)
        p = (tech_prev or {}).get('by_type', {}).get(t)
        if not s or s.get('n_analyzed', 0) == 0: continue

        def _cell(val, prev_val, low_good=False, thresholds=(5, 9)):
            if val is None: return '<td style="padding:8px 10px;text-align:center;color:rgba(230,238,250,0.25)">—</td>'
            g, ok = thresholds
            if low_good:
                color = "#4CAF50" if val <= g else ("#ffa726" if val <= ok else "#f44336")
            else:
                color = "#4CAF50" if val >= g else ("#ffa726" if val >= ok else "#f44336")
            arr = pct_arrow(val, prev_val, not low_good) if prev_val is not None else ""
            return f'<td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.05);text-align:center"><span style="color:{color};font-weight:600">{val}%</span>{arr}</td>'

        pa  = s.get('pa_hr');   pa_prev  = (p or {}).get('pa_hr')
        cv  = s.get('pace_cv'); cv_prev  = (p or {}).get('pace_cv')
        dcv = s.get('dps_cv');  dcv_prev = (p or {}).get('dps_cv')
        z2  = s.get('avg_z2');  z2_prev  = (p or {}).get('avg_z2')

        z2_target = 70 if t == 'אירובי' else (75 if t == 'אירובי ארוך' else 35)
        z2_ok_thr = (z2_target, z2_target * 0.75)

        icon = TYPE_ICONS.get(t, "")
        pa_cell  = _cell(pa,  pa_prev,  True,  (5, 9))   if t in ('אירובי','אירובי ארוך') else '<td style="padding:8px 10px;text-align:center;color:rgba(230,238,250,0.2)">—</td>'
        z2_cell  = _cell(z2,  z2_prev,  False, z2_ok_thr)
        type_rows += (
            f'<tr>'
            f'<td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.05)">{icon} {t}</td>'
            f'{pa_cell}'
            f'{_cell(cv,  cv_prev,  True, (4, 7))}'
            f'{_cell(dcv, dcv_prev, True, (5, 9))}'
            f'{z2_cell}'
            f'</tr>'
        )

    table_html = ""
    if type_rows:
        table_html = f"""<table style="width:100%;border-collapse:collapse;font-size:0.85em;margin-top:14px">
          <thead><tr>
            <th style="{hs};text-align:right">סוג</th>
            <th style="{hs}">Pa:HR<br><span style="font-size:0.8em;opacity:0.6">&lt;5%=✓</span></th>
            <th style="{hs}">עקביות קצב<br><span style="font-size:0.8em;opacity:0.6">&lt;4%=✓</span></th>
            <th style="{hs}">עקביות DPS<br><span style="font-size:0.8em;opacity:0.6">&lt;5%=✓</span></th>
            <th style="{hs}">Z2 ממוצע</th>
          </tr></thead>
          <tbody>{type_rows}</tbody>
        </table>"""

    prev_note = f' | {prev_month_name} ← השוואה' if tech_prev and tech_prev.get('n_analyzed', 0) > 0 else ''

    return f"""
  <div style="background:rgba(255,255,255,0.03);border-radius:12px;margin-bottom:18px;
  overflow:hidden;border:1px solid rgba(255,255,255,0.07)">
    <div style="padding:12px 16px;background:rgba(0,80,150,0.45);font-weight:700;font-size:0.92em;border-radius:8px 8px 0 0">
      🔬 ניתוח טכני — {month_name}{prev_note}
    </div>
    <div style="padding:16px">
      <div style="font-size:0.8em;color:rgba(230,238,250,0.4);margin-bottom:8px">התפלגות אזורי דופק — ממוצע {tech_curr['n_analyzed']} אימונים</div>
      {zone_bars}
      <div style="font-size:0.83em;color:rgba(230,238,250,0.6);margin:8px 0 0;padding:8px 12px;
      background:rgba(255,255,255,0.04);border-radius:6px">{zone_verdict}</div>
      {table_html}
    </div>
  </div>"""


def build_html(month_name, athlete_name, curr, ytd_avg, ytd_curr, ytd_prev, recommendations, ytd_months,
               wellness_curr=None, wellness_prev=None, prev_month_name="",
               tech_curr=None, tech_prev=None):
    t  = (curr    or {}).get("total") or {}
    pt = (ytd_avg or {}).get("total") or {}
    yt = (ytd_curr or {}).get("total") or {}
    yp = (ytd_prev or {}).get("total") or {}
    avg_label = f"ממוצע חודשי {ytd_months}M"

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
    <h1 style="margin:0;font-size:1.4em;color:#00D4FF">דו"ח SUP חודשי — {athlete_name}</h1>
    <p style="margin:5px 0 0;color:rgba(230,238,250,0.5);font-size:0.9em">{month_name}</p>
  </div>

  <!-- KPIs -->
  <div style="display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap">
    {kpi_card(t.get('n','—'), 'אימונים', f'ממוצע שנה: {pt.get("n","—")}')}
    {kpi_card(f"{t.get('dist','—')}ק\"מ", 'מרחק', f'ממוצע שנה: {pt.get("dist","—")}ק"מ')}
    {kpi_card(f"{t.get('avg_speed','—')}קמ\"ש", 'מהירות ממוצעת', f'ממוצע שנה: {pt.get("avg_speed","—")}')}
    {kpi_card(t.get('eff','—'), 'יעילות', f'ממוצע שנה: {pt.get("eff","—")}')}
  </div>

  <!-- פירוט חודש + השוואה לממוצע YTD -->
  <div style="background:rgba(255,255,255,0.03);border-radius:12px;margin-bottom:18px;
  overflow:hidden;border:1px solid rgba(255,255,255,0.07)">
    {section_header(f'📊 {month_name} — פירוט לפי סוג (מול {avg_label} 2026)')}
    {type_table(curr, ytd_avg, month_name, avg_label)}
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

  <!-- Wellness -->
  {build_wellness_html(wellness_curr, wellness_prev, month_name, prev_month_name)}

  <!-- ניתוח טכני -->
  {build_technical_html(tech_curr, tech_prev, month_name, prev_month_name)}

  <!-- המלצות -->
  <div style="background:rgba(0,212,255,0.05);border-radius:12px;padding:18px;
  border:1px solid rgba(0,212,255,0.18);margin-bottom:18px">
    <div style="font-weight:700;font-size:0.95em;margin-bottom:12px;color:#00D4FF">💡 ניתוח והמלצות לחודש הבא</div>
    {recs_html}
  </div>

  <p style="text-align:center;color:rgba(230,238,250,0.25);font-size:0.75em;margin-top:16px">
    SUP Training · דו"ח חודשי אוטומטי · maximmaxster.github.io/sup-challenge
  </p>
</div>
</body></html>"""

def send_report(html, month_name, to_email):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f'🏄 דו"ח SUP — {month_name}'
    msg["From"]    = GMAIL_USER
    msg["To"]      = to_email
    msg.attach(MIMEText(html, "html", "utf-8"))
    with smtplib.SMTP("smtp.gmail.com", 587) as s:
        s.starttls()
        s.login(GMAIL_USER, GMAIL_PASSWORD)
        s.sendmail(GMAIL_USER, to_email, msg.as_string())
    print(f"  ✓ נשלח ל-{to_email}")

# ===== MAIN =====

def run_for_athlete(athlete, ry, rm, month_name):
    print(f"\n--- {athlete['name']} ---")
    workouts = load_workouts(athlete["json"])

    ws_curr = workouts_for_month(workouts, ry, rm)
    if not ws_curr:
        print(f"  ⚠ אין אימונים ל-{month_name}"); return

    ws_ytd_curr = [w for w in workouts
                   if w.get("distance", 0) > 0
                   and parse_dmy(w["date"])
                   and parse_dmy(w["date"]).year == ry
                   and parse_dmy(w["date"]).month <= rm]

    ws_ytd_before = [w for w in workouts
                     if w.get("distance", 0) > 0
                     and parse_dmy(w["date"])
                     and parse_dmy(w["date"]).year == ry
                     and parse_dmy(w["date"]).month < rm]
    ytd_months = rm - 1

    prev_full_year = ry - 1
    ws_ytd_prev = workouts_for_year(workouts, prev_full_year)

    curr       = analyze(ws_curr)
    ytd_before = analyze(ws_ytd_before)
    ytd_avg    = monthly_avg(ytd_before, ytd_months) if ytd_months > 0 else None
    ytd_curr   = analyze(ws_ytd_curr)
    ytd_prev   = analyze(ws_ytd_prev)

    print(f"  חודש נוכחי: {len(ws_curr)} אימונים, {curr['total']['dist']}ק\"מ")
    print(f"  YTD {ry} ({ytd_months} חודשים קודמים): {len(ws_ytd_before)} אימונים")

    # Wellness — Garmin data for current + previous month
    api = connect_garmin_for_report(athlete)
    wellness_curr = fetch_monthly_wellness(api, ry, rm)
    prev_m, prev_y = (rm - 1, ry) if rm > 1 else (12, ry - 1)
    wellness_prev  = fetch_monthly_wellness(api, prev_y, prev_m) if api else {}
    prev_month_name = f"{HEB_MONTHS[prev_m-1]} {prev_y}"
    if wellness_curr:
        print(f"  Wellness: שינה={wellness_curr.get('sleep_hours')}h BB={wellness_curr.get('body_battery')} RHR={wellness_curr.get('rhr')}")

    # ניתוח טכני — מצבר מדדים מה-JSON (pa_hr, pace_cv, dps_cv, hr_zones)
    ws_prev_month = workouts_for_month(workouts, prev_y, prev_m)
    tech_curr = analyze_technical(ws_curr)
    tech_prev = analyze_technical(ws_prev_month)
    if tech_curr.get('n_analyzed', 0) > 0:
        print(f"  ניתוח טכני: {tech_curr['n_analyzed']} אימונים עם נתוני lap | Z2={tech_curr.get('overall_zones',{}).get(2,0)}%")

    print(f"  מחקר + המלצות מ-Claude...")
    recommendations = research_sup_tips(curr, ytd_avg, ytd_curr, ytd_prev, month_name)
    html = build_html(month_name, athlete["name"], curr, ytd_avg, ytd_curr, ytd_prev,
                      recommendations, ytd_months,
                      wellness_curr=wellness_curr, wellness_prev=wellness_prev,
                      prev_month_name=prev_month_name,
                      tech_curr=tech_curr, tech_prev=tech_prev)
    send_report(html, month_name, athlete["email"])


def main():
    today = date.today()
    if today.month == 1:
        ry, rm = today.year - 1, 12
    else:
        ry, rm = today.year, today.month - 1

    month_name = f"{HEB_MONTHS[rm-1]} {ry}"
    print(f"{'='*52}\nSUP Monthly Report — {month_name}\n{'='*52}")

    for athlete in ATHLETES:
        run_for_athlete(athlete, ry, rm, month_name)

    print(f"\n✓ דו\"ח חודשי הושלם!")

if __name__ == "__main__":
    main()
