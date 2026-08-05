import sys, json, os
import cv2
import numpy as np
import easyocr

reader = easyocr.Reader(['en'], gpu=False)

captcha_dir = r"D:\tender-executive-dashboard\v2\captcha-debug"
raw_files = sorted([
    f for f in os.listdir(captcha_dir)
    if f.startswith("captcha_raw_") and f.endswith(".png")
])

if not raw_files:
    print("No captcha_raw_*.png files found in captcha-debug/")
    sys.exit(1)

ALLOWLIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

def ocr(img):
    result = reader.readtext(img, detail=1, allowlist=ALLOWLIST)
    text = ""
    conf = 0.0
    if result:
        text = "".join(line[1] for line in result)
        conf = result[0][2]
    return text, conf

# --- Preprocessing methods ---
def method_raw(img):
    return img

def method_gray(img):
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

def method_otsu(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return thresh

def method_adaptive(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                 cv2.THRESH_BINARY, 11, 2)

def method_upscale2x(img):
    return cv2.resize(img, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)

def method_upscale2x_otsu(img):
    up = cv2.resize(img, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(up, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return thresh

def method_clahe(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    return clahe.apply(gray)

def method_gray_upscale_otsu(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    up = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    _, thresh = cv2.threshold(up, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return thresh

methods = [
    ("raw", method_raw),
    ("gray", method_gray),
    ("otsu", method_otsu),
    ("adaptive", method_adaptive),
    ("upscale2x", method_upscale2x),
    ("upscale2x+otsu", method_upscale2x_otsu),
    ("clahe", method_clahe),
    ("gray+upscale2x+otsu", method_gray_upscale_otsu),
]

for fname in raw_files:
    path = os.path.join(captcha_dir, fname)
    original = cv2.imread(path)
    print(f"\n=== {fname} ===")
    best_conf = 0.0
    best_text = ""
    best_method = ""
    for mname, fn in methods:
        processed = fn(original)
        text, conf = ocr(processed)
        marker = " <-- BEST" if conf > best_conf else ""
        if conf > best_conf:
            best_conf = conf
            best_text = text
            best_method = mname
        print(f"  {mname:25s}: \"{text:12s}\"  conf: {conf:.2%}{marker}")
    print(f"  {'=> BEST':25s}: \"{best_text:12s}\"  conf: {best_conf:.2%}  ({best_method})")
