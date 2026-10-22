"""Builds the landing hero's random quotes (api/page.php picks one per
request) from the quotes spreadsheet: backend-php/data/quotes-fa.txt and
quotes-en.txt, one "sentence<TAB>author" per line. Only short sentences
are kept so the hero pill stays one or two lines on a phone.

    python -I deploy/make-quotes.py path/to/10000_jomle_bozorgan.xlsx
"""
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

MAX_LEN = 80  # characters, the same cap as the panel's eyebrow field
# Topics that fit a personal-development landing page; politics, religion,
# war, love/marriage and the rest are left out.
TOPICS = {"انگیزشی و موفقیت", "زندگی و خودشناسی", "دوستی و انسانیت", "حکمت و اخلاق",
          "شادی و آرامش", "کار و پشتکار", "ترس، رنج و شجاعت", "دانش، علم و آموزش",
          "زمان، مرگ و گذر عمر"}
# Speakers left out whatever they said (matched on the "short intro" column):
# revolutionaries, dictators, religious figures, and other charged names.
SKIP_INTRO_PARTS = ("انقلاب", "اسرائیل", "شوروی", "پیامبر", "امام", "خلیفه", "کلیسا")
SKIP_INTROS = {"رهبر لیبی", "رهبر ویتنام", "رهبر چین", "رئیس‌جمهور عراق", "رئیس‌جمهور روسیه",
               "فرمانده نظامی آلمانی", "بنیان‌گذار امپراتوری مغول", "بنیان‌گذار تیموریان",
               "تزار روسیه", "فیلسوف و اقتصاددان آلمانی", "فقیه و عارف ایرانی"}
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend-php", "data")


def col(ref):
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group(0):
        n = n * 26 + ord(ch) - 64
    return n - 1


def first_sheet_rows(path):
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        shared = ["".join(t.text or "" for t in si.iter(NS + "t"))
                  for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(NS + "si")]
    for row in ET.fromstring(z.read("xl/worksheets/sheet1.xml")).iter(NS + "row"):
        cells = {}
        for c in row.iter(NS + "c"):
            v = c.find(NS + "v")
            if c.get("t") == "s" and v is not None:
                cells[col(c.get("r"))] = shared[int(v.text)]
            elif c.get("t") == "inlineStr":
                cells[col(c.get("r"))] = "".join(x.text or "" for x in c.iter(NS + "t"))
            elif v is not None:
                cells[col(c.get("r"))] = v.text
        yield cells


def clean(s):
    return re.sub(r"\s+", " ", (s or "").replace("\t", " ")).strip()


def main(path):
    fa, en = [], []
    rows = first_sheet_rows(path)
    next(rows)  # header
    for r in rows:
        intro = clean(r.get(6))
        if clean(r.get(7)) not in TOPICS or intro in SKIP_INTROS or any(p in intro for p in SKIP_INTRO_PARTS):
            continue
        text_fa, author_fa = clean(r.get(1)), clean(r.get(4))
        # English: the translation when the original isn't English, else the original.
        text_en, author_en = clean(r.get(3)) or clean(r.get(2)), clean(r.get(5))
        # Whole sentences only: a fragment cut from a longer passage reads
        # oddly on its own (the English shows it: lowercase start, no end mark).
        if not re.fullmatch(r"[A-Z“\"].{20,}[.!?”\"]", text_en) or "…" in text_en or "..." in text_en:
            continue
        if "«" in text_fa or "»" in text_fa:  # the hero adds its own quote marks
            continue
        if text_fa and author_fa and len(text_fa) <= MAX_LEN:
            fa.append(text_fa + "\t" + author_fa)
        if text_en and author_en and len(text_en) <= MAX_LEN and re.fullmatch(r"[\x20-\x7E‘-”–—…]+", text_en):
            en.append(text_en + "\t" + author_en)
    os.makedirs(OUT, exist_ok=True)
    for name, lines in (("quotes-fa.txt", fa), ("quotes-en.txt", en)):
        with open(os.path.join(OUT, name), "w", encoding="utf-8", newline="\n") as f:
            f.write("\n".join(lines) + "\n")
        print(name, len(lines))


if __name__ == "__main__":
    main(sys.argv[1])
