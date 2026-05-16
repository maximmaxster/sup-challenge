"""
garmin_sync.py — SUP Challenge Garmin Sync
מתחבר לשני חשבונות Garmin Connect, מסנן SUP, שומר JSON + git push.
פורמט זהה לקובץ האקסל ניתוח_אימוני_SUP.
"""

import os
import sys
import io
import json
import smtplib
import subprocess
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

# Fix Windows console encoding for Hebrew/emoji output
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from dotenv import load_dotenv

try:
    import garminconnect
except ImportError:
    print("מתקין garminconnect...")
    subprocess.run([sys.executable, "-m", "pip", "install", "garminconnect", "python-dotenv"], check=True)
    import garminconnect

load_dotenv()

# ===== EMAIL CONFIG =====
GMAIL_USER     = "maxim.maxster@gmail.com"
GMAIL_PASSWORD = "wueohtjazghiiqwq"

# מייל לכל ספורטאי — מקסים כבר מקבל מה-tracker, כאן רק ויקטור
ATHLETE_EMAILS = {
    "ויקטור מוראטוב": "Victormuratov@gmail.com",
}

DAYS_HEB = {0:"שני",1:"שלישי",2:"רביעי",3:"חמישי",4:"שישי",5:"שבת",6:"ראשון"}

# ===== CONFIG =====
ATHLETES = [
    {
        "name": os.getenv("ATHLETE1_NAME", "מקסים רפופורט"),
        "email": os.getenv("GARMIN_EMAIL_1"),
        "password": os.getenv("GARMIN_PASSWORD_1"),
        "output": Path("data/athlete1.json"),
        "profile_image": "images/athlete1_profile.jpg",
        "token_dir": Path(".garth_tokens_1"),
        "tempo_z4_sec": 900,   # >15 דקות = טמפו (מקסים)
    },
    {
        "name": os.getenv("ATHLETE2_NAME", "ויקטור מוראטוב"),
        "email": os.getenv("GARMIN_EMAIL_2"),
        "password": os.getenv("GARMIN_PASSWORD_2"),
        "output": Path("data/athlete2.json"),
        "profile_image": "images/athlete2_profile.jpg",
        "token_dir": Path(".garth_tokens_2"),
        "tempo_z4_sec": 1200,  # >20 דקות = טמפו (ויקטור)
    },
]

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
MAX_ACTIVITIES = 300


# ===== HELPERS =====
def seconds_to_hms(sec: int) -> str:
    sec = int(sec or 0)
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def hms_to_sec(t: str) -> int:
    parts = str(t or "0").split(":")
    parts = [int(p) for p in parts]
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    elif len(parts) == 2:
        return parts[0] * 60 + parts[1]
    return int(parts[0])


# ===== GARMIN CONNECTION =====
def connect_garmin(cfg: dict) -> garminconnect.Garmin:
    email = cfg["email"]
    token_dir = cfg["token_dir"]
    print(f"  מתחבר: {email}")

    # Try saved tokens first
    if token_dir.exists():
        try:
            api = garminconnect.Garmin()
            api.login(tokenstore=str(token_dir))
            print("  חיבור מטוקן שמור ✓")
            return api
        except Exception:
            pass

    # Fresh login
    api = garminconnect.Garmin(email, cfg["password"])
    api.login()
    token_dir.mkdir(parents=True, exist_ok=True)
    try:
        api.garth.dump(str(token_dir))
    except Exception:
        pass
    print("  חיבור הצליח ✓")
    return api


# ===== IS SUP? =====
def is_sup(activity: dict) -> bool:
    type_key = activity.get("activityType", {}).get("typeKey", "").lower()
    return "paddleboard" in type_key or "sup" in type_key or "stand_up_paddling" in type_key


