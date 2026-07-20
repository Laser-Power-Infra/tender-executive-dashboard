import os
import base64
import numpy as np
import cv2
import easyocr
from playwright.sync_api import sync_playwright

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files\Chromium\Application\chrome.exe",
]

ALLOWLIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

_reader = None


def get_reader():
    global _reader
    if _reader is None:
        print("[OCR] Initializing EasyOCR...")
        _reader = easyocr.Reader(["en"], gpu=False)
    return _reader


def detect_chrome_path():
    env_path = os.environ.get("CHROME_PATH")
    if env_path and os.path.exists(env_path):
        return env_path
    for p in CHROME_CANDIDATES:
        if os.path.exists(p):
            return p
    raise FileNotFoundError(
        "Chrome not found. Please install Chrome or set CHROME_PATH env variable."
    )


def ocr_captcha(base64_data: str) -> str:
    raw = np.frombuffer(base64.b64decode(base64_data), np.uint8)
    img = cv2.imdecode(raw, cv2.IMREAD_COLOR)
    if img is None:
        return ""

    reader = get_reader()

    candidates = []

    def raw(img):
        return img

    def gray(img):
        return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    def otsu(img):
        g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        _, t = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        return t

    def adaptive(img):
        g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        return cv2.adaptiveThreshold(g, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                     cv2.THRESH_BINARY, 11, 2)

    def upscale(img):
        return cv2.resize(img, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)

    def upscale_otsu(img):
        up = cv2.resize(img, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
        g = cv2.cvtColor(up, cv2.COLOR_BGR2GRAY)
        _, t = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        return t

    def clahe(img):
        g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        return clahe.apply(g)

    def gray_upscale_otsu(img):
        g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        up = cv2.resize(g, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
        _, t = cv2.threshold(up, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        return t

    methods = [
        ("raw", raw),
        ("gray", gray),
        ("otsu", otsu),
        ("adaptive", adaptive),
        ("clahe", clahe),
        ("upscale+otsu", upscale_otsu),
        ("gray+upscale+otsu", gray_upscale_otsu),
    ]

    for name, fn in methods:
        try:
            processed = fn(img)
            result = reader.readtext(processed, detail=1, allowlist=ALLOWLIST)
            if result:
                candidates.append((result[0][1].strip(), result[0][2], name))
        except Exception:
            pass

    if not candidates:
        return ""

    best = max(candidates, key=lambda c: c[1])
    text, conf, method = best
    cleaned = "".join(ch for ch in text if ch.isalnum())
    print(f"  [OCR] '{cleaned}'  (conf: {conf:.2%}, method: {method})")
    return cleaned


def search_tender(website: str, reference_no: str) -> dict:
    chrome_path = os.environ.get("CHROME_PATH") or detect_chrome_path()
    print(f"[Non-GEM] Chrome path: {chrome_path}")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            executable_path=chrome_path,
            headless=False,
        )
        page = browser.new_page()

        try:
            print(f"[Non-GEM] Navigating to {website}")
            page.goto(website, wait_until="networkidle", timeout=60000)

            print("[Non-GEM] Clicking Advanced Search...")
            page.locator("a[title='Advanced Search']").click()
            page.wait_for_timeout(2000)

            page.locator("#TenderType").select_option("1")
            page.locator("#tenderId").fill(reference_no)

            for attempt in range(1, 6):
                if attempt > 1:
                    print(f"[Non-GEM] Captcha retry {attempt}/5")
                    page.locator("button[name='captcha']").click()
                    page.wait_for_timeout(2000)

                captcha_img = page.locator("#captchaImage")
                if not captcha_img.is_visible():
                    continue

                src = captcha_img.get_attribute("src")
                if not src:
                    continue

                captcha_text = ocr_captcha(src.replace("data:image/png;base64,", ""))
                if not captcha_text:
                    print(f"  OCR returned empty, retrying")
                    continue

                page.locator("#captchaText").fill(captcha_text)
                page.locator("#submit").click()
                page.wait_for_timeout(3000)

                error_visible = page.locator("span.error").first.is_visible()
                if not error_visible:
                    print(f"[Non-GEM] Search submitted successfully!")
                    return {
                        "success": True,
                        "captcha_detected": captcha_text,
                        "attempts": attempt,
                        "error": None,
                    }

                print(f"  Attempt {attempt}: invalid captcha")

            return {
                "success": False,
                "captcha_detected": None,
                "attempts": 5,
                "error": "Captcha failed after 5 attempts",
            }

        except Exception as e:
            return {
                "success": False,
                "captcha_detected": None,
                "attempts": 0,
                "error": str(e),
            }
        finally:
            browser.close()
