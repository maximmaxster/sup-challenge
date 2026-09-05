"""
garmin_sync.py — SUP Training Garmin Sync
מתחבר לשני חשבונות Garmin Connect, מסנן SUP, שומר JSON + git push.
פורמט זהה לקובץ האקסל ניתוח_אימוני_SUP.
VERSION = 2026-08-29c
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
GMAIL_USER     = os.getenv("GMAIL_USER", "maxim.maxster@gmail.com")
GMAIL_PASSWORD = os.getenv("GMAIL_PASSWORD", "")

ATHLETE_EMAILS = {
    "מקסים רפופורט": "maxim.maxster@gmail.com",
    "ויקטור מורטוב": "Victormuratov@gmail.com",
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
        # Manual type overrides — date: type (never overwritten by auto-classification)
        "manual_types": {
            "01.07.2026": "ספרינטים",
            "22.06.2026": "ספרינטים",
            "08.08.2026": "ספרינטים",
            "12.08.2026": "ספרינטים",
        },
        # IDs of race activities to exclude from workouts (added to races array manually):
        "race_ids": [
            "23062789812",   # 30.05.2026 ZAZIK race
            "23147784816",   # 06.06.2026 חיפה-עכו 2026
        ],
    },
    {
        "name": os.getenv("ATHLETE2_NAME", "ויקטור מורטוב"),
        "email": os.getenv("GARMIN_EMAIL_2"),
        "password": os.getenv("GARMIN_PASSWORD_2"),
        "output": Path("data/athlete2.json"),
        "profile_image": "images/athlete2_profile.jpg",
        "token_dir": Path(".garth_tokens_2"),
        # Manual type overrides — date: type (never overwritten by auto-classification)
        "manual_types": {
            "01.07.2026": "ספרינטים",
            "22.06.2026": "ספרינטים",
            "08.08.2026": "ספרינטים",
            "12.08.2026": "ספרינטים",
        },
        "tempo_z4_sec": 900,   # >15 דקות = טמפו (זהה למקסים)
        # IDs of race activities to exclude from workouts:
        "race_ids": [
            "23062800478",   # 30.05.2026 ZAZIK race
            "23146775905",   # 06.06.2026 חיפה-עכו 2026
        ],
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
    token_dir.mkdir(parents=True, exist_ok=True)
    print(f"  מתחבר: {email}")

    # login(tokenstore) — uses saved token if exists, fresh login + saves if not
    api = garminconnect.Garmin(email, cfg["password"])
    api.login(tokenstore=str(token_dir))
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


# ===== HR TIMESERIES + SPRINT CYCLE DETECTION =====
def get_hr_timeseries(api, activity_id: int) -> list:
    try:
        details = api.get_activity_details(activity_id, maxChartSize=2000)
        descriptors = details.get("metricDescriptors", [])
        hr_idx = next((d["metricsIndex"] for d in descriptors if d.get("key") == "directHeartRate"), None)
        if hr_idx is None:
            return []
        return [float(p["metrics"][hr_idx]) for p in details.get("activityDetailMetrics", [])
                if hr_idx < len(p.get("metrics", [])) and p["metrics"][hr_idx] is not None]
    except Exception:
        return []

def _smooth(data: list, window: int = 12) -> list:
    arr, kernel = data[:], [1/window]*window
    out = []
    for i in range(len(arr)):
        start = max(0, i - window//2)
        end = min(len(arr), i + window//2 + 1)
        out.append(sum(arr[start:end]) / (end - start))
    return out

def count_sprint_cycles(hr_values: list, min_prominence: int = 15) -> int:
    if len(hr_values) < 40:
        return 0
    s = _smooth(hr_values)
    n = len(s)
    peaks   = [i for i in range(1, n-1) if s[i] > s[i-1] and s[i] >= s[i+1]]
    valleys = [i for i in range(1, n-1) if s[i] < s[i-1] and s[i] <= s[i+1]]
    cycles = 0
    for p in peaks:
        prev_v = [v for v in valleys if v < p]
        next_v = [v for v in valleys if v > p]
        if prev_v and next_v:
            if (s[p] - s[max(prev_v)] >= min_prominence and
                    s[p] - s[min(next_v)] >= min_prominence):
                cycles += 1
    return cycles


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
                tempo_z4_sec: int = 900,
                long_z4_sec: int = None,
                long_min_dist: float = 11,
                long_min_dur: int = 0,
                spm_max: int = 0,
                hr_values: list = None) -> str:
    z4_sec = hms_to_sec(z4_str)
    z5_sec = hms_to_sec(z5_str)

    # ספרינטים — SPM מקסימלי בלבד
    if spm_max >= 85:
        return "ספרינטים"

    # אירובי ארוך: Z4 מתחת לסף ארוך + מרחק ומשך מינימלי
    long_threshold = long_z4_sec if long_z4_sec is not None else tempo_z4_sec
    if (z4_sec < long_threshold
            and dist_km >= long_min_dist
            and dur_sec >= long_min_dur):
        return "אירובי ארוך"

    if z4_sec > tempo_z4_sec:
        return "טמפו"

    if dist_km > 11:
        return "אירובי ארוך"
    return "אירובי"


# ===== PARSE ACTIVITY =====
def parse_activity(act: dict, zones: list, cfg: dict = None, hr_values: list = None,
                   shared_types: dict = None, workout_names: dict = None) -> dict:
    if cfg is None:
        cfg = {}
    if hr_values is None:
        hr_values = []
    if shared_types is None:
        shared_types = {}
    start_dt = datetime.fromisoformat(act["startTimeLocal"].replace("Z", ""))
    dist_km = round((act.get("distance") or 0) / 1000, 2)
    dur_sec = int(act.get("duration") or 0)

    # speed from distance/time (more accurate than API field)
    speed = round(dist_km / (dur_sec / 3600), 1) if dur_sec else 0
    max_speed_ms = act.get("maxSpeed") or 0
    max_speed = round(max_speed_ms * 3.6, 1) if max_speed_ms else 0

    avg_hr = int(act.get("averageHR") or 0)
    max_hr  = int(act.get("maxHR") or 0)

    # DPS — avgStrokeDistance comes in cm
    avg_stroke_dist = act.get("avgStrokeDistance") or 0
    if avg_stroke_dist > 10:  # cm
        dps = round(avg_stroke_dist / 100, 2)
    else:
        dps = round(float(avg_stroke_dist), 2)

    # SPM
    strokes = act.get("strokes") or 0
    spm = int(round(strokes / (dur_sec / 60))) if dur_sec and strokes else 0
    spm_max = int(act.get("maxStrokeCadence") or act.get("maxRunCadence") or act.get("maxCadence") or 0)

    # Zone times
    z3 = get_zone_time(zones, 3)
    z4 = get_zone_time(zones, 4)
    z5 = get_zone_time(zones, 5)

    location, lat = get_location(act)
    date_str = start_dt.strftime("%d.%m.%Y")
    manual = cfg.get("manual_types", {})
    if date_str in manual:
        workout_type = manual[date_str]
    elif date_str in shared_types:
        # מתאמנים ביחד — ירש סיווג מספורטאי אחר באותו תאריך
        workout_type = shared_types[date_str]
    else:
        workout_type = detect_type(z4, z5, avg_hr, dist_km, dur_sec,
                                   tempo_z4_sec=cfg.get("tempo_z4_sec", 900),
                                   long_z4_sec=cfg.get("long_z4_sec"),
                                   long_min_dist=cfg.get("long_min_dist", 11),
                                   long_min_dur=cfg.get("long_min_dur", 0),
                                   spm_max=spm_max,
                                   hr_values=hr_values)

    wid = act.get("workoutId")
    wname = (workout_names or {}).get(wid, "") if wid else ""

    return {
        "id": str(act.get("activityId", "")),
        "date": date_str,
        "start_hour": start_dt.hour,
        "type": workout_type,
        "workout_name": wname,
        "location": location,
        "lat": lat,
        "lon": float(act.get("startLongitude") or act.get("beginLongitude") or
                     act.get("summaryDTO", {}).get("startLongitude") or 35.05),
        "distance": dist_km,
        "duration": seconds_to_hms(dur_sec),
        "dur_sec": dur_sec,
        "avg_speed": speed,
        "max_speed": max_speed,
        "avg_hr": avg_hr,
        "max_hr": max_hr,
        "spm": spm,
        "spm_max": spm_max,
        "dps": dps,
        "z3": z3,
        "z4": z4,
        "z5": z5,
    }


# ===== FETCH ATHLETE =====
def fetch_athlete(cfg: dict, shared_types: dict = None) -> dict:
    print(f"\n{'='*50}")
    print(f"שולף נתונים: {cfg['name']}")
    api = connect_garmin(cfg)

    # build workout name lookup {workoutId: workoutName}
    try:
        wlist = api.get_workouts(0, 100)
        workout_names = {w["workoutId"]: w["workoutName"] for w in wlist if w.get("workoutId")}
    except Exception:
        workout_names = {}

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

        # Try to get extra details (avgStrokeDistance, strokes, SPM max)
        try:
            detail = api.get_activity(act_id)
            for key in ["avgStrokeDistance", "strokes", "avgStrokeCadence",
                        "maxStrokeCadence", "maxRunCadence", "maxCadence"]:
                if detail.get(key) and not act.get(key):
                    act[key] = detail[key]
        except Exception:
            pass

        # HR timeseries for sprint cycle detection
        hr_ts = get_hr_timeseries(api, act_id)

        try:
            w = parse_activity(act, zones, cfg=cfg, hr_values=hr_ts, shared_types=shared_types or {}, workout_names=workout_names)
            workouts.append(w)
            print(f"    ✓ {w['date']}  {w['type']:10s}  {w['distance']}ק\"מ  {w['avg_speed']}קמ\"ש  Z4:{w['z4']}")
        except Exception as e:
            print(f"    ✗ שגיאה {act_id}: {e}")

    # Sort newest first
    workouts.sort(key=lambda w: w["date"].split(".")[::-1], reverse=True)

    # Exclude race activities (they are manually added to the races array)
    race_ids = set(str(x) for x in cfg.get("race_ids", []))
    if race_ids:
        before = len(workouts)
        workouts = [w for w in workouts if w["id"] not in race_ids]
        excluded = before - len(workouts)
        if excluded:
            print(f"  הוסרו {excluded} פעילויות תחרות מהאימונים")

    fitness = compute_fitness_metrics(workouts)
    return {
        "name": cfg["name"],
        "profile_image": cfg["profile_image"],
        "last_sync": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "workouts": workouts,
        "fitness": fitness,
    }, api


# ===== FITNESS METRICS (CTL / ATL / TSB) =====
def compute_fitness_metrics(workouts: list) -> dict:
    """מחשב CTL/ATL/TSB על בסיס Edwards TRIMP (זמן בזונות × מכפיל 1-5)."""
    from datetime import timedelta
    if not workouts:
        return {}

    # TRIMP per date
    def _dur_sec(val) -> float:
        if not val:
            return 0.0
        if isinstance(val, (int, float)):
            return float(val)
        parts = str(val).split(':')
        try:
            if len(parts) == 3:
                return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
            if len(parts) == 2:
                return int(parts[0]) * 60 + int(parts[1])
            return float(parts[0])
        except Exception:
            return 0.0

    def _zone_min(val) -> float:
        """ממיר HH:MM:SS לדקות."""
        sec = _dur_sec(val)
        return sec / 60.0

    trimp_map: dict[str, float] = {}
    for w in workouts:
        date_str = w.get('date', '')
        dur_sec = _dur_sec(w.get('duration'))
        if not date_str or dur_sec <= 0:
            continue

        # Edwards TRIMP: זמן בכל זון (דקות) × מכפיל
        z3_min = _zone_min(w.get('z3', ''))
        z4_min = _zone_min(w.get('z4', ''))
        z5_min = _zone_min(w.get('z5', ''))
        dur_min = dur_sec / 60.0
        z2_min = max(0.0, dur_min - z3_min - z4_min - z5_min - 1.0)
        z1_min = max(0.0, dur_min - z2_min - z3_min - z4_min - z5_min)

        trimp = z1_min*1 + z2_min*2 + z3_min*3 + z4_min*4 + z5_min*5

        # fallback: אם אין נתוני זונות — TRIMP פשוט
        if trimp == 0 and w.get('avg_hr'):
            hr = float(w.get('avg_hr') or 0)
            trimp = hr * (dur_sec / 3600.0)

        if trimp > 0:
            trimp_map[date_str] = trimp_map.get(date_str, 0.0) + trimp

    if not trimp_map:
        return {}

    dates = sorted(trimp_map.keys(), key=lambda d: datetime.strptime(d, '%d.%m.%Y'))
    start = datetime.strptime(dates[0], '%d.%m.%Y')
    today = datetime.now()

    k_ctl = 1 / 42
    k_atl = 1 / 7
    ctl = atl = 0.0
    series = []

    cur = start
    while cur.date() <= today.date():
        d_str = cur.strftime('%d.%m.%Y')
        trimp = trimp_map.get(d_str, 0.0)
        ctl += (trimp - ctl) * k_ctl
        atl += (trimp - atl) * k_atl
        tsb = ctl - atl
        if trimp > 0 or len(series) % 7 == 0 or cur.date() == today.date():
            series.append({'date': d_str, 'ctl': round(ctl, 1), 'atl': round(atl, 1), 'tsb': round(tsb, 1)})
        cur += timedelta(days=1)

    last = series[-1] if series else {}
    return {'series': series, 'current': {'ctl': last.get('ctl', 0), 'atl': last.get('atl', 0), 'tsb': last.get('tsb', 0)}}


# ===== SAVE =====
REQUIRED_STATIC_FIELDS = ("races", "dob", "sup_start", "competitions", "birthdate", "age", "name", "profile_image")

def save_json(data: dict, path: Path, skip_merge: bool = False):
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = None
    # Preserve fields that sync doesn't touch (e.g. races, dob, sup_start)
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8-sig") as f:
                existing = json.load(f)
        except Exception as e:
            # קובץ קיים אבל לא ניתן לקריאה — אסור לדרוס בלי הנתונים הסטטיים שבו
            raise RuntimeError(f"{path}: לא הצליח לקרוא את הקובץ הקיים ({e}) — עוצר לפני דריסה") from e

        for key in REQUIRED_STATIC_FIELDS:
            if existing.get(key):
                data[key] = existing[key]

        # GitHub is the source of truth for races (edited via website UI).
        # If GitHub has more races than local disk, use GitHub's version.
        gh_races = _github_fetch_races(path)
        local_races = data.get("races") or []
        if gh_races and len(gh_races) > len(local_races):
            data["races"] = gh_races
            print(f"  races: GitHub ({len(gh_races)}) > מקומי ({len(local_races)}) — משתמש ב-GitHub")

        # שדה סטטי היה קיים בעבר ונעלם עכשיו → משהו נשבר ב-merge, לא דורסים
        missing = [k for k in REQUIRED_STATIC_FIELDS if existing.get(k) and not data.get(k)]
        if missing:
            raise RuntimeError(f"{path}: שדות קריטיים נעלמו {missing} — עוצר לפני דריסה")

        # מיזוג אימונים: חדשים מגרמין מחליפים/מוסיפים; ישנים שגרמין לא מחזיר נשמרים
        if not skip_merge:
            def _date_sort(w):
                d = w.get("date", "")
                p = d.split(".")
                return f"{p[2]}-{p[1]}-{p[0]}" if len(p) == 3 else d

            existing_workouts = existing.get("workouts", [])
            new_workouts = data.get("workouts", [])

            # activity_id אם קיים — מפתח ראשי; אחרת תאריך+סוג
            def _key(w):
                aid = w.get("activity_id") or w.get("id")
                return aid if aid else f"{w.get('date','')}_{w.get('type','')}"

            new_keys = {_key(w) for w in new_workouts}
            # שמור ישנים שגרמין לא החזיר (לא קיים ב-new_keys)
            old_only = [w for w in existing_workouts if _key(w) not in new_keys]
            merged = new_workouts + old_only
            added = len(merged) - len(existing_workouts)
            merged.sort(key=_date_sort, reverse=True)
            data["workouts"] = merged
            if added > 0:
                print(f"  מוזגו {added} אימונים חדשים (סה\"כ {len(merged)})")
            else:
                print(f"  אין אימונים חדשים (סה\"כ {len(merged)})")

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  שמור: {path}  ({len(data['workouts'])} אימונים)")


# ===== EMAIL REPORT =====
def _similar_conditions(w_curr: dict, w_prev: dict) -> bool:
    """האם שני אימונים התרחשו בתנאי מזג אוויר דומים (רוח ±5, גל ±0.2)."""
    curr_wind = w_curr.get("wind_kmh")
    prev_wind = w_prev.get("wind_kmh")
    if curr_wind is None or prev_wind is None:
        return False
    if abs(curr_wind - prev_wind) > 5:
        return False
    curr_wave = w_curr.get("wave_height_m")
    prev_wave = w_prev.get("wave_height_m")
    if curr_wave is not None and prev_wave is not None:
        if abs(curr_wave - prev_wave) > 0.2:
            return False
    return True


def get_history_from_json(all_workouts: list, current_w: dict, n: int = 5) -> tuple:
    """
    מחזיר (prev_stats, history_list) — ממוצע + רשימת N אימונים קודמים
    מאותו סוג ומיקום. אם יש נתוני מזג אוויר — מוסיף similar_conditions_stats.
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
            "date":        w["date"],
            "distance":    w.get("distance", ""),
            "duration":    w.get("duration", ""),
            "speed":       w.get("avg_speed", ""),
            "avg_hr":      w.get("avg_hr", ""),
            "dps":         w.get("dps", ""),
            "wind_kmh":    w.get("wind_kmh"),
            "wave_height_m": w.get("wave_height_m"),
            "similar_cond": _similar_conditions(current_w, w),
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

    # השוואה לאותו מספר אימון — רק מ-01.06.2026
    PLAN_CUTOFF = "2026-06-01"
    def _after_cutoff(d):
        try:
            p = d.split(".")
            return f"{p[2]}-{p[1]}-{p[0]}" >= PLAN_CUTOFF
        except Exception:
            return False

    wname = current_w.get("workout_name", "")
    if wname and _after_cutoff(cur_date):
        same_plan = [
            w for w in all_workouts
            if w.get("workout_name") == wname
            and w.get("date") != cur_date
            and w.get("distance", 0) > 0
            and _after_cutoff(w.get("date", ""))
        ]
        if same_plan:
            sp_speeds = [w["avg_speed"] for w in same_plan if w.get("avg_speed")]
            sp_hrs    = [w["avg_hr"]    for w in same_plan if w.get("avg_hr")]
            sp_dpss   = [w["dps"]       for w in same_plan if w.get("dps")]
            sp_old = same_plan[-1]["date"]; sp_new = same_plan[0]["date"]
            prev_stats["same_workout"] = {
                "name":  wname,
                "count": len(same_plan),
                "label": f"{sp_old[:5]} – {sp_new[:5]}" if len(same_plan) > 1 else sp_old[:5],
                "speed": round(sum(sp_speeds)/len(sp_speeds), 1) if sp_speeds else None,
                "hr":    round(sum(sp_hrs)/len(sp_hrs))          if sp_hrs    else None,
                "dps":   round(sum(sp_dpss)/len(sp_dpss), 2)     if sp_dpss   else None,
            }

    # השוואה בתנאים דומים — אם יש מספיק נתונים
    similar = [w for w in same if _similar_conditions(current_w, w)]
    if len(similar) >= 2:
        sim_speeds = [w["avg_speed"] for w in similar if w.get("avg_speed")]
        sim_hrs    = [w["avg_hr"]    for w in similar if w.get("avg_hr")]
        sim_dpss   = [w["dps"]       for w in similar if w.get("dps")]
        sim_old = similar[-1]["date"]; sim_new = similar[0]["date"]
        prev_stats["similar"] = {
            "count": len(similar),
            "label": f"{sim_old[:5]} – {sim_new[:5]}",
            "speed": round(sum(sim_speeds)/len(sim_speeds), 1) if sim_speeds else None,
            "hr":    round(sum(sim_hrs)/len(sim_hrs))          if sim_hrs    else None,
            "dps":   round(sum(sim_dpss)/len(sim_dpss), 2)     if sim_dpss   else None,
            "wind_range": f"{min(w.get('wind_kmh',0) for w in similar):.0f}–{max(w.get('wind_kmh',0) for w in similar):.0f} קמ\"ש",
        }

    return prev_stats, history


