"""
garmin_sync.py — SUP Challenge Garmin Sync
מתחבר לשני חשבונות Garmin Connect, מסנן SUP, שומר JSON + git push.
פורמט זהה לקובץ האקסל ניתוח_אימוני_SUP.
"""

import os
import sys
import io
import json
import subprocess
from datetime import datetime, timezone
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

# ===== CONFIG =====
ATHLETES = [
    {
        "name": os.getenv("ATHLETE1_NAME", "מקסים רפופורט"),
        "email": os.getenv("GARMIN_EMAIL_1"),
        "password": os.getenv("GARMIN_PASSWORD_1"),
        "output": Path("data/athlete1.json"),
        "profile_image": "images/athlete1_profile.jpg",
        "token_dir": Path(".garth_tokens_1"),
    },
    {
        "name": os.getenv("ATHLETE2_NAME", "ויקטור מוראטוב"),
        "email": os.getenv("GARMIN_EMAIL_2"),
        "password": os.getenv("GARMIN_PASSWORD_2"),
        "output": Path("data/athlete2.json"),
        "profile_image": "images/athlete2_profile.jpg",
        "token_dir": Path(".garth_tokens_2"),
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
def detect_type(z4_str: str, z5_str: str, avg_hr: int, dist_km: float, dur_sec: int) -> str:
    z4_sec = hms_to_sec(z4_str)
    z5_sec = hms_to_sec(z5_str)

    if z5_sec > 30:
        return "ספרינטים"
    if z4_sec > 1200:  # >20 min in Z4 = tempo
        return "טמפו"
    if dist_km > 11:
        return "אירובי ארוך"
    return "אירובי"


# ===== PARSE ACTIVITY =====
def parse_activity(act: dict, zones: list) -> dict:
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
    workout_type = detect_type(z4, z5, avg_hr, dist_km, dur_sec)

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
            w = parse_activity(act, zones)
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
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  שמור: {path}  ({len(data['workouts'])} אימונים)")


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
        try:
            data = fetch_athlete(cfg)
            save_json(data, cfg["output"])
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