# ===== LOCATION =====
def get_location(activity: dict) -> tuple:
    lat = (activity.get("startLatitude")
           or activity.get("beginLatitude")
           or activity.get("summaryDTO", {}).get("startLatitude"))
    if lat is None:
        return "לא ידוע", None
    lat = float(lat)
    return ("ים" if lat > 32.13 else "נחל"), lat


# ===== ZONE TIME =====
def get_zone_time(zones: list, zone_number: int) -> str:
    if not zones:
        return "0:00"
    for z in zones:
        if z.get("zoneNumber") == zone_number:
            return seconds_to_hms(z.get("secsInZone", 0))
    return "0:00"


# ===== WORKOUT TYPE (same logic as Excel tracker) =====
def detect_type(z4_str: str, z5_str: str, avg_hr: int, dist_km: float, dur_sec: int,
                tempo_z4_sec: int = 900) -> str:
    z4_sec = hms_to_sec(z4_str)
    z5_sec = hms_to_sec(z5_str)

    if z5_sec > 30:
        return "ספרינטים"
    if z4_sec > tempo_z4_sec:
        return "טמפו"
    if dist_km > 11:
        return "אירובי ארוך"
    return "אירובי"


# ===== PARSE ACTIVITY =====
def parse_activity(act: dict, zones: list, cfg: dict = None) -> dict:
    if cfg is None:
        cfg = {}
    start_dt = datetime.fromisoformat(act["startTimeLocal"].replace("Z", ""))
    dist_km = round((act.get("distance") or 0) / 1000, 2)
    dur_sec = int(act.get("duration") or 0)

    # speed from distance/time (more accurate than API field)
    speed = round(dist_km / (dur_sec / 3600), 1) if dur_sec else 0
    max_speed_ms = act.get("maxSpeed") or 0
    max_speed = round(max_speed_ms * 3.6, 1) if max_speed_ms else 0

    avg_hr = int(act.get("averageHR") or 0)

    # DPS — avgStrokeDistance comes in cm
    avg_stroke_dist = act.get("avgStrokeDistance") or 0
    if avg_stroke_dist > 10:  # cm
        dps = round(avg_stroke_dist / 100, 2)
    else:
        dps = round(float(avg_stroke_dist), 2)

    # SPM
    strokes = act.get("strokes") or 0
    spm = int(round(strokes / (dur_sec / 60))) if dur_sec and strokes else 0

    # Zone times
    z3 = get_zone_time(zones, 3)
    z4 = get_zone_time(zones, 4)
    z5 = get_zone_time(zones, 5)

    location, lat = get_location(act)
    workout_type = detect_type(z4, z5, avg_hr, dist_km, dur_sec,
                               tempo_z4_sec=cfg.get("tempo_z4_sec", 900))

    return {
        "id": str(act.get("activityId", "")),
        "date": start_dt.strftime("%d.%m.%Y"),
        "type": workout_type,
        "location": location,
        "lat": lat,
        "distance": dist_km,
        "duration": seconds_to_hms(dur_sec),
        "dur_sec": dur_sec,
        "avg_speed": speed,
        "max_speed": max_speed,
        "avg_hr": avg_hr,
        "spm": spm,
        "dps": dps,
        "z3": z3,
        "z4": z4,
        "z5": z5,
    }


