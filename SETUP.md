# SUP Challenge — מדריך התקנה

## 1. שכפול והתקנת Python

```bash
pip install -r requirements.txt
```

## 2. הגדרת סיסמאות

```bash
cp .env.example .env
# ערוך את .env עם הפרטים שלך
```

## 3. בדיקת חיבור לגרמין

```bash
python garmin_sync.py
```
הסקריפט יתחבר לשני חשבונות, ישמור `data/athlete1.json` ו-`data/athlete2.json`, וידחוף ל-GitHub.

## 4. הגדרת Task Scheduler (Windows) לריצה כל 6 שעות

1. פתח **Task Scheduler** → Create Basic Task
2. Trigger: Daily, repeat every **6 hours**
3. Action: `python C:\path\to\sup-challenge\garmin_sync.py`
4. Working directory: `C:\path\to\sup-challenge`

## 5. פריסה ל-Netlify

1. דחוף את הפרויקט ל-GitHub (ללא `.env`)
2. ב-Netlify: **New site from Git** → בחר את הריפו
3. Build command: *(ריק)*
4. Publish directory: `.`
5. לחץ **Deploy**

האתר יתעדכן אוטומטית בכל `git push`.

## מבנה JSON (data/athlete1.json)

```json
{
  "name": "שם החותר",
  "profile_image": "images/athlete1_profile.jpg",
  "last_sync": "2026-05-01T12:00:00Z",
  "workouts": [
    {
      "id": "...",
      "date": "YYYY-MM-DD",
      "type": "אירובי | אירובי ארוך | טמפו | ספרינטים",
      "distance": 8.2,
      "duration": 72,
      "avg_speed": 6.83,
      "max_speed": 9.1,
      "avg_hr": 142,
      "dps": 3.21,
      "spm": 46,
      "location": "ים | נחל",
      "lat": 32.15
    }
  ]
}
```

## תמונות

- `images/athlete1_profile.jpg` — תמונת פרופיל חותר 1 (מומלץ 200×200px)
- `images/athlete2_profile.jpg` — תמונת פרופיל חותר 2
- `images/gallery/` — תמונות גלריה (jpg/png/webp)
