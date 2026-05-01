"""
כניסה ידנית לגרמין — מחקה דפדפן אמיתי ושומר טוקן
"""
import requests, json, re, os, sys
from pathlib import Path

TOKEN_DIR = Path("C:/Users/user/claude-projects/.garth_tokens")
CONFIG_FILE = Path("C:/Users/user/claude-projects/garmin_config.json")

def manual_garmin_login(email, password):
    s = requests.Session()
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
    })

    # שלב 1: GET דף SSO לקבלת CSRF token
    sso_url = (
        "https://sso.garmin.com/sso/embed"
        "?id=gauth-widget&embedWidget=true"
        "&gauthHost=https://sso.garmin.com/sso/embed"
        "&service=https://connect.garmin.com/modern"
        "&source=https://connect.garmin.com/signin"
        "&redirectAfterAccountLoginUrl=https://connect.garmin.com/modern"
        "&redirectAfterAccountCreationUrl=https://connect.garmin.com/modern"
    )

    print("שלב 1: מוריד דף SSO...")
    r1 = s.get(sso_url)
    print(f"  Status: {r1.status_code}")

    if r1.status_code == 429:
        print("  429 — גרמין עדיין חוסם. נסה מחר.")
        return False

    # שלב 2: חלץ CSRF token
    csrf_match = re.search(r'name="_csrf"\s+value="([^"]+)"', r1.text)
    csrf = csrf_match.group(1) if csrf_match else ""
    print(f"  CSRF: {'נמצא' if csrf else 'לא נמצא'}")

    # שלב 3: POST login
    print("שלב 2: שולח פרטי כניסה...")
    login_data = {
        "username": email,
        "password": password,
        "embed": "true",
        "_csrf": csrf,
        "rememberme": "on",
    }
    s.headers.update({
        "Referer": sso_url,
        "Origin": "https://sso.garmin.com",
        "Content-Type": "application/x-www-form-urlencoded",
    })

    r2 = s.post(sso_url, data=login_data)
    print(f"  Status: {r2.status_code}")

    if r2.status_code == 429:
        print("  429 — גרמין עדיין חוסם.")
        return False

    # שלב 4: חלץ ticket
    ticket_match = re.search(r'ticket=([A-Za-z0-9_\-]+)', r2.text) or \
                   re.search(r'"ticket"\s*:\s*"([A-Za-z0-9_\-]+)"', r2.text)

    if not ticket_match:
        # בדוק אם יש הפניה
        if "ST-" in r2.text or "TGT-" in r2.text:
            print("  נמצא ticket")
        else:
            print(f"  לא נמצא ticket. תוכן: {r2.text[:300]}")
            return False

    # שלב 5: קבל OAuth tokens עם garth
    print("שלב 3: ממיר ל-OAuth tokens...")
    try:
        import garth
        client = garth.Client()
        client.login(email, password)

        TOKEN_DIR.mkdir(exist_ok=True)
        client.dump(str(TOKEN_DIR))
        print(f"טוקן נשמר ב: {TOKEN_DIR}")
        return True
    except Exception as e:
        if "429" in str(e):
            print(f"garth 429 — אבל session ידנית עובד. נשמור cookies...")
            # שמור session cookies כחלופה
            cookie_data = {c.name: c.value for c in s.cookies}
            with open(TOKEN_DIR / "session_cookies.json", "w") as f:
                json.dump(cookie_data, f)
            print("Session cookies נשמרו.")
            return "cookies"
        raise


if __name__ == "__main__":
    with open(CONFIG_FILE) as f:
        creds = json.load(f)

    result = manual_garmin_login(creds["email"], creds["password"])
    if result:
        print("\nהצלחה! מעכשיו הסקריפט יעבוד אוטומטית.")
    else:
        print("\nנכשל — נסה שוב מאוחר יותר.")