# ===== FETCH ATHLETE =====
def fetch_athlete(cfg: dict) -> dict:
    print(f"\n{'='*50}")
    print(f"שולף נתונים: {cfg['name']}")
    api = connect_garmin(cfg)

    activities = api.get_activities(0, MAX_ACTIVITIES)
    sup_list = [a for a in activities if is_sup(a)]
    print(f"  פעילויות כלל: {len(activities)}, SUP: {len(sup_list)}")
    # Sort by date to process in order
    sup_list.sort(key=lambda a: a.get("startTimeLocal", ""), reverse=True)

    workouts = []
    for act in sup_list:
        act_id = act.get("activityId")
        try:
            zones = api.get_activity_hr_in_timezones(act_id)
        except Exception:
            zones = []

        # Try to get extra details (avgStrokeDistance, strokes)
        try:
            detail = api.get_activity(act_id)
            for key in ["avgStrokeDistance", "strokes", "avgStrokeCadence"]:
                if detail.get(key) and not act.get(key):
                    act[key] = detail[key]
        except Exception:
            pass

        try:
            w = parse_activity(act, zones, cfg=cfg)
            workouts.append(w)
            print(f"    ✓ {w['date']}  {w['type']:10s}  {w['distance']}ק\"מ  {w['avg_speed']}קמ\"ש  Z4:{w['z4']}")
        except Exception as e:
            print(f"    ✗ שגיאה {act_id}: {e}")

    # Sort newest first
    workouts.sort(key=lambda w: w["date"].split(".")[::-1], reverse=True)

    return {
        "name": cfg["name"],
        "profile_image": cfg["profile_image"],
        "last_sync": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "workouts": workouts,
    }


