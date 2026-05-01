"""
שליפת Garmin OAuth token מ-Chrome cookies — ללא סגירת Chrome
"""
import os, json, shutil, sqlite3, base64, sys, requests
from pathlib import Path

def get_chrome_encryption_key():
    local_state = Path.home() / "AppData/Local/Google/Chrome/User Data/Local State"
    with open(local_state, encoding="utf-8") as f:
        state = json.load(f)
    encrypted_key = base64.b64decode(state["os_crypt"]["encrypted_key"])[5:]  # Remove DPAPI prefix
    import win32crypt
    return win32crypt.CryptUnprotectData(encrypted_key, None, None, None, 0)[1]

def decrypt_cookie(key, encrypted):
    if encrypted[:3] == b'v10' or encrypted[:3] == b'v11':
        from Crypto.Cipher import AES
        iv = encrypted[3:15]
        payload = encrypted[15:-16]
        tag = encrypted[-16:]
        cipher = AES.new(key, AES.MODE_GCM, iv)
        return cipher.decrypt_and_verify(payload, tag).decode("utf-8")
    else:
        import win32crypt
        return win32crypt.CryptUnprotectData(encrypted, None, None, None, 0)[1].decode("utf-8")

def get_garmin_cookies():
    # העתק את קובץ ה-Cookies (נסה דרכים שונות)
    cookie_src = Path.home() / "AppData/Local/Google/Chrome/User Data/Default/Network/Cookies"
    cookie_tmp = Path("chrome_cookies_tmp.db")

    # נסה להעתיק
    try:
        shutil.copy2(cookie_src, cookie_tmp)
    except PermissionError:
        # Chrome נעול — נסה לפתוח ישירות במצב read-only
        print("Chrome פתוח — מנסה גישה ישירה...")
        import ctypes
        # נסה SQLITE_OPEN_READONLY + URI
        cookie_src_uri = f"file:{cookie_src}?mode=ro&immutable=1"
        try:
            conn = sqlite3.connect(cookie_src_uri, uri=True)
        except Exception as e:
            print(f"לא ניתן לגשת לקובץ: {e}")
            return {}
        cookies = {}
        try:
            key = get_chrome_encryption_key()
            cur = conn.cursor()
            cur.execute("SELECT name, encrypted_value FROM cookies WHERE host_key LIKE '%garmin%'")
            for name, enc_val in cur.fetchall():
                try:
                    cookies[name] = decrypt_cookie(key, enc_val)
                except Exception:
                    pass
        finally:
            conn.close()
        return cookies

    # קובץ הועתק — פתח ועבד
    cookies = {}
    try:
        key = get_chrome_encryption_key()
        conn = sqlite3.connect(cookie_tmp)
        cur = conn.cursor()
        cur.execute("SELECT name, encrypted_value FROM cookies WHERE host_key LIKE '%garmin%'")
        for name, enc_val in cur.fetchall():
            try:
                cookies[name] = decrypt_cookie(key, enc_val)
            except Exception:
                pass
        conn.close()
    finally:
        cookie_tmp.unlink(missing_ok=True)
    return cookies

def test_garmin_api(cookies):
    """בדוק שה-cookies עובדים מול Garmin API"""
    s = requests.Session()
    for name, val in cookies.items():
        s.cookies.set(name, val, domain='.garmin.com')

    r = s.get(
        "https://connect.garmin.com/gc-api/activitylist-service/activities/search/activities"
        "?limit=3&activityType=stand_up_paddleboarding",
        headers={"nk": "NT", "Accept": "application/json"}
    )
    print(f"Status: {r.status_code}")
    if r.status_code == 200:
        data = r.json()
        print(f"נמצאו {len(data)} אימונים:")
        for a in data:
            print(f"  {a.get('startTimeLocal', '')[:10]} — {a.get('distance', 0)/1000:.2f} ק\"מ")
        return True
    else:
        print(f"Response: {r.text[:200]}")
        return False

if __name__ == "__main__":
    print("שולף cookies מ-Chrome...")
    cookies = get_garmin_cookies()
    print(f"נמצאו {len(cookies)} cookies של גרמין")

    if not cookies:
        print("לא נמצאו cookies — וודא שמחובר לגרמין בדפדפן")
        sys.exit(1)

    print("בודק חיבור ל-Garmin API...")
    if test_garmin_api(cookies):
        print("\nהצלחה! ה-cookies עובדים.")
    else:
        print("\nנכשל — ייתכן שהסשן פג")