def build_email_html(w: dict, athlete_name: str,
                     prev_stats: dict = None, history: list = None,
                     wellness: dict = None, lap_analysis: dict = None,
                     research_html: str = "", weather: dict = None) -> str:
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
        _wnd = w.get('wind_kmh'); _wdir = w.get('wind_dir_he'); _wgst = w.get('wind_gusts_kmh')
        _wv  = w.get('wave_height_m'); _wvdir = w.get('wave_dir_he')
        _weather_chips = ""
        if _wnd is not None:
            _weather_chips += f'<span class="wx-chip">💨 {_wnd} קמ"ש {_wdir or ""}</span>'
        if _wgst is not None:
            _weather_chips += f'<span class="wx-chip">נחשולים {_wgst} קמ"ש</span>'
        if _wv is not None:
            _weather_chips += f'<span class="wx-chip">🌊 גל {_wv}מ\' {_wvdir or ""}</span>'
        _weather_row = f'<div class="wx-row">{_weather_chips}</div>' if _weather_chips else ""

        # ─── קטע 1: השוואה לאותו מספר אימון (טמפו/ספרינטים) ───
        sw = prev_stats.get("same_workout")
        compare_html = ""
        if sw:
            compare_html += f"""
  <div class="section">
    <div class="section-title">🎯 השוואה לאותו מספר אימון — {sw['name']}</div>
    <div style="font-size:12px;color:#546e7a;margin-bottom:8px;text-align:center">
      ממוצע {sw['count']} ביצועים ({sw['label']})
    </div>
    <table width="100%" cellpadding="4" cellspacing="6">
      <tr>
        <td width="33%"><div class="cmp-card"><div class="clbl">מהירות (קמ"ש)</div><div class="curr">{w.get('avg_speed','')}</div><div class="prev">ממוצע: {sw['speed'] or '—'}</div>{delta_html(w.get('avg_speed'), sw['speed'])}</div></td>
        <td width="33%"><div class="cmp-card"><div class="clbl">דופק ממוצע</div><div class="curr">{w.get('avg_hr','')}</div><div class="prev">ממוצע: {sw['hr'] or '—'}</div>{delta_html(w.get('avg_hr'), sw['hr'], reverse=True)}</div></td>
        <td width="34%"><div class="cmp-card"><div class="clbl">DPS (מטר)</div><div class="curr">{w.get('dps','')}</div><div class="prev">ממוצע: {sw['dps'] or '—'}</div>{delta_html(w.get('dps'), sw['dps'])}</div></td>
      </tr>
    </table>
  </div>"""

        # קטע 2 (ממוצע 5 בכרטיסים) הוסר — הטבלה hist_section משמשת כהשוואת 5 האימונים
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
    <div class="section-title">📊 אימונים אחרונים — {w.get('type','')} {w.get('location','')}</div>
    <table>
      <thead><tr><th>תאריך</th><th>מרחק</th><th>זמן</th><th>מהירות</th><th>דופק</th><th>DPS</th></tr></thead>
      <tbody>{hist_rows}</tbody>
    </table>
  </div>"""

    # ── Wellness section ──
    wellness_html = ""
    if wellness:
        bb    = wellness.get("body_battery")
        slp   = wellness.get("sleep_hours")
        deep  = wellness.get("deep_min")
        deep_pct = wellness.get("deep_pct", 0)
        rem   = wellness.get("rem_min")

        # Body Battery color
        bb_color = "#66bb6a" if (bb or 0) >= 70 else ("#ffa726" if (bb or 0) >= 45 else "#ef5350")
        bb_label = "גבוה" if (bb or 0) >= 70 else ("בינוני" if (bb or 0) >= 45 else "נמוך")
        bb_html  = (f'<span style="font-size:22px;font-weight:700;color:{bb_color}">{bb}</span>'
                    f'<span style="font-size:11px;color:{bb_color};margin-right:4px"> {bb_label}</span>'
                    if bb is not None else '<span style="color:#546e7a">—</span>')

        # Sleep color
        slp_color = "#66bb6a" if (slp or 0) >= 7 else ("#ffa726" if (slp or 0) >= 6 else "#ef5350")
        slp_html  = (f'<span style="font-size:22px;font-weight:700;color:{slp_color}">{slp}</span>'
                     f'<span style="font-size:11px;color:rgba(255,255,255,0.5)"> שעות</span>'
                     if slp is not None else '<span style="color:#546e7a">—</span>')

        # Deep sleep color
        deep_color = "#66bb6a" if deep_pct >= 20 else ("#ffa726" if deep_pct >= 13 else "#ef5350")
        deep_html  = (f'<span style="font-size:22px;font-weight:700;color:{deep_color}">{deep}</span>'
                      f'<span style="font-size:11px;color:rgba(255,255,255,0.5)"> דק\' ({deep_pct}%)</span>'
                      if deep is not None else '<span style="color:#546e7a">—</span>')

        rem_html = (f'<span style="font-size:22px;font-weight:700;color:#90caf9">{rem}</span>'
                    f'<span style="font-size:11px;color:rgba(255,255,255,0.5)"> דק\'</span>'
                    if rem is not None else '<span style="color:#546e7a">—</span>')

        # HRV card
        hrv_val    = wellness.get("hrv_value")
        hrv_status = wellness.get("hrv_status", "")
        hrv_low    = wellness.get("hrv_balanced_low")
        hrv_high   = wellness.get("hrv_balanced_high")
        hrv_html   = '<span style="color:#546e7a">—</span>'
        if hrv_val is not None:
            if hrv_status == "BALANCED":
                hrv_color = "#66bb6a"; hrv_label = "מאוזן"
            elif hrv_status in ("UNBALANCED",):
                hrv_color = "#ffa726"; hrv_label = "לא מאוזן"
            elif hrv_status in ("LOW", "POOR"):
                hrv_color = "#ef5350"; hrv_label = "נמוך"
            else:
                hrv_color = "#90caf9"; hrv_label = hrv_status or ""
            baseline_txt = (f'<div style="font-size:10px;color:#546e7a;margin-top:2px">בסיס: {hrv_low}–{hrv_high}ms</div>'
                            if hrv_low and hrv_high else "")
            hrv_html = (f'<span style="font-size:22px;font-weight:700;color:{hrv_color}">{hrv_val}</span>'
                        f'<span style="font-size:11px;color:{hrv_color};margin-right:4px">ms · {hrv_label}</span>'
                        f'{baseline_txt}')

        # Sleep score card
        ss = wellness.get("sleep_score")
        ss_color = "#66bb6a" if (ss or 0) >= 80 else ("#ffa726" if (ss or 0) >= 60 else "#ef5350")
        ss_html = (f'<span style="font-size:22px;font-weight:700;color:{ss_color}">{ss}</span>'
                   if ss is not None else '<span style="color:#546e7a">—</span>')

        hrv_card = (f'<div class="card"><div class="lbl">HRV</div><div class="val">{hrv_html}</div></div>'
                    if hrv_val is not None else "")

        wellness_html = f"""
  <div class="section">
    <div class="section-title">🔋 מצב לפני האימון — הלילה שעבר</div>
    <table width="100%" cellpadding="4" cellspacing="6" style="margin-bottom:8px">
      <tr>
        <td width="33%"><div class="card"><div class="lbl">Body Battery</div><div class="val">{bb_html}</div></div></td>
        <td width="33%"><div class="card"><div class="lbl">ציון שינה</div><div class="val">{ss_html}</div></div></td>
        <td width="34%"><div class="card"><div class="lbl">שינה כוללת</div><div class="val">{slp_html}</div></div></td>
      </tr>
    </table>
    <table width="100%" cellpadding="4" cellspacing="6">
      <tr>
        <td width="33%"><div class="card"><div class="lbl">שינה עמוקה</div><div class="val">{deep_html}</div></div></td>
        <td width="33%"><div class="card"><div class="lbl">REM</div><div class="val">{rem_html}</div></div></td>
        <td width="34%">{hrv_card}</td>
      </tr>
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
.cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-bottom:14px}}
.card{{background:#1a2a3a;border-radius:12px;padding:14px;text-align:center;border:1px solid #1e3a55}}
.card .lbl{{font-size:10px;color:#78909c;margin-bottom:5px;text-transform:uppercase}}
.card .val{{font-size:24px;font-weight:700;color:#4fc3f7}}
.card .unt{{font-size:11px;color:#546e7a;margin-top:2px}}
.chips{{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}}
.chip{{display:inline-flex;align-items:center;gap:5px;background:#0d2137;border:1px solid #1e4d7a;border-radius:8px;padding:7px 12px;font-size:12px;color:#90caf9}}
.section{{background:#1a2a3a;border-radius:12px;padding:18px;margin-bottom:14px;border:1px solid #1e3a55}}
.section-title{{font-size:14px;color:#4fc3f7;margin-bottom:6px;font-weight:700;border-right:3px solid #1e4d7a;padding-right:10px}}
.section-insight{{font-size:13px;font-weight:600;color:#e0e0e0;margin-bottom:12px;padding-right:13px}}
.zone-row{{display:flex;align-items:center;margin-bottom:9px;gap:9px}}
.zl{{width:28px;font-size:12px;color:#90a4ae;text-align:right;flex-shrink:0;font-weight:600}}
.zbar-bg{{width:340px;background:#0d1e2e;border-radius:5px;height:18px;overflow:hidden;flex-shrink:0}}
.zbar{{height:18px;border-radius:5px;display:inline-flex;align-items:center;justify-content:flex-end;padding:0 6px;font-size:10px;color:white;font-weight:700;min-width:5px}}
.zt{{width:52px;font-size:11px;color:#90caf9;text-align:left;flex-shrink:0}}
.cmp-grid{{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}}
.wx-row{{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;justify-content:center}}
.wx-chip{{background:#0d2a3a;border:1px solid #1e4d7a;border-radius:20px;padding:4px 12px;font-size:12px;color:#4fc3f7}}
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
  <div class="header" style="text-align:center;flex-direction:column;align-items:center">
    <div class="header-icon">🏄</div>
    <div class="header-text">
      <h1>סיכום אימון SUP — {athlete_name}</h1>
      <div class="dt">{date_display}{'  ·  ' + str(w.get('start_hour','')) + ':00' if w.get('start_hour') is not None else ''}</div>
      <div class="sub">עודכן אוטומטית מ-Garmin Connect</div>
    </div>
  </div>
  <div class="banner">
    <div style="flex:1">
      <div class="tn">{w.get('type','')}{' — ' + w['workout_name'] if w.get('workout_name') else ''}</div>
      <div class="tl">📍 {w.get('location','')}</div>
      {build_weather_html(weather or {})}
    </div>
    <div class="ti">🌊</div>
  </div>
  <table width="100%" cellpadding="4" cellspacing="6" style="margin-bottom:10px;table-layout:fixed">
    <tr>
      <td width="20%"><div class="card"><div class="lbl">מרחק</div><div class="val">{w.get('distance','')}</div><div class="unt">ק"מ</div></div></td>
      <td width="20%"><div class="card"><div class="lbl">זמן</div><div class="val">{w.get('duration','')}</div><div class="unt"></div></div></td>
      <td width="20%"><div class="card"><div class="lbl">מהירות</div><div class="val">{w.get('avg_speed','')}</div><div class="unt">קמ"ש</div></div></td>
      <td width="20%"><div class="card"><div class="lbl">מהירות מקס</div><div class="val">{w.get('max_speed','') or '—'}</div><div class="unt">קמ"ש</div></div></td>
      <td width="20%"></td>
    </tr>
  </table>
  <table width="100%" cellpadding="4" cellspacing="6" style="margin-bottom:10px;table-layout:fixed">
    <tr>
      <td width="20%"><div class="card"><div class="lbl">דופק</div><div class="val">{w.get('avg_hr',0) or '—'}</div><div class="unt">bpm</div></div></td>
      <td width="20%"><div class="card"><div class="lbl">דופק מקס</div><div class="val">{w.get('max_hr',0) or '—'}</div><div class="unt">bpm</div></div></td>
      <td width="20%"><div class="card"><div class="lbl">SPM</div><div class="val">{w.get('spm',0) or '—'}</div><div class="unt"></div></div></td>
      <td width="20%"><div class="card"><div class="lbl">SPM מקס</div><div class="val">{w.get('spm_max',0) or '—'}</div><div class="unt"></div></div></td>
      <td width="20%"><div class="card"><div class="lbl">DPS</div><div class="val">{w.get('dps',0) or '—'}</div><div class="unt">מ'</div></div></td>
    </tr>
  </table>
  <div class="section">
    <div class="section-title">⏱ זמן בזונות דופק</div>
    <div class="zone-row"><div class="zl">Z1</div><div class="zbar-bg"><div class="zbar" style="width:{px(z1s)}px;background:#37474f">{pct(z1s)}</div></div><div class="zt">{z1s//60}:{z1s%60:02d}</div></div>
    <div class="zone-row"><div class="zl">Z2</div><div class="zbar-bg"><div class="zbar" style="width:{px(z2s)}px;background:#1565c0">{pct(z2s)}</div></div><div class="zt">{z2s//60}:{z2s%60:02d}</div></div>
    <div class="zone-row"><div class="zl">Z3</div><div class="zbar-bg"><div class="zbar" style="width:{px(z3s)}px;background:#2e7d32">{pct(z3s)}</div></div><div class="zt">{w.get('z3','0:00')}</div></div>
    <div class="zone-row"><div class="zl">Z4</div><div class="zbar-bg"><div class="zbar" style="width:{px(z4s)}px;background:#e65100">{pct(z4s)}</div></div><div class="zt">{w.get('z4','0:00')}</div></div>
    <div class="zone-row"><div class="zl">Z5</div><div class="zbar-bg"><div class="zbar" style="width:{px(z5s)}px;background:#b71c1c">{pct(z5s)}</div></div><div class="zt">{w.get('z5','0:00')}</div></div>
  </div>
  {wellness_html}
  {compare_html}
  {hist_section}
  {build_lap_analysis_html(lap_analysis or {}, prev_stats=prev_stats, history=history)}
  {research_html}
  <div class="footer">נוצר אוטומטית על ידי SUP Tracker • Garmin Connect • {w.get('date','')}</div>
</div></body></html>"""


def send_workout_email(to_email: str, athlete_name: str, workout: dict,
                       all_workouts: list = None, wellness: dict = None,
                       lap_analysis: dict = None):
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

        research_html = ""
        weather = {k: workout.get(k) for k in ('wind_kmh','wind_dir_he','wind_gusts_kmh',
                                                 'wave_height_m','wave_period_s','wave_dir_he','temp_c')}
        html = build_email_html(workout, athlete_name, prev_stats, history, wellness=wellness,
                                lap_analysis=lap_analysis, research_html=research_html, weather=weather)
        subject = (f"🏄 SUP | {workout.get('date','')} — "
                   f"{workout.get('type','')} {workout.get('location','')} | "
                   f"{workout.get('distance','')} ק\"מ")
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = GMAIL_USER
        msg["To"]      = to_email
        msg.attach(MIMEText(html, "html", "utf-8"))
        with smtplib.SMTP("smtp.gmail.com", 587) as s:
            s.starttls()
            s.login(GMAIL_USER, GMAIL_PASSWORD)
            s.sendmail(GMAIL_USER, to_email, msg.as_string())
        print(f"  [Email] נשלח ל-{to_email} ✓")
    except Exception as e:
        print(f"  [Email] שגיאה: {e}")


# ===== LAP ANALYSIS (Pacing / Technical Fatigue / Efficiency) =====

WARMUP_CUTOFF_SEC = 900  # 15 minutes


def fetch_lap_analysis(api, act_id: str, workout_type: str = '', total_dist_km: float = 0) -> dict:
    """
    Fetch per-lap data, skip warmup (first 15 min + WARMUP intensity),
    return pacing / fatigue / efficiency analysis.
    """
    try:
        splits = api.get_activity_splits(int(act_id))
        laps = splits.get('lapDTOs', [])
    except Exception as e:
        print(f"  [Laps] {e}")
        return {}

    if not laps:
        return {}

    def _spd(l): return round((l.get('averageSpeed', 0) or 0) * 3.6, 1)
    def _dps(l): return round(l.get('averageStrokeDistance', 0) or 0, 2)
    def _spm(l): return round(l.get('averageStrokeCadence', 0) or 0, 1)
    def _hr(l):  return int(l.get('averageHR', 0) or 0)
    def _dur(l): return l.get('duration', 0) or 0
    def _dist(l): return (l.get('distance', 0) or 0)
    def chg(a, b): return round((b - a) / a * 100, 1) if a and b else None

    # HRmax: use per-lap maxHeartRate reported by Garmin
    hrmax = max((l.get('maxHeartRate', 0) or 0 for l in laps), default=0)
    if hrmax < 130:  # fallback if Garmin didn't report it
        avg_hrs = [l.get('averageHR', 0) or 0 for l in laps if (l.get('averageHR') or 0) > 60]
        hrmax = int(max(avg_hrs) * 1.12) if avg_hrs else 185

    def _zone(hr):
        """Garmin 5-zone model by %HRmax"""
        if not hrmax or not hr: return 1
        p = hr / hrmax * 100
        return 5 if p >= 90 else (4 if p >= 80 else (3 if p >= 70 else (2 if p >= 60 else 1)))

    def _zone_dist(lap_list):
        """HR zone distribution (%) weighted by lap duration"""
        secs = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        tot = 0
        for l in lap_list:
            d = _dur(l); secs[_zone(_hr(l))] += d; tot += d
        if not tot: return {z: 0 for z in range(1, 6)}
        return {z: round(secs[z] / tot * 100) for z in range(1, 6)}


    # ── SPRINT WORKOUT: detect sprint/rest pairs by duration ──
    if workout_type == 'ספרינטים':
        # Skip warmup
        cum_sec = 0
        post_warmup = []
        for lap in laps:
            cum_sec += _dur(lap)
            if lap.get('intensityType') == 'WARMUP' or cum_sec <= WARMUP_CUTOFF_SEC:
                continue
            post_warmup.append(lap)

        # Sprint lap: duration 10-30s AND speed >= 7 km/h
        # Rest lap: duration 55-90s OR speed < 5.5 km/h
        # Between-sets laps: longer duration (>200s)
        sprint_laps, rest_laps = [], []
        for lap in post_warmup:
            d, s = _dur(lap), _spd(lap)
            if 8 <= d <= 35 and s >= 6.5:
                sprint_laps.append(lap)
            elif 50 <= d <= 100 and s < 6.5:
                rest_laps.append(lap)

        if not sprint_laps:
            return {'workout_type': workout_type, 'laps': [], 'sprints': []}

        def lavg(lst, k):
            vals = [k(l) for l in lst]
            return round(sum(vals) / len(vals), 2) if vals else None

        sprints_data = [
            {
                'n':    i + 1,
                'speed': _spd(l),
                'spm':   _spm(l),
                'dps':   _dps(l),
                'hr':    _hr(l),
                'dur':   round(_dur(l)),
                'dist':  round(_dist(l)),
            }
            for i, l in enumerate(sprint_laps)
        ]
        rests_data = [
            {'n': i+1, 'hr': _hr(l), 'dur': round(_dur(l)), 'speed': _spd(l)}
            for i, l in enumerate(rest_laps)
        ]

        n = len(sprints_data)
        first_half = sprints_data[:max(1, n//2)]
        last_half  = sprints_data[n - max(1, n//2):]

        def savg(lst, fn):
            vals = [fn(x) for x in lst if fn(x)]
            return round(sum(vals)/len(vals), 2) if vals else None

        f_speed = savg(first_half, lambda x: x['speed'])
        l_speed = savg(last_half,  lambda x: x['speed'])
        f_dps   = savg(first_half, lambda x: x['dps'])
        l_dps   = savg(last_half,  lambda x: x['dps'])
        f_spm   = savg(first_half, lambda x: x['spm'])
        l_spm   = savg(last_half,  lambda x: x['spm'])

        # HR recovery: for each rest, how much HR dropped vs previous sprint
        hr_recovery = []
        for i, r in enumerate(rests_data):
            if i < len(sprints_data):
                sprint_hr = sprints_data[i]['hr']
                drop = sprint_hr - r['hr']
                hr_recovery.append(drop)
        avg_recovery = round(sum(hr_recovery)/len(hr_recovery)) if hr_recovery else None

        decay = chg(f_speed, l_speed)
        decay_label = (
            '✓ קצב ספרינטים יציב — כוח נשמר לאורך הסדרה' if (decay or 0) > -5
            else f'⚠️ ספרינטים מאטים ({abs(decay):.0f}%) — עייפות או יותר מדי ספרינטים'
        )

        return {
            'workout_type': workout_type,
            'sprints': sprints_data,
            'rests':   rests_data,
            'hr_zones':      _zone_dist(post_warmup),
            'sprint_zones':  _zone_dist(sprint_laps),
            'rest_zones':    _zone_dist(rest_laps),
            'summary': {
                'count':        n,
                'peak_speed':   max((s['speed'] for s in sprints_data), default=0),
                'avg_speed':    savg(sprints_data, lambda x: x['speed']),
                'avg_hr':       savg(sprints_data, lambda x: x['hr']),
                'avg_dps':      savg(sprints_data, lambda x: x['dps']),
                'avg_spm':      savg(sprints_data, lambda x: x['spm']),
                'first_speed':  f_speed,
                'last_speed':   l_speed,
                'speed_decay':  decay,
                'decay_label':  decay_label,
                'dps_chg':      chg(f_dps, l_dps),
                'spm_chg':      chg(f_spm, l_spm),
                'avg_recovery': avg_recovery,
            },
        }

    # ── REGULAR WORKOUTS: aerobic / אירובי ארוך / טמפו ──
    main_laps, cum_sec = [], 0
    cum_dist_m = 0
    for lap in laps:
        cum_sec += _dur(lap)
        if lap.get('intensityType') == 'WARMUP' or cum_sec <= WARMUP_CUTOFF_SEC:
            continue
        if _dist(lap) < 200:
            continue
        # חותך laps שחורגים ב-15%+ ממרחק האמיתי (מניעת ספירה כפולה בסיבוב)
        if total_dist_km > 0:
            cum_dist_m += _dist(lap)
            if cum_dist_m > total_dist_km * 1000 * 1.15:
                break
        main_laps.append(lap)

    if len(main_laps) < 1:
        return {}

    laps_data = [
        {
            'n':     i + 1,
            'dist':  round(_dist(lap) / 1000, 2),
            'speed': _spd(lap),
            'hr':    _hr(lap),
            'spm':   _spm(lap),
            'dps':   _dps(lap),
            'eff':   round(_spd(lap) / _hr(lap) * 100, 2) if _hr(lap) > 0 and _spd(lap) > 0 else None,
        }
        for i, lap in enumerate(main_laps)
    ]

    n = len(laps_data)
    third = max(1, n // 3)
    first3, last3 = laps_data[:third], laps_data[n - third:]

    def avg(lst, k):
        vals = [x[k] for x in lst if x.get(k)]
        return round(sum(vals) / len(vals), 2) if vals else None

    f_speed, l_speed = avg(first3, 'speed'), avg(last3, 'speed')
    f_hr,    l_hr    = avg(first3, 'hr'),    avg(last3, 'hr')
    f_dps,   l_dps   = avg(first3, 'dps'),   avg(last3, 'dps')
    f_spm,   l_spm   = avg(first3, 'spm'),   avg(last3, 'spm')
    f_eff,   l_eff   = avg(first3, 'eff'),   avg(last3, 'eff')

    spd_chg = chg(f_speed, l_speed)
    hr_drift = chg(f_hr, l_hr)  # HR rising without speed gain = cardiac drift

    # Pacing interpretation depends on workout type
    if workout_type == 'טמפו':
        if (spd_chg or 0) >= 2:
            pattern = 'Negative Split ✓ — בנייה פרוגרסיבית כנדרש בטמפו'
        elif (spd_chg or 0) <= -4:
            pattern = '⚠️ ירידה בקצב — יצאת חזק מדי לאימון טמפו'
        else:
            pattern = 'קצב אחיד — שקול לבנות יותר בשליש האחרון'
    elif workout_type in ('אירובי', 'אירובי ארוך'):
        if (spd_chg or 0) >= 4:
            pattern = 'Negative Split — אולי יצאת שמרני מדי בהתחלה'
        elif (spd_chg or 0) <= -5:
            pattern = '⚠️ Positive Split — יצאת חזק מדי, ירידה בסוף'
        else:
            pattern = '✓ Even Pace — חלוקת קצב מצוינת לאירובי'
    else:
        if (spd_chg or 0) >= 2:
            pattern = 'Negative Split ✓'
        elif (spd_chg or 0) <= -3:
            pattern = '⚠️ Positive Split — ירידה בקצב'
        else:
            pattern = 'Even Pace ✓'

    # DPS insight by workout type
    dps_chg = chg(f_dps, l_dps)
    if workout_type == 'טמפו':
        dps_ok_threshold = -12  # טמפו — מותר קצת ירידה בלחץ
        dps_insight = (
            '✓ DPS יציב תחת עומס טמפו — טכניקה מצוינת' if (dps_chg or 0) > -8
            else f'⚠️ DPS ירד {abs(dps_chg):.0f}% — משיכות קצרות יותר תחת עומס'
        )
    elif workout_type == 'אירובי ארוך':
        dps_insight = (
            '✓ DPS נשמר לאורך מרחק — עמידות טכנית מצוינת' if (dps_chg or 0) > -6
            else f'⚠️ DPS ירד {abs(dps_chg):.0f}% — טכניקה נשברת בסוף המרחק'
        )
    else:  # אירובי
        dps_insight = (
            '✓ DPS יציב — שמירה על טכניקה באימון אירובי' if (dps_chg or 0) > -5
            else f'⚠️ DPS ירד {abs(dps_chg):.0f}% — שקול להפחית מרחק'
        )

    # Cardiac drift: HR up while speed is flat/down
    drift_insight = ""
    if (hr_drift or 0) > 8 and (spd_chg or 0) < 2:
        drift_insight = f'Cardiac Drift: דופק עלה {hr_drift:.0f}% בלי עלייה במהירות — עייפות קרדיו-וסקולרית'

    # Efficiency insight by workout type
    eff_chg = chg(f_eff, l_eff)
    if workout_type == 'טמפו':
        eff_insight = (
            '✓ יעילות נשמרת תחת עומס — לב עובד ביחס נכון למהירות'
            if (eff_chg or 0) > -6
            else f'⚠️ יעילות ירדה {abs(eff_chg):.0f}% — הלב עובד קשה יותר לאותה מהירות בסוף'
        )
    elif workout_type in ('אירובי', 'אירובי ארוך'):
        eff_insight = (
            '✓ יעילות אירובית טובה — דופק נמוך ביחס למהירות'
            if (eff_chg or 0) > -4
            else f'⚠️ יעילות ירדה {abs(eff_chg):.0f}% — כדאי לבדוק שינה/התאוששות'
        )
    else:
        eff_insight = ""

    # ── Pa:HR Aerobic Decoupling (first half vs second half of main laps) ──
    # Pa:HR = ((speed/HR)_first - (speed/HR)_second) / (speed/HR)_first × 100
    # Source: TrainingPeaks methodology, adapted for SUP paddle sports
    pa_hr_pct = None
    if workout_type in ('אירובי', 'אירובי ארוך') and len(laps_data) >= 4:
        mid = len(laps_data) // 2
        h1_spd = avg(laps_data[:mid],  'speed')
        h2_spd = avg(laps_data[mid:],  'speed')
        h1_hr  = avg(laps_data[:mid],  'hr')
        h2_hr  = avg(laps_data[mid:],  'hr')
        if h1_spd and h2_spd and h1_hr and h2_hr:
            pa1 = h1_spd / h1_hr
            pa2 = h2_spd / h2_hr
            if pa1: pa_hr_pct = round((pa1 - pa2) / pa1 * 100, 1)

    # ── Pace & DPS Variability (CV = stddev / mean × 100) ──
    pace_cv = dps_cv = None
    speeds = [l['speed'] for l in laps_data if l.get('speed', 0) > 0]
    dpss   = [l['dps']   for l in laps_data if l.get('dps',   0) > 0]
    if len(speeds) >= 3:
        mu = sum(speeds) / len(speeds)
        sd = (sum((x - mu) ** 2 for x in speeds) / len(speeds)) ** 0.5
        pace_cv = round(sd / mu * 100, 1) if mu else None
    if len(dpss) >= 3:
        mu = sum(dpss) / len(dpss)
        sd = (sum((x - mu) ** 2 for x in dpss) / len(dpss)) ** 0.5
        dps_cv = round(sd / mu * 100, 1) if mu else None

    # ── HR Zone distribution (weighted by lap duration) ──
    hr_zones = _zone_dist(main_laps)

    return {
        'workout_type': workout_type,
        'laps':    laps_data,
        'pacing':  {'first_speed': f_speed, 'last_speed': l_speed,
                    'first_hr': f_hr,    'last_hr': l_hr,
                    'spd_chg': spd_chg,  'pattern': pattern,
                    'hr_drift': hr_drift, 'drift_insight': drift_insight},
        'fatigue': {'first_dps': f_dps, 'last_dps': l_dps, 'dps_chg': dps_chg,
                    'first_spm': f_spm, 'last_spm': l_spm, 'spm_chg': chg(f_spm, l_spm),
                    'dps_insight': dps_insight},
        'eff':     {'first': f_eff, 'last': l_eff, 'chg': eff_chg,
                    'eff_insight': eff_insight,
                    'per_lap': [{'n': l['n'], 'eff': l['eff']} for l in laps_data]},
        'hr_zones': hr_zones,
        'pa_hr':    pa_hr_pct,
        'pace_cv':  pace_cv,
        'dps_cv':   dps_cv,
    }


def build_lap_analysis_html(analysis: dict, prev_stats: dict = None, history: list = None) -> str:
    if not analysis:
        return ""

    wtype = analysis.get('workout_type', '')

    # ── shared helpers ──
    def arrow(chg, good_positive=True):
        if chg is None: return ""
        good = (chg > 0) == good_positive
        color = "#66bb6a" if good else "#ef5350"
        sym = "↑" if chg > 0 else "↓"
        return f'<span style="color:{color};font-weight:700">{sym}{abs(chg):.1f}%</span>'

    def bar(val, max_val, color):
        w = max(4, round(val / max_val * 200)) if max_val else 4
        return (f'<div style="display:inline-block;height:10px;width:{w}px;'
                f'background:{color};border-radius:3px;vertical-align:middle"></div>')

    # ══════════════════════════════════════════
    # SPRINT BRANCH
    # ══════════════════════════════════════════
    if wtype == 'ספרינטים':
        sprints = analysis.get('sprints', [])
        rests   = analysis.get('rests', [])
        summary = analysis.get('summary', {})

        if not sprints:
            return ""

        max_spd = max((s['speed'] for s in sprints), default=1)
        sprint_rows = ""
        for s in sprints:
            spd_color = "#00D4FF" if s['speed'] >= max_spd * 0.95 else (
                        "#66bb6a" if s['speed'] >= max_spd * 0.85 else "#ffa726")
            sprint_rows += (
                f'<tr style="border-bottom:1px solid rgba(255,255,255,0.05)">'
                f'<td style="padding:6px 8px;color:#90a4ae;font-size:0.82em">#{s["n"]}</td>'
                f'<td style="padding:6px 8px">'
                f'  {bar(s["speed"], max_spd, spd_color)}&nbsp;'
                f'  <span style="font-size:0.85em;color:{spd_color}">{s["speed"]} קמ"ש</span>'
                f'</td>'
                f'<td style="padding:6px 8px;font-size:0.82em;color:#e0e0e0">{s["spm"] or "—"}</td>'
                f'<td style="padding:6px 8px;font-size:0.82em;color:#e0e0e0">{s["dps"] or "—"}מ</td>'
                f'<td style="padding:6px 8px;font-size:0.82em;color:#78909c">{s["dur"]}ש</td>'
                f'</tr>'
            )

        # Speed decay summary
        decay_txt = ""
        if summary.get('speed_decay') is not None:
            d = summary['speed_decay']
            if d < -10:
                decay_txt = f"⚠️ מהירות ירדה {abs(d):.0f}% בין ספרינט ראשון לאחרון — עייפות אנאירובית"
            elif d < -5:
                decay_txt = f"⚡ ירידה קלה של {abs(d):.0f}% בין ספרינטים — ניהול מאמץ סביר"
            else:
                decay_txt = f"✓ מהירות יציבה לאורך כל הספרינטים — קיבולת אנאירובית טובה"

        # HR recovery
        hr_txt = ""
        if rests and summary.get('avg_recovery') is not None:
            drop = summary['avg_recovery']
            if drop >= 20:
                hr_txt = f"✓ התאוששות לב מצוינת — דופק יורד {drop:.0f} BPM בממוצע בין ספרינטים"
            elif drop >= 10:
                hr_txt = f"⚡ התאוששות לב בינונית — ירידה של {drop:.0f} BPM בין ספרינטים"
            else:
                hr_txt = f"⚠️ התאוששות לב איטית — רק {drop:.0f} BPM ירידה — שקול מנוחה ארוכה יותר"

        dps_txt = ""
        if summary.get('dps_chg') is not None:
            d = summary['dps_chg']
            if d < -8:
                dps_txt = f"⚠️ DPS ירד {abs(d):.0f}% — משיכות קצרות יותר תחת עייפות"
            elif d > 2:
                dps_txt = f"✓ DPS עלה {d:.0f}% — שמירה טכנית תחת לחץ מרשימה"
            else:
                dps_txt = "✓ DPS יציב — טכניקת משיכה נשמרת גם תחת מאמץ"

        insights = " &nbsp;|&nbsp; ".join(x for x in [decay_txt, hr_txt, dps_txt] if x)

        # ── HR Zones for sprint workout ──
        sz = analysis.get('sprint_zones', {})
        rz = analysis.get('rest_zones',   {})
        # In ספרינטים: sprint laps should be Z4-Z5, rest laps Z2-Z3
        sprint_z45 = (sz.get(4, 0) + sz.get(5, 0))
        rest_z23   = (rz.get(2, 0) + rz.get(3, 0))
        zone_verdict = ""
        if sz:
            if sprint_z45 >= 60:
                zone_verdict = f"✓ ספרינטים ב-Z4-Z5 ({sprint_z45}%) — עצימות אנאירובית נכונה"
            else:
                zone_verdict = f"⚡ ספרינטים ב-Z4-Z5 רק {sprint_z45}% — שקול להגביר עצימות"
        if rz and rest_z23 >= 50:
            zone_verdict += f"  |  ✓ מנוחות ב-Z2-Z3 ({rest_z23}%) — התאוששות פעילה תקינה"

        z_colors = {1:'#37474f', 2:'#1565c0', 3:'#2e7d32', 4:'#e65100', 5:'#b71c1c'}
        z_labels = {1:'Z1 מנוחה', 2:'Z2 אירובי', 3:'Z3 סף', 4:'Z4 סף עליון', 5:'Z5 אנאירובי'}
        zone_rows_sprint = ""
        for z in range(1, 6):
            s_pct = sz.get(z, 0); r_pct = rz.get(z, 0)
            zone_rows_sprint += (
                f'<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">'
                f'<td style="padding:4px 8px;font-size:0.8em;color:#90a4ae">{z_labels[z]}</td>'
                f'<td style="padding:4px 8px"><div style="display:flex;align-items:center;gap:6px">'
                f'<div style="width:{max(3,s_pct*1.4):.0f}px;height:10px;background:{z_colors[z]};border-radius:3px"></div>'
                f'<span style="font-size:0.8em;color:#e0e0e0">{s_pct}%</span></div></td>'
                f'<td style="padding:4px 8px"><div style="display:flex;align-items:center;gap:6px">'
                f'<div style="width:{max(3,r_pct*1.4):.0f}px;height:10px;background:{z_colors[z]};border-radius:3px;opacity:0.6"></div>'
                f'<span style="font-size:0.8em;color:#78909c">{r_pct}%</span></div></td>'
                f'</tr>'
            )

        sprint_html = f"""
  <div class="section">
    <div class="section-title">⚡ ניתוח ספרינטים — {len(sprints)} חזרות</div>
    <div class="section-insight">{summary.get('decay_label','') or insights or '—'}</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:12px">
      <thead><tr>
        <th style="padding:5px 8px;text-align:right;font-size:0.78em;color:#546e7a;font-weight:400">#</th>
        <th style="padding:5px 8px;font-size:0.78em;color:#546e7a;font-weight:400">מהירות שיא</th>
        <th style="padding:5px 8px;font-size:0.78em;color:#546e7a;font-weight:400">SPM</th>
        <th style="padding:5px 8px;font-size:0.78em;color:#546e7a;font-weight:400">DPS</th>
        <th style="padding:5px 8px;font-size:0.78em;color:#546e7a;font-weight:400">משך</th>
      </tr></thead>
      <tbody>{sprint_rows}</tbody>
    </table>
    {f'<div style="font-size:0.82em;color:#90a4ae;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:8px;margin-bottom:8px">{insights}</div>' if insights else ''}
  </div>"""
        return sprint_html

    # ══════════════════════════════════════════
    # REGULAR BRANCH (אירובי / טמפו / אירובי ארוך)
    # ══════════════════════════════════════════
    if not analysis.get('laps'):
        return ""

    laps   = analysis['laps']
    pacing = analysis['pacing']
    fat    = analysis['fatigue']
    eff    = analysis['eff']

    # ── helpers ──
    def mini_card(title, first, last, chg_val, unit, good_positive=True):
        if first is None: return ""
        color = "#66bb6a" if (chg_val or 0) * (1 if good_positive else -1) > 0 else "#ef5350"
        if chg_val is not None:
            return (f'<div style="flex:1;background:rgba(255,255,255,0.05);border-radius:10px;padding:12px;text-align:center">'
                    f'<div style="font-size:0.76em;color:#78909c;margin-bottom:6px">{title}</div>'
                    f'<div style="display:flex;justify-content:space-around;align-items:center">'
                    f'<div><div style="font-size:0.7em;color:#546e7a">התחלה</div>'
                    f'<div style="font-size:1.2em;font-weight:700;color:#e0e0e0">{first}{unit}</div></div>'
                    f'<div style="font-size:1.5em;color:{color}">{"→" if abs(chg_val) < 1 else ("↑" if chg_val > 0 else "↓")}</div>'
                    f'<div><div style="font-size:0.7em;color:#546e7a">סוף</div>'
                    f'<div style="font-size:1.2em;font-weight:700;color:{color}">{last}{unit}</div></div>'
                    f'</div>'
                    f'<div style="font-size:0.75em;margin-top:6px;color:{color}">'
                    f'{arrow(chg_val, good_positive)} ({abs(chg_val):.1f}%)</div>'
                    f'</div>')
        return (f'<div style="flex:1;background:rgba(255,255,255,0.05);border-radius:10px;padding:12px;text-align:center">'
                f'<div style="font-size:0.76em;color:#78909c;margin-bottom:6px">{title}</div>'
                f'<div style="font-size:1.1em;font-weight:700;color:#e0e0e0">{first}{unit} → {last}{unit}</div></div>')

    # ── 1. Pacing table ──
    max_spd = max((l['speed'] for l in laps), default=1)
    max_hr  = max((l['hr']    for l in laps), default=1)

    pat_color = "#66bb6a" if "Negative" in pacing['pattern'] else (
                "#ffa726" if "Even" in pacing['pattern'] else "#ef5350")

    # prev avg speed comparison
    hist_spd = (prev_stats or {}).get('speed')
    hist_dps = (prev_stats or {}).get('dps')
    hist_n   = (prev_stats or {}).get('count', 0)
    hist_label = f"ממוצע {hist_n} אימונים" if hist_n else ""

    def _cmp_line(curr, prev_val, unit, label, reverse=False):
        if not prev_val or not curr: return ""
        try:
            diff_pct = (float(curr) - float(prev_val)) / float(prev_val) * 100
        except Exception: return ""
        good = (diff_pct > 0) != reverse
        color = "#66bb6a" if good else "#ef5350"
        sym = "↑" if diff_pct > 0 else "↓"
        return (f'<span style="font-size:0.8em;color:{color};margin-right:12px">'
                f'{sym} {abs(diff_pct):.1f}% vs {label} ({prev_val}{unit})</span>')

    lap_rows = ""
    for l in laps:
        lap_rows += (
            f'<tr style="border-bottom:1px solid rgba(255,255,255,0.05)">'
            f'<td style="padding:6px 8px;color:#90a4ae;font-size:0.82em">ק"מ {l["n"]}</td>'
            f'<td style="padding:6px 8px">'
            f'  {bar(l["speed"], max_spd, "#00D4FF")}&nbsp;'
            f'  <span style="font-size:0.85em;color:#e0e0e0">{l["speed"]}</span>'
            f'</td>'
            f'<td style="padding:6px 8px">'
            f'  {bar(l["hr"], max_hr, "#ef5350")}&nbsp;'
            f'  <span style="font-size:0.85em;color:#e0e0e0">{l["hr"]}</span>'
            f'</td>'
            f'<td style="padding:6px 8px;font-size:0.82em;color:#78909c">{l["spm"] or "—"}</td>'
            f'<td style="padding:6px 8px;font-size:0.82em;color:#78909c">{l["dps"] or "—"}</td>'
            f'</tr>'
        )

    pattern_label = pacing.get('pattern', '')
    drift_insight = pacing.get('drift_insight', '')
    avg_spd_curr  = round(sum(l['speed'] for l in laps) / len(laps), 2) if laps else None

    # Pace variability
    pace_cv = analysis.get('pace_cv')
    dps_cv  = analysis.get('dps_cv')
    cv_color  = "#66bb6a" if (pace_cv or 99) < 4 else ("#ffa726" if (pace_cv or 99) < 7 else "#ef5350")
    dcv_color = "#66bb6a" if (dps_cv  or 99) < 5 else ("#ffa726" if (dps_cv  or 99) < 9 else "#ef5350")
    if wtype == 'טמפו':
        cv_note = ("✓ עקביות מרשימה לאימון טמפו" if (pace_cv or 99) < 4 else
                   "✓ שונות סבירה — גיוון מכוון ניתן לשפר" if (pace_cv or 99) < 7 else
                   "⚠️ שונות גבוהה — קצב לא אחיד לאימון טמפו")
    else:
        cv_note = ("✓ פייסינג מדויק — שליטה מצוינת בקצב" if (pace_cv or 99) < 4 else
                   "✓ שונות נמוכה — פייסינג טוב" if (pace_cv or 99) < 7 else
                   "⚡ שונות בינונית — תנאי מים או שינוי קצב" if (pace_cv or 99) < 10 else
                   "⚠️ שונות גבוהה — חלוקת קצב לא אחידה")
    dcv_note = ("✓ טכניקה עקבית לאורך האימון" if (dps_cv or 99) < 5 else
                "⚡ שונות טכנית סבירה — DPS משתנה" if (dps_cv or 99) < 9 else
                "⚠️ DPS לא עקבי — עקביות הטכניקה נפגמת")

    cv_html = ""
    if pace_cv is not None:
        cv_html = (f'<div style="margin-top:10px;display:flex;gap:14px;flex-wrap:wrap">'
                   f'<div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:10px 14px;flex:1">'
                   f'<div style="font-size:0.75em;color:#78909c;margin-bottom:4px">📐 עקביות קצב (CV)</div>'
                   f'<div style="font-size:1.3em;font-weight:700;color:{cv_color}">{pace_cv}%</div>'
                   f'<div style="font-size:0.78em;color:{cv_color};margin-top:3px">{cv_note}</div>'
                   f'</div>'
                   + (f'<div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:10px 14px;flex:1">'
                      f'<div style="font-size:0.75em;color:#78909c;margin-bottom:4px">📐 עקביות DPS (CV)</div>'
                      f'<div style="font-size:1.3em;font-weight:700;color:{dcv_color}">{dps_cv}%</div>'
                      f'<div style="font-size:0.78em;color:{dcv_color};margin-top:3px">{dcv_note}</div>'
                      f'</div>' if dps_cv is not None else '')
                   + '</div>')

    pacing_html = f"""
  <div class="section">
    <div class="section-title">📈 פייסינג — חלק מרכזי (ללא חימום)</div>
    <div class="section-insight" style="color:{pat_color}">{pattern_label}</div>
    <div style="margin-bottom:10px;font-size:0.82em;color:#90a4ae">
      קצב ראשון: <strong>{pacing['first_speed']}</strong> קמ"ש → אחרון: <strong>{pacing['last_speed']}</strong> קמ"ש
      &nbsp;{arrow(pacing['spd_chg'])}
      {_cmp_line(avg_spd_curr, hist_spd, ' קמ"ש', hist_label) if hist_label else ''}
    </div>
    {f'<div style="font-size:0.8em;color:#ffa726;padding:6px 10px;background:rgba(255,166,0,0.08);border-radius:6px;margin-bottom:10px">{drift_insight}</div>' if drift_insight else ''}
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>
        <th style="padding:5px 8px;text-align:right;font-size:0.78em;color:#546e7a;font-weight:400"></th>
        <th style="padding:5px 8px;font-size:0.78em;color:#546e7a;font-weight:400">מהירות קמ"ש</th>
        <th style="padding:5px 8px;font-size:0.78em;color:#546e7a;font-weight:400">דופק BPM</th>
        <th style="padding:5px 8px;font-size:0.78em;color:#546e7a;font-weight:400">SPM</th>
        <th style="padding:5px 8px;font-size:0.78em;color:#546e7a;font-weight:400">DPS</th>
      </tr></thead>
      <tbody>{lap_rows}</tbody>
    </table>
    {cv_html}
  </div>"""

    # ── 2. Technical Fatigue (DPS + SPM) ──
    dps_insight = fat.get('dps_insight', '')
    if not dps_insight and fat.get('dps_chg') is not None:
        d = fat['dps_chg']
        dps_insight = ("✓ DPS יציב — טכניקה נשמרת" if d > -5 else
                       f"⚠️ DPS ירד {abs(d):.0f}% — עייפות טכנית")

    fatigue_html = f"""
  <div class="section">
    <div class="section-title">🦾 עייפות טכנית (שליש ראשון vs שליש אחרון)</div>
    <div class="section-insight">{dps_insight}</div>
    {_cmp_line(fat.get('last_dps'), hist_dps, 'מ', hist_label) if hist_label and fat.get('last_dps') else ''}
    <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap">
      {mini_card('DPS — מ\' למשיכה', fat['first_dps'], fat['last_dps'], fat['dps_chg'], 'מ')}
      {mini_card('SPM — משיכות/דקה', fat['first_spm'], fat['last_spm'], fat['spm_chg'], '', True)}
    </div>
  </div>"""

    # ── 3. Cardiac Efficiency per lap ──
    eff_insight = eff.get('eff_insight', '')
    if not eff_insight and eff.get('chg') is not None:
        eff_insight = ("✓ יעילות יציבה — לב עובד ביחס קבוע למהירות" if eff['chg'] > -5 else
                       f"⚠️ יעילות ירדה {abs(eff['chg']):.0f}% — עומס קרדיו עולה בסוף")

    effs = [l['eff'] for l in laps if l.get('eff')]
    max_eff = max(effs, default=1)
    eff_rows = ""
    for l in laps:
        e = l.get('eff')
        if not e: continue
        pct = e / max_eff
        eff_color = "#00D4FF" if pct > 0.95 else ("#66bb6a" if pct > 0.85 else ("#ffa726" if pct > 0.75 else "#ef5350"))
        eff_rows += (
            f'<tr style="border-bottom:1px solid rgba(255,255,255,0.05)">'
            f'<td style="padding:5px 8px;color:#90a4ae;font-size:0.82em">ק"מ {l["n"]}</td>'
            f'<td style="padding:5px 8px">'
            f'  <div style="display:inline-block;height:10px;width:{max(4,round(pct*180))}px;'
            f'background:{eff_color};border-radius:3px;vertical-align:middle"></div>'
            f'  &nbsp;<span style="font-size:0.84em;color:{eff_color}">{e}</span>'
            f'</td>'
            f'<td style="padding:5px 8px;font-size:0.8em;color:#78909c">{l["speed"]} ÷ {l["hr"]}bpm</td>'
            f'</tr>'
        )

    eff_html = f"""
  <div class="section">
    <div class="section-title">⚡ יעילות לב (מהירות ÷ דופק × 100)</div>
    <div class="section-insight">{eff_insight}</div>
    <div style="font-size:0.81em;color:#78909c;margin-bottom:10px">
      התחלה: <strong style="color:#e0e0e0">{eff['first']}</strong>
      → סוף: <strong style="color:{'#66bb6a' if (eff.get('chg') or 0) >= 0 else '#ef5350'}">{eff['last']}</strong>
      &nbsp;{arrow(eff.get('chg'))}
    </div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>
        <th style="padding:5px 8px;text-align:right;font-size:0.78em;color:#546e7a;font-weight:400"></th>
        <th style="padding:5px 8px;font-size:0.78em;color:#546e7a;font-weight:400">יעילות</th>
        <th style="padding:5px 8px;font-size:0.78em;color:#546e7a;font-weight:400">פירוט</th>
      </tr></thead>
      <tbody>{eff_rows}</tbody>
    </table>
  </div>"""

    # ── 4. HR Zone Distribution ──
    hr_zones = analysis.get('hr_zones', {})
    z_colors = {1:'#37474f', 2:'#1565c0', 3:'#2e7d32', 4:'#e65100', 5:'#b71c1c'}
    z_names  = {1:'Z1 — מנוחה (<60%)', 2:'Z2 — אירובי (60-70%)',
                3:'Z3 — סף אירובי (70-80%)', 4:'Z4 — סף לקטי (80-90%)', 5:'Z5 — אנאירובי (>90%)'}

    # SUP-specific zone targets per workout type
    if wtype == 'אירובי':
        target_note = "יעד: Z2 ≥70% | SUP אירובי בסיסי = בונה עמידות משיכה ב-60-70% HRmax"
        z2_ok = hr_zones.get(2, 0) >= 60
        z3_warn = hr_zones.get(3, 0) + hr_zones.get(4, 0) + hr_zones.get(5, 0) > 25
        zone_verdict = ("✓ חלוקת עומס אירובי נכונה — בסיס לשיפור DPS ועמידות" if z2_ok and not z3_warn else
                        "⚠️ עומס גבוה מדי לאימון אירובי — שקול להאט ולהתמקד בטכניקה" if z3_warn else
                        "⚡ Z2 נמוך — שקול להגביר קצב קל לבניית בסיס אירובי")
    elif wtype == 'אירובי ארוך':
        target_note = "יעד: Z2 ≥75% | מרחקים ארוכים ב-SUP דורשים יעילות משיכה מקסימלית בדופק נמוך"
        zone_verdict = ("✓ שמירה על Z2 לאורך המרחק — יעילות אנרגטית גבוהה" if hr_zones.get(2, 0) >= 65 else
                        "⚠️ Z2 נמוך לאימון ארוך — עלות אנרגטית גבוהה מדי")
    elif wtype == 'טמפו':
        target_note = "יעד: Z3-Z4 ≥60% | טמפו SUP = חתירה מתמשכת בסף הלקטי"
        z34 = hr_zones.get(3, 0) + hr_zones.get(4, 0)
        zone_verdict = ("✓ עומס טמפו נכון — חתירה בסף הלקטי" if z34 >= 55 else
                        f"⚡ Z3+Z4 = {z34}% — אימון קצת קל מדי לטמפו, שקול להגביר")
    else:
        target_note = ""; zone_verdict = ""

    z_rows = ""
    for z in range(1, 6):
        pct_z = hr_zones.get(z, 0)
        if pct_z == 0: continue
        z_rows += (
            f'<div class="zone-row">'
            f'<div class="zbar-bg"><div class="zbar" style="width:{max(4,pct_z*2.8):.0f}px;background:{z_colors[z]}">'
            f'{pct_z}%</div></div>'
            f'</div>'
        )

    zones_html = f"""
  <div class="section">
    <div class="section-title">💓 אזורי דופק — התפלגות האימון</div>
    {z_rows}
  </div>""" if hr_zones else ""

    # ── 5. Aerobic Decoupling (Pa:HR) — אירובי/ארוך בלבד ──
    pa_hr = analysis.get('pa_hr')
    pa_html = ""
    if pa_hr is not None and wtype in ('אירובי', 'אירובי ארוך'):
        pa_color = "#66bb6a" if pa_hr < 5 else ("#ffa726" if pa_hr < 9 else "#ef5350")
        if pa_hr < 5:
            pa_verdict = "✓ מצוין — מערכת אירובית חזקה, מהירות נשמרת ביחס לדופק"
            pa_explain = "בחתירת SUP, Pa:HR<5% = הלב עובד ביחס קבוע למהירות לאורך כל האימון — בסיס אירובי חזק"
        elif pa_hr < 9:
            pa_verdict = "⚡ בינוני — אוורור אירובי מתפתח"
            pa_explain = "Pa:HR 5-9% = עייפות קרדיו-וסקולרית בינונית. בSUP זה מתבטא בעלייה בדופק בלי עלייה מקבילה במהירות/DPS"
        else:
            pa_verdict = "⚠️ דחייה אירובית — האימון היה קשה מדי לאירובי"
            pa_explain = "Pa:HR>9% = הלב מאמץ הרבה יותר בשליש האחרון לאותה מהירות. SUP: בדוק DPS בסוף האימון — סימן לעייפות טכנית+קרדיו"

        pa_html = f"""
  <div class="section">
    <div class="section-title">🫀 Aerobic Decoupling (Pa:HR)</div>
    <div class="section-insight" style="color:{pa_color}">{pa_verdict}</div>
    <div style="display:flex;align-items:center;gap:16px;margin:10px 0">
      <div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:14px 20px;text-align:center">
        <div style="font-size:2em;font-weight:700;color:{pa_color}">{pa_hr}%</div>
        <div style="font-size:0.72em;color:#78909c;margin-top:2px">Pa:HR Index</div>
      </div>
      <div style="font-size:0.8em;color:#90a4ae;line-height:1.55;flex:1">{pa_explain}</div>
    </div>
    <div style="font-size:0.75em;color:#37474f;display:flex;gap:8px">
      <span style="color:#66bb6a">▌</span><span style="color:#546e7a">&lt;5% מצוין</span>
      <span style="color:#ffa726">▌</span><span style="color:#546e7a">5-9% מתפתח</span>
      <span style="color:#ef5350">▌</span><span style="color:#546e7a">&gt;9% עומס יתר</span>
    </div>
  </div>"""

    return pacing_html + fatigue_html + eff_html + pa_html


# ===== SUP KNOWLEDGE BASE =====

_KB_CACHE: dict = {}

def load_knowledge() -> dict:
    """טוען data/sup_knowledge.json — מטמון בזיכרון לכל ריצה."""
    global _KB_CACHE
    if _KB_CACHE:
        return _KB_CACHE
    kb_path = Path("data/sup_knowledge.json")
    if kb_path.exists():
        try:
            _KB_CACHE = json.loads(kb_path.read_text(encoding="utf-8"))
        except Exception:
            _KB_CACHE = {}
    return _KB_CACHE

# מיפוי שמות עברי למפתחות JSON
_TYPE_MAP = {
    "אירובי":      "aerobic",
    "אירובי ארוך": "aerobic_long",
    "טמפו":        "tempo",
    "ספרינטים":    "sprints",
}


def build_research_html(workout_type: str, w: dict, lap_analysis: dict) -> str:
    """
    📚 סקשן "מה מחקר SUP אומר" — משווה מדדי האימון ל-benchmarks מהמאגר המקצועי.
    מוצג בתחתית המייל, אחרי כל ניתוחי הק"מ.
    """
    kb = load_knowledge()
    if not kb:
        return ""

    bm_key = _TYPE_MAP.get(workout_type, "")
    benchmarks = (kb.get("benchmarks") or {}).get(bm_key, {})
    insights   = [i for i in (kb.get("insights") or [])
                  if bm_key in (i.get("workout_types") or [])]

    if not benchmarks and not insights:
        return ""

    updated = kb.get("updated", "")

    def _cmp(actual, target, unit, label, low_good=False, fmt=".1f"):
        """כרטיס השוואה: ערך בפועל vs יעד."""
        if actual is None or target is None:
            return ""
        good = (actual <= target) if low_good else (actual >= target)
        color  = "#66bb6a" if good else ("#ffa726" if abs(actual - target) / target < 0.15 else "#ef5350")
        symbol = "✓" if good else ("⚡" if abs(actual - target) / target < 0.15 else "⚠️")
        arrow  = "↓" if low_good else "↑"
        tip    = f" ({arrow}{abs(actual - target):{fmt}}{unit} ליעד)" if not good else ""
        return (
            f'<div style="display:flex;justify-content:space-between;align-items:center;'
            f'padding:7px 10px;border-bottom:1px solid rgba(255,255,255,0.05)">'
            f'<span style="font-size:0.83em;color:rgba(230,238,250,0.6)">{label}</span>'
            f'<span style="font-size:0.83em">'
            f'<strong style="color:#e0e0e0">{actual:{fmt}}{unit}</strong>'
            f'<span style="color:#546e7a;margin:0 6px">vs יעד</span>'
            f'<span style="color:{color}">{target:{fmt}}{unit} {symbol}{tip}</span>'
            f'</span></div>'
        )

    rows = ""

    # DPS
    dps_actual = w.get("dps")
    dps_target = benchmarks.get("dps_m")
    rows += _cmp(dps_actual, dps_target, "מ'", "DPS — מרחק למשיכה", fmt=".2f")

    # SPM
    spm_actual = w.get("spm")
    spm_target = benchmarks.get("spm")
    rows += _cmp(spm_actual, spm_target, "", "SPM — משיכות לדקה", fmt=".0f")

    # Pa:HR
    pa_hr = (lap_analysis or {}).get("pa_hr")
    pa_target = benchmarks.get("pa_hr_pct")
    if pa_hr is not None and pa_target is not None:
        rows += _cmp(pa_hr, pa_target, "%", "Pa:HR — Aerobic Decoupling", low_good=True)

    # Pace CV
    pace_cv = (lap_analysis or {}).get("pace_cv")
    cv_target = benchmarks.get("pace_cv_pct")
    if pace_cv is not None and cv_target is not None:
        rows += _cmp(pace_cv, cv_target, "%", "Pace CV — עקביות קצב", low_good=True)

    # Z2 / Z34 / Z45
    hz = (lap_analysis or {}).get("hr_zones", {})
    if workout_type in ("אירובי", "אירובי ארוך"):
        z2_actual = hz.get(2)
        z2_target = benchmarks.get("z2_pct")
        rows += _cmp(z2_actual, z2_target, "%", "Z2 — בסיס אירובי", fmt=".0f")
    elif workout_type == "טמפו":
        z34_actual = (hz.get(3, 0) or 0) + (hz.get(4, 0) or 0)
        z34_target = benchmarks.get("z34_pct")
        rows += _cmp(z34_actual, z34_target, "%", "Z3+Z4 — אזור טמפו", fmt=".0f")
    elif workout_type == "ספרינטים":
        la = lap_analysis or {}
        sz = la.get("sprint_zones", {})
        z45_actual = (sz.get(4, 0) or 0) + (sz.get(5, 0) or 0)
        z45_target = benchmarks.get("z45_pct")
        rows += _cmp(z45_actual, z45_target, "%", "Z4+Z5 — עצימות ספרינטים", fmt=".0f")

    if not rows and not insights:
        return ""

    # תובנות מהמאגר (מקסימום 2)
    insight_items = ""
    for ins in insights[:2]:
        src = ins.get("source_domain", "")
        txt = ins.get("insight_he", "")
        if txt:
            src_span = f' <span style="color:#546e7a;font-size:0.88em">({src})</span>' if src else ''
            insight_items += (
                f'<li style="margin-bottom:7px;line-height:1.55;font-size:0.83em;color:rgba(230,238,250,0.7)">'
                f'{txt}{src_span}</li>'
            )

    sources_line = " | ".join(set(
        d for d in [i.get("source_domain","") for i in insights[:2]] if d
    ))

    return f"""
  <div class="section">
    <div class="section-title">📚 מחקר SUP — השוואה לבנצ'מארקים מקצועיים</div>
    <div class="section-insight">מבוסס על: {sources_line or "supracer.com | distancepaddler.com"}</div>
    {f'<div style="margin-bottom:10px">{rows}</div>' if rows else ''}
    {f'<ul style="margin:10px 0 0;padding-right:18px">{insight_items}</ul>' if insight_items else ''}
    <div style="font-size:0.72em;color:#37474f;margin-top:8px;text-align:left">
      עודכן: {updated}
    </div>
  </div>"""


# ===== WEATHER CONDITIONS (Open-Meteo) =====

def _wind_dir_he(deg):
    if deg is None: return ""
    dirs = ["צפון","צפון-מזרח","מזרח","דרום-מזרח","דרום","דרום-מערב","מערב","צפון-מערב"]
    return dirs[round(deg / 45) % 8]

def fetch_weather_conditions(date_str: str, hour: int, lat: float, lon: float, is_sea: bool) -> dict:
    """Open-Meteo archive — רוח + גלים לפי שעת האימון."""
    import urllib.request as _ur
    parts = date_str.split(".")
    iso = f"{parts[2]}-{parts[1]}-{parts[0]}"
    result = {}
    try:
        url = (f"https://archive-api.open-meteo.com/v1/archive"
               f"?latitude={lat:.4f}&longitude={lon:.4f}"
               f"&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m"
               f"&start_date={iso}&end_date={iso}"
               f"&timezone=Asia%2FJerusalem&wind_speed_unit=kmh")
        with _ur.urlopen(url, timeout=12) as r:
            h = __import__('json').loads(r.read())['hourly']
        times = h.get('time', [])
        target = f"{iso}T{hour:02d}:00"
        idx = times.index(target) if target in times else min(hour, len(times)-1)
        result['wind_kmh']       = round(h['wind_speed_10m'][idx], 1)  if h.get('wind_speed_10m')  else None
        result['wind_dir_deg']   = h['wind_direction_10m'][idx]         if h.get('wind_direction_10m') else None
        result['wind_dir_he']    = _wind_dir_he(result['wind_dir_deg'])
        result['wind_gusts_kmh'] = round(h['wind_gusts_10m'][idx], 1)  if h.get('wind_gusts_10m') else None
        result['temp_c']         = round(h['temperature_2m'][idx], 1)  if h.get('temperature_2m') else None
    except Exception as e:
        print(f"  [Weather] wind: {e}")

    if is_sea:
        try:
            url2 = (f"https://marine-api.open-meteo.com/v1/marine"
                    f"?latitude={lat:.4f}&longitude={lon:.4f}"
                    f"&hourly=wave_height,wave_period,wave_direction"
                    f"&start_date={iso}&end_date={iso}"
                    f"&timezone=Asia%2FJerusalem")
            with _ur.urlopen(url2, timeout=12) as r:
                h2 = __import__('json').loads(r.read())['hourly']
            times2 = h2.get('time', [])
            target2 = f"{iso}T{hour:02d}:00"
            idx2 = times2.index(target2) if target2 in times2 else min(hour, len(times2)-1)
            result['wave_height_m']  = round(h2['wave_height'][idx2], 2)  if h2.get('wave_height') else None
            result['wave_period_s']  = round(h2['wave_period'][idx2], 1)  if h2.get('wave_period') else None
            result['wave_dir_deg']   = h2['wave_direction'][idx2]          if h2.get('wave_direction') else None
            result['wave_dir_he']    = _wind_dir_he(result['wave_dir_deg'])
        except Exception as e:
            print(f"  [Weather] marine: {e}")

    return result


def build_weather_html(w: dict) -> str:
    """סקשן תנאי מים — רוח + גלים מ-Open-Meteo."""
    wind = w.get('wind_kmh')
    if wind is None:
        return ""

    gusts   = w.get('wind_gusts_kmh')
    dir_he  = w.get('wind_dir_he', '')
    wave_h  = w.get('wave_height_m')
    wave_p  = w.get('wave_period_s')
    wave_dir= w.get('wave_dir_he', '')
    temp_c  = w.get('temp_c')

    # Wind color
    wc = "#66bb6a" if wind < 15 else ("#ffa726" if wind < 25 else "#ef5350")
    wl = "קל" if wind < 15 else ("בינוני" if wind < 25 else "חזק")

    gusts_html = f'<div class="unt">נחשולים: {gusts} קמ"ש</div>' if gusts else ''
    wind_card = (f'<div class="card">'
                 f'<div class="lbl">רוח</div>'
                 f'<div class="val" style="font-size:20px;color:{wc}">{wind}</div>'
                 f'<div class="unt">קמ"ש {dir_he} · {wl}</div>'
                 f'{gusts_html}'
                 f'</div>')

    wave_card = ""
    if wave_h is not None:
        wvc = "#66bb6a" if wave_h < 0.4 else ("#ffa726" if wave_h < 0.8 else "#ef5350")
        wvl = "שטוח" if wave_h < 0.4 else ("גלים קטנים" if wave_h < 0.8 else "גלים גבוהים")
        wave_card = (f'<div class="card">'
                     f'<div class="lbl">גלים</div>'
                     f'<div class="val" style="font-size:20px;color:{wvc}">{wave_h}מ\'</div>'
                     f'<div class="unt">{wvl}{f" · {wave_p}שנ\'" if wave_p else ""}{f" · {wave_dir}" if wave_dir else ""}</div>'
                     f'</div>')

    temp_card = ""
    if temp_c is not None:
        tc = "#ef5350" if temp_c > 30 else ("#66bb6a" if temp_c > 18 else "#4fc3f7")
        temp_card = (f'<div class="card">'
                     f'<div class="lbl">טמפרטורה</div>'
                     f'<div class="val" style="font-size:20px;color:{tc}">{temp_c}°</div>'
                     f'<div class="unt">מעלות</div>'
                     f'</div>')

    chips = []
    if wind is not None:
        chips.append(f'💨 {wind} קמ"ש {dir_he}')
    if gusts:
        chips.append(f'שיאי רוח {gusts} קמ"ש')
    if wave_h is not None:
        chips.append(f'🌊 גל {wave_h}מ\'{(" · " + wave_dir) if wave_dir else ""}')
    if temp_c is not None:
        chips.append(f'🌡️ {temp_c}°C')
    chips_html = "".join(f'<span style="background:rgba(0,0,0,0.25);border-radius:14px;padding:3px 10px;font-size:11px;color:rgba(255,255,255,0.85);white-space:nowrap">{c}</span>' for c in chips)
    return f'<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">{chips_html}</div>'


# ===== WELLNESS (Body Battery + Sleep before workout) =====

def fetch_wellness_before_workout(api, workout_date_str: str) -> dict:
    """Fetch Body Battery + sleep for the night before the workout."""
    from datetime import datetime
    result = {}
    try:
        p = workout_date_str.split(".")
        date_iso = f"{p[2]}-{p[1]}-{p[0]}"

        # Sleep — Garmin date = that calendar day's sleep (previous night)
        sleep = api.get_sleep_data(date_iso)
        dto = (sleep or {}).get("dailySleepDTO", {})
        if dto:
            total = dto.get("sleepTimeSeconds", 0) or 0
            deep  = dto.get("deepSleepSeconds",  0) or 0
            rem   = dto.get("remSleepSeconds",   0) or 0
            result["sleep_hours"] = round(total / 3600, 1)
            result["deep_min"]    = round(deep / 60)
            result["deep_pct"]    = round(deep / total * 100) if total else 0
            result["rem_min"]     = round(rem / 60)
            scores = dto.get("sleepScores") or {}
            result["sleep_score"] = scores.get("overall", {}).get("value") if isinstance(scores.get("overall"), dict) else scores.get("overall")

        # Body Battery — last value (end of sleep = pre-workout level)
        bb_data = api.get_body_battery(date_iso)
        for entry in (bb_data or []):
            if entry.get("date") == date_iso:
                vals = entry.get("bodyBatteryValuesArray", [])
                if vals:
                    result["body_battery"] = vals[-1][1]
                result["bb_charged"] = entry.get("charged", 0)
                break

        # HRV — lastNight value (ms) + status (BALANCED/UNBALANCED/LOW/POOR)
        try:
            hrv_data = api.get_hrv_data(date_iso)
            summary  = (hrv_data or {}).get("hrvSummary", {})
            if summary:
                result["hrv_value"]  = summary.get("lastNight")       # ms
                result["hrv_status"] = summary.get("status", "")      # BALANCED etc.
                baseline = summary.get("baseline") or {}
                result["hrv_balanced_low"]  = baseline.get("balancedLow")
                result["hrv_balanced_high"] = baseline.get("balancedUpper")
        except Exception:
            pass  # שעון ללא תמיכת HRV

    except Exception as e:
        print(f"  [Wellness] {e}")
    return result


def date_to_iso(d: str) -> str:
    """DD.MM.YYYY → YYYY-MM-DD לצורך השוואה נכונה"""
    parts = d.split(".")
    if len(parts) == 3:
        return f"{parts[2]}-{parts[1]}-{parts[0]}"
    return d

def get_latest_saved_date(path: Path) -> str | None:
    """קרא את תאריך האימון האחרון מהקובץ הקיים (מחזיר ISO להשוואה)"""
    try:
        with open(path, "r", encoding="utf-8") as f:
            existing = json.load(f)
        ws = existing.get("workouts", [])
        if ws:
            return date_to_iso(ws[0].get("date", ""))  # ממוין newest-first
    except Exception:
        pass
    return None


# ===== GIT PUSH via GitHub API =====
GITHUB_REPO = "maximmaxster/sup-challenge"

def _github_fetch_races(filepath: Path) -> list | None:
    """Fetch races array from GitHub — source of truth when edited via website UI."""
    import base64, urllib.request
    if not GITHUB_TOKEN:
        return None
    url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{filepath}"
    try:
        req = urllib.request.Request(url, headers={"Authorization": f"token {GITHUB_TOKEN}", "User-Agent": "SUP-Sync/1.0"})
        with urllib.request.urlopen(req) as resp:
            info = json.loads(resp.read())
            remote_data = json.loads(base64.b64decode(info["content"]))
            return remote_data.get("races")
    except Exception as e:
        print(f"  GitHub fetch races ({filepath}): {e}")
        return None

def _github_push_file(filepath: Path, commit_msg: str) -> bool:
    """Push a single file to GitHub via API (works without local git repo)."""
    import base64
    import urllib.request
    url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{filepath}"
    headers = {
        "Authorization": f"token {GITHUB_TOKEN}",
        "Content-Type": "application/json",
        "User-Agent": "SUP-Sync/1.0",
    }
    # Get current SHA
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            sha = json.loads(resp.read())["sha"]
    except Exception:
        sha = None

    content = base64.b64encode(filepath.read_bytes()).decode()
    body = json.dumps({"message": commit_msg, "content": content, **({"sha": sha} if sha else {})}).encode()
    req = urllib.request.Request(url, data=body, headers=headers, method="PUT")
    try:
        with urllib.request.urlopen(req):
            return True
    except Exception as e:
        print(f"  GitHub API error ({filepath}): {e}")
        return False

def git_push():
    if not GITHUB_TOKEN:
        print("\nGITHUB_TOKEN לא מוגדר — דולג על push")
        return
    timestamp = datetime.now().strftime("%d/%m/%Y %H:%M")
    msg = f"sync: עדכון SUP — {timestamp}"
    files = [Path("data/athlete1.json"), Path("data/athlete2.json")]
    for f in files:
        if f.exists():
            ok = _github_push_file(f, msg)
            print(f"  push {f.name}: {'OK' if ok else 'FAILED'}")


# ===== MAIN =====
def main():
    import fcntl
    lock_path = Path("/tmp/garmin_sync.lock")
    lock_file = open(lock_path, "w")
    try:
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        print("garmin_sync כבר רץ — יוצא")
        sys.exit(0)

    print("=" * 50)
    print("SUP Training — Garmin Sync")
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
    athlete1_types = {}  # תאריך → סוג, ממקסים — יועבר לויקטור
    for i, cfg in enumerate(ATHLETES):
        to_email = ATHLETE_EMAILS.get(cfg["name"])
        try:
            # שמור תאריך אחרון לפני עדכון — לזיהוי אימונים חדשים
            last_date = get_latest_saved_date(cfg["output"])

            # ויקטור יורש סיווגים ממקסים לתאריכים משותפים
            shared = athlete1_types if i > 0 else {}
            data, api = fetch_athlete(cfg, shared_types=shared)
            save_json(data, cfg["output"])

            # שמור מיפוי תאריך→סוג של מקסים לשימוש בויקטור
            if i == 0:
                athlete1_types = {w["date"]: w["type"] for w in data["workouts"]}

            # שלח מייל לספורטאים ב-ATHLETE_EMAILS
            if to_email and data.get("workouts"):
                new_ws = []
                for w in data["workouts"]:
                    if last_date is None or date_to_iso(w["date"]) > last_date:
                        new_ws.append(w)
                    else:
                        break  # ממוין newest-first
                analysis_updated = False
                for w in new_ws:
                    if w.get("distance", 0) > 0:  # דלג על אימונים ריקים
                        print(f"  [Email] אימון חדש — {w['date']} {w['type']}")
                        wellness     = fetch_wellness_before_workout(api, w["date"])
                        lap_analysis = fetch_lap_analysis(api, w["id"], workout_type=w.get("type", ""), total_dist_km=w.get("distance", 0))
                        _lat = w.get("lat")
                        _lon = w.get("lon")
                        if w.get("location") == "ים" and _lat and _lon:
                            weather_cond = fetch_weather_conditions(
                                w["date"], w.get("start_hour", 10),
                                _lat, _lon, is_sea=True
                            )
                            if weather_cond:
                                w.update(weather_cond)
                            print(f"  [Weather] רוח={weather_cond.get('wind_kmh')}קמ\"ש {weather_cond.get('wind_dir_he','')} | גל={weather_cond.get('wave_height_m','—')}מ'")
                        if wellness:
                            print(f"  [Wellness] BB={wellness.get('body_battery','?')} שינה={wellness.get('sleep_hours','?')}h עמוקה={wellness.get('deep_pct','?')}%")
                        if lap_analysis:
                            if lap_analysis.get('sprints'):
                                print(f"  [Laps] {len(lap_analysis['sprints'])} ספרינטים")
                            elif lap_analysis.get('laps'):
                                print(f"  [Laps] {len(lap_analysis['laps'])} קטעים | {lap_analysis.get('pacing',{}).get('pattern','')}")
                            # שמור מדדי ניתוח ב-workout dict לצורך הדו"ח החודשי
                            hz = lap_analysis.get('hr_zones', {})
                            w['hr_z1']  = hz.get(1, 0); w['hr_z2'] = hz.get(2, 0)
                            w['hr_z3']  = hz.get(3, 0); w['hr_z4'] = hz.get(4, 0)
                            w['hr_z5']  = hz.get(5, 0)
                            w['pa_hr']   = lap_analysis.get('pa_hr')
                            w['pace_cv'] = lap_analysis.get('pace_cv')
                            w['dps_cv']  = lap_analysis.get('dps_cv')
                        # weather fields already merged via w.update(weather_cond) above
                            if lap_analysis.get('sprints'):
                                smry = lap_analysis.get('summary', {})
                                w['sprint_count']     = smry.get('count', 0)
                                w['peak_speed']       = smry.get('peak_speed', 0)
                                w['sprint_avg_speed'] = smry.get('avg_speed', 0)
                                w['sprint_spm_max']   = smry.get('avg_spm', 0)
                                w['sprint_avg_hr']    = smry.get('avg_hr', 0)
                        analysis_updated = True  # always save after email (weather/wellness/lap data)
                        send_workout_email(to_email, cfg["name"], w,
                                           all_workouts=data.get("workouts", []),
                                           wellness=wellness,
                                           lap_analysis=lap_analysis)

                # שמור מחדש עם מדדי הניתוח שנוספו
                if analysis_updated:
                    save_json(data, cfg["output"], skip_merge=True)
                    print("  [JSON] נשמר מחדש עם מדדי ניתוח")

        except Exception as e:
            print(f"  שגיאה: {e}")
            ok = False

    git_push()
    if ok:
        print("\n✓ סנכרון הושלם!")
    else:
        print("\n⚠ סנכרון הושלם עם שגיאות")
        sys.exit(1)


if __name__ == "__main__":
    main()