# ===== SAVE =====
def save_json(data: dict, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    # Preserve fields that sync doesn't touch (e.g. races, dob, sup_start)
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                existing = json.load(f)
            for key in ("races", "dob", "sup_start", "competitions"):
                if key in existing:
                    data.setdefault(key, existing[key])
        except Exception:
            pass
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  שמור: {path}  ({len(data['workouts'])} אימונים)")


# ===== EMAIL REPORT =====
def get_history_from_json(all_workouts: list, current_w: dict, n: int = 5) -> tuple:
    """
    מחזיר (prev_stats, history_list) — ממוצע + רשימת N אימונים קודמים
    מאותו סוג ומיקום, מהנתונים שנשמרו ב-JSON.
    """
    wtype    = current_w.get("type", "")
    wloc     = current_w.get("location", "")
    cur_date = current_w.get("date", "")

    same = [
        w for w in all_workouts
        if w.get("type") == wtype
        and w.get("location") == wloc
        and w.get("date") != cur_date
        and w.get("distance", 0) > 0
    ]
    same = same[:n]  # already sorted newest-first

    history = [
        {
            "date":     w["date"],
            "distance": w.get("distance", ""),
            "duration": w.get("duration", ""),
            "speed":    w.get("avg_speed", ""),
            "avg_hr":   w.get("avg_hr", ""),
            "dps":      w.get("dps", ""),
        }
        for w in same
    ]

    if not same:
        return None, history

    speeds = [w["avg_speed"] for w in same if w.get("avg_speed")]
    hrs    = [w["avg_hr"]    for w in same if w.get("avg_hr")]
    dpss   = [w["dps"]       for w in same if w.get("dps")]

    oldest = same[-1]["date"]
    newest = same[0]["date"]
    label  = f"{oldest[:5]} – {newest[:5]}" if len(same) > 1 else newest[:5]

    prev_stats = {
        "label": label,
        "count": len(same),
        "speed": round(sum(speeds)/len(speeds), 1) if speeds else None,
        "hr":    round(sum(hrs)/len(hrs))          if hrs    else None,
        "dps":   round(sum(dpss)/len(dpss), 2)     if dpss   else None,
    }
    return prev_stats, history


def build_email_html(w: dict, athlete_name: str,
                     prev_stats: dict = None, history: list = None) -> str:
    """צור דוח HTML לאימון — פורמט זהה לדוח של מקסים"""
    try:
        d = datetime.strptime(w["date"], "%d.%m.%Y")
        day_name = DAYS_HEB[d.weekday()]
        date_display = f"יום {day_name}, {w['date']}"
    except Exception:
        date_display = w.get("date", "")

    def hms_sec(t):
        if not t or t in ("0:00", ""):
            return 0
        parts = [int(x) for x in str(t).split(":")]
        if len(parts) == 3: return parts[0]*3600+parts[1]*60+parts[2]
        return parts[0]*60+parts[1]

    total = w.get("dur_sec", 1) or 1
    z3s, z4s, z5s = hms_sec(w.get("z3","")), hms_sec(w.get("z4","")), hms_sec(w.get("z5",""))
    z2s = max(0, total - z3s - z4s - z5s - 60)
    z1s = max(0, total - z2s - z3s - z4s - z5s)
    mx  = max(z1s, z2s, z3s, z4s, z5s, 1)
    px  = lambda s: max(6, round(s/mx*340)) if s else 0
    pct = lambda s: f"{round(s/total*100)}%" if total and round(s/total*100) >= 4 else ""

    type_colors = {
        "אירובי":      ("#1b5e20","#2e7d32","#a5d6a7"),
        "אירובי ארוך": ("#004d40","#00695c","#80cbc4"),
        "טמפו":        ("#e65100","#ef6c00","#ffcc80"),
        "ספרינטים":    ("#b71c1c","#c62828","#ef9a9a"),
    }
    bg1, bg2, tc = type_colors.get(w.get("type","אירובי"), ("#1b5e20","#2e7d32","#a5d6a7"))

    # ── השוואה ──
    def delta_html(curr, prev_val, reverse=False):
        if prev_val is None or curr is None:
            return ""
        try:
            diff = float(curr) - float(prev_val)
            pct_d = abs(diff) / float(prev_val) * 100 if prev_val else 0
        except Exception:
            return ""
        if abs(diff) < 0.05:
            return '<div class="delta" style="color:#ffa726">→ ללא שינוי</div>'
        good = (diff > 0) != reverse
        color = "#66bb6a" if good else "#ef5350"
        arrow = "↑" if diff > 0 else "↓"
        sign  = "+" if diff > 0 else ""
        return f'<div class="delta" style="color:{color}">{arrow} {sign}{pct_d:.1f}%</div>'

    if prev_stats:
        compare_html = f"""
  <div class="section">
    <div class="section-title">📊 ממוצע {prev_stats['count']} אימונים אחרונים — {w.get('type','')} {w.get('location','')} ({prev_stats['label']})</div>
    <div class="cmp-grid">
      <div class="cmp-card">
        <div class="clbl">מהירות (קמ"ש)</div>
        <div class="curr">{w.get('avg_speed','')}</div>
        <div class="prev">ממוצע: {prev_stats['speed']}</div>
        {delta_html(w.get('avg_speed'), prev_stats['speed'])}
      </div>
      <div class="cmp-card">
        <div class="clbl">דופק ממוצע</div>
        <div class="curr">{w.get('avg_hr','')}</div>
        <div class="prev">ממוצע: {prev_stats['hr'] or '—'}</div>
        {delta_html(w.get('avg_hr'), prev_stats['hr'], reverse=True)}
      </div>
      <div class="cmp-card">
        <div class="clbl">DPS (מטר)</div>
        <div class="curr">{w.get('dps','')}</div>
        <div class="prev">ממוצע: {prev_stats['dps'] or '—'}</div>
        {delta_html(w.get('dps'), prev_stats['dps'])}
      </div>
    </div>
  </div>"""
    else:
        compare_html = """
  <div class="section" style="text-align:center;color:#546e7a;padding:14px">
    אין נתוני השוואה עדיין עבור סוג ומיקום זה
  </div>"""

    # ── היסטוריה ──
    hist_rows = ""
    if history:
        for i, h in enumerate(history):
            cls = 'class="hl"' if i == 0 else ""
            tag = '<span class="today-tag">← היום</span>' if i == 0 else ""
            hist_rows += f"""
        <tr {cls}>
          <td>{h['date']}{tag}</td><td>{h.get('distance','')}</td>
          <td>{h.get('duration','')}</td><td>{h.get('speed','')}</td>
          <td>{h.get('avg_hr','')}</td><td>{h.get('dps','')}</td>
        </tr>"""

    hist_section = ""
    if hist_rows:
        hist_section = f"""
  <div class="section">
    <div class="section-title">📋 אימונים אחרונים — {w.get('type','')} {w.get('location','')}</div>
    <table>
      <thead><tr><th>תאריך</th><th>מרחק</th><th>זמן</th><th>מהירות</th><th>דופק</th><th>DPS</th></tr></thead>
      <tbody>{hist_rows}</tbody>
    </table>
  </div>"""

    return f"""<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8">
<title>SUP | {w.get('date','')} — {w.get('type','')} {w.get('location','')}</title>
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:'Segoe UI',Arial,sans-serif;background:#0f1923;color:#e0e0e0;padding:20px;direction:rtl}}
.wrap{{max-width:640px;margin:0 auto}}
.header{{background:linear-gradient(135deg,#1a3a5c,#0d2137);border-radius:16px;padding:22px 26px;margin-bottom:14px;border:1px solid #1e4d7a;display:flex;align-items:center;gap:14px}}
.header-icon{{font-size:44px}}
.header-text h1{{font-size:20px;color:#4fc3f7;font-weight:700}}
.header-text .sub{{font-size:12px;color:#78909c;margin-top:4px}}
.header-text .dt{{font-size:13px;color:#90caf9;margin-top:5px}}
.banner{{background:linear-gradient(135deg,{bg1},{bg2});border-radius:10px;padding:12px 18px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;border:1px solid {bg2}}}
.banner .tn{{font-size:18px;font-weight:700;color:{tc}}}
.banner .tl{{font-size:12px;color:{tc};opacity:.8;margin-top:3px}}
.banner .ti{{font-size:30px}}
.cards{{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}}
.card{{background:#1a2a3a;border-radius:12px;padding:14px;text-align:center;border:1px solid #1e3a55}}
.card .lbl{{font-size:10px;color:#78909c;margin-bottom:5px;text-transform:uppercase}}
.card .val{{font-size:24px;font-weight:700;color:#4fc3f7}}
.card .unt{{font-size:11px;color:#546e7a;margin-top:2px}}
.chips{{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}}
.chip{{display:inline-flex;align-items:center;gap:5px;background:#0d2137;border:1px solid #1e4d7a;border-radius:8px;padding:7px 12px;font-size:12px;color:#90caf9}}
.section{{background:#1a2a3a;border-radius:12px;padding:18px;margin-bottom:14px;border:1px solid #1e3a55}}
.section-title{{font-size:13px;color:#78909c;margin-bottom:12px;font-weight:600;text-transform:uppercase}}
.zone-row{{display:flex;align-items:center;margin-bottom:9px;gap:9px}}
.zl{{width:28px;font-size:12px;color:#90a4ae;text-align:right;flex-shrink:0;font-weight:600}}
.zbar-bg{{width:340px;background:#0d1e2e;border-radius:5px;height:18px;overflow:hidden;flex-shrink:0}}
.zbar{{height:18px;border-radius:5px;display:inline-flex;align-items:center;justify-content:flex-end;padding:0 6px;font-size:10px;color:white;font-weight:700;min-width:5px}}
.zt{{width:52px;font-size:11px;color:#90caf9;text-align:left;flex-shrink:0}}
.cmp-grid{{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}}
.cmp-card{{background:#0d1e2e;border-radius:10px;padding:14px 12px;text-align:center}}
.cmp-card .clbl{{font-size:11px;color:#546e7a;margin-bottom:8px}}
.cmp-card .curr{{font-size:22px;font-weight:700;color:#e0e0e0}}
.cmp-card .prev{{font-size:11px;color:#546e7a;margin-top:4px}}
.cmp-card .delta{{font-size:13px;font-weight:600;margin-top:6px}}
table{{width:100%;border-collapse:collapse;font-size:13px}}
thead th{{background:#0d1e2e;color:#546e7a;padding:9px 7px;font-weight:600;font-size:11px;text-align:center}}
tbody tr{{border-bottom:1px solid #1a2a3a}}
tbody td{{padding:9px 7px;color:#90a4ae;text-align:center}}
tr.hl td{{color:#4fc3f7!important;font-weight:600}}
.today-tag{{font-size:10px;color:#4fc3f7;margin-right:4px}}
.footer{{text-align:center;margin-top:14px;font-size:10px;color:#37474f}}
</style></head>
<body><div class="wrap">
  <div class="header">
    <div class="header-icon">🏄</div>
    <div class="header-text">
      <h1>סיכום אימון SUP — {athlete_name}</h1>
      <div class="dt">{date_display}</div>
      <div class="sub">עודכן אוטומטית מ-Garmin Connect</div>
    </div>
  </div>
  <div class="banner">
    <div><div class="tn">{w.get('type','')}</div><div class="tl">📍 {w.get('location','')}</div></div>
    <div class="ti">🌊</div>
  </div>
  <div class="cards">
    <div class="card"><div class="lbl">מרחק</div><div class="val">{w.get('distance','')}</div><div class="unt">ק"מ</div></div>
    <div class="card"><div class="lbl">זמן</div><div class="val">{w.get('duration','')}</div><div class="unt">דקות</div></div>
    <div class="card"><div class="lbl">מהירות</div><div class="val">{w.get('avg_speed','')}</div><div class="unt">קמ"ש</div></div>
  </div>
  <div class="chips">
    <div class="chip">💓 דופק: <strong>{w.get('avg_hr',0)} bpm</strong></div>
    <div class="chip">🚣 SPM: <strong>{w.get('spm',0)}</strong></div>
    <div class="chip">📏 DPS: <strong>{w.get('dps',0)} מ'</strong></div>
  </div>
  <div class="section">
    <div class="section-title">⏱ זמן בזונות דופק</div>
    <div class="zone-row"><div class="zl">Z1</div><div class="zbar-bg"><div class="zbar" style="width:{px(z1s)}px;background:#37474f">{pct(z1s)}</div></div><div class="zt">{z1s//60}:{z1s%60:02d}</div></div>
    <div class="zone-row"><div class="zl">Z2</div><div class="zbar-bg"><div class="zbar" style="width:{px(z2s)}px;background:#1565c0">{pct(z2s)}</div></div><div class="zt">{z2s//60}:{z2s%60:02d}</div></div>
    <div class="zone-row"><div class="zl">Z3</div><div class="zbar-bg"><div class="zbar" style="width:{px(z3s)}px;background:#2e7d32">{pct(z3s)}</div></div><div class="zt">{w.get('z3','0:00')}</div></div>
    <div class="zone-row"><div class="zl">Z4</div><div class="zbar-bg"><div class="zbar" style="width:{px(z4s)}px;background:#e65100">{pct(z4s)}</div></div><div class="zt">{w.get('z4','0:00')}</div></div>
    <div class="zone-row"><div class="zl">Z5</div><div class="zbar-bg"><div class="zbar" style="width:{px(z5s)}px;background:#b71c1c">{pct(z5s)}</div></div><div class="zt">{w.get('z5','0:00')}</div></div>
  </div>
  {compare_html}
  {hist_section}
  <div class="footer">נוצר אוטומטית על ידי SUP Tracker • Garmin Connect • {w.get('date','')}</div>
</div></body></html>"""


def send_workout_email(to_email: str, athlete_name: str, workout: dict,
                       all_workouts: list = None):
    """שלח דוח HTML לאימון ספציפי, עם השוואה והיסטוריה"""
    try:
        prev_stats, history = None, None
        if all_workouts:
            prev_stats, history_prev = get_history_from_json(all_workouts, workout, n=5)
            # history = [האימון הנוכחי] + [4 קודמים]
            current_entry = {
                "date": workout["date"], "distance": workout.get("distance",""),
                "duration": workout.get("duration",""), "speed": workout.get("avg_speed",""),
                "avg_hr": workout.get("avg_hr",""), "dps": workout.get("dps",""),
            }
            history = [current_entry] + history_prev[:4]

        html = build_email_html(workout, athlete_name, prev_stats, history)
        subject = (f"🏄 SUP | {workout.get('date','')} — "
                   f"{workout.get('type','')} {workout.get('location','')} | "
                   f"{workout.get('distance','')} ק\"מ")
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = GMAIL_USER
        msg["To"]      = to_email
        msg.attach(MIMEText(html, "html", "utf-8"))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
            s.login(GMAIL_USER, GMAIL_PASSWORD)
            s.sendmail(GMAIL_USER, to_email, msg.as_string())
        print(f"  [Email] נשלח ל-{to_email} ✓")
    except Exception as e:
        print(f"  [Email] שגיאה: {e}")


def get_latest_saved_date(path: Path) -> str | None:
    """קרא את תאריך האימון האחרון מהקובץ הקיים"""
    try:
        with open(path, "r", encoding="utf-8") as f:
            existing = json.load(f)
        ws = existing.get("workouts", [])
        if ws:
            return ws[0].get("date")  # ממוין newest-first
    except Exception:
        pass
    return None


# ===== GIT PUSH =====
def git_push():
    if not GITHUB_TOKEN:
        print("\nGITHUB_TOKEN לא מוגדר — דולג על push")
        return
    timestamp = datetime.now().strftime("%d/%m/%Y %H:%M")
    cmds = [
        ["git", "add", "data/"],
        ["git", "commit", "-m", f"sync: עדכון SUP — {timestamp}"],
        ["git", "push"],
    ]
    for cmd in cmds:
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            if "nothing to commit" in (r.stdout + r.stderr):
                print("  אין שינויים"); break
            print(f"  שגיאת git: {r.stderr.strip()}")
        else:
            print(f"  {cmd[1]}: OK")


# ===== MAIN =====
def main():
    print("=" * 50)
    print("SUP Challenge — Garmin Sync")
    print(f"זמן: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    print("=" * 50)

    missing = []
    for i, cfg in enumerate(ATHLETES, 1):
        if not cfg["email"]: missing.append(f"GARMIN_EMAIL_{i}")
        if not cfg["password"]: missing.append(f"GARMIN_PASSWORD_{i}")
    if missing:
        print(f"חסרים: {', '.join(missing)} — צור .env מתוך .env.example")
        sys.exit(1)

    ok = True
    for cfg in ATHLETES:
        to_email = ATHLETE_EMAILS.get(cfg["name"])
        try:
            # שמור תאריך אחרון לפני עדכון — לזיהוי אימונים חדשים
            last_date = get_latest_saved_date(cfg["output"])

            data = fetch_athlete(cfg)
            save_json(data, cfg["output"])

            # שלח מייל רק לספורטאים שמוגדרים ב-ATHLETE_EMAILS (ויקטור)
            # מקסים כבר מקבל מייל מ-garmin_sup_tracker.py
            if to_email and data.get("workouts"):
                new_ws = []
                for w in data["workouts"]:
                    if last_date is None or w["date"] > last_date:
                        new_ws.append(w)
                    else:
                        break  # ממוין newest-first
                for w in new_ws:
                    if w.get("distance", 0) > 0:  # דלג על אימונים ריקים
                        print(f"  [Email] אימון חדש — {w['date']} {w['type']}")
                        send_workout_email(to_email, cfg["name"], w,
                                           all_workouts=data.get("workouts", []))

        except Exception as e:
            print(f"  שגיאה: {e}")
            ok = False

    if ok:
        git_push()
        print("\n✓ סנכרון הושלם!")
    else:
        print("\n⚠ סנכרון עם שגיאות")
        sys.exit(1)


if __name__ == "__main__":
    main()
