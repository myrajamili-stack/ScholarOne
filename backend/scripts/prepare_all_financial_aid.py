"""Prepare the reviewed ALL PDF snapshot; this command never writes to the database.

Requires pypdf only for PDF reading (not a running backend dependency).
Source boundaries and provider/state mappings below were reviewed against the PDF.
"""
from copy import deepcopy
import argparse
from datetime import datetime
import hashlib
import json
from pathlib import Path
import re

BACKEND = Path(__file__).resolve().parents[1]
DOCUMENT = "SCHOLARONE DATA - ALL .pdf"
EXPECTED_SHA = "d65c67284b2efc87ba3921e23227118e58501aa3f77e4ed93425f411e73f4b8f"
STATES = {"Seluruh Malaysia", "Johor", "Negeri Sembilan", "Melaka", "WP Kuala Lumpur", "Selangor", "Pahang", "Perak", "Kedah", "Pulau Pinang", "Perlis", "Kelantan", "Terengganu", "Sabah", "Sarawak"}

# page, exact start-of-entry text (PDF wraps normalized), provider, home eligibility,
# category. These are reviewed boundaries, not fuzzy automatic title guesses.
ENTRIES = [
    (59, "Perak State Higher Education Loan", "Perak State Government", "Perak", "Education Loan"),
    (60, "Kedah State Education Financing", "Kedah State Government – SPPNK", "Kedah", "Education Loan"),
    (62, "Yayasan Islam Negeri Kedah (YINK)", "Yayasan Islam Negeri Kedah (YINK)", "Kedah", "Education Loan"),
    (63, "Penang State Student Loan", "Penang State Government", "Pulau Pinang", "Education Loan"),
    (64, "Perlis State Education Loan", "Perlis State Government / Yayasan Islam Perlis (YIPs)", "Perlis", "Education Loan"),
    (65, "Perlis Education Loan Advance", "Perlis State Scholarship Fund", "Perlis", "Education Loan"),
    (66, "Yayasan Kelantan Darulnaim (YAKIN)", "Yayasan Kelantan Darulnaim (YAKIN)", "Kelantan", "Education Loan"),
    (68, "Yayasan Terengganu – Overseas", "Yayasan Terengganu", "Terengganu", "Education Loan"),
    (69, "Yayasan Terengganu – Domestic IPTA", "Yayasan Terengganu", "Terengganu", "Education Loan"),
    (70, "Yayasan Terengganu – Domestic IPTS", "Yayasan Terengganu", "Terengganu", "Education Loan"),
    (71, "Yayasan Terengganu – Skills Training", "Yayasan Terengganu", "Terengganu", "Education Loan"),
    (72, "Yayasan Sabah – Higher Education Loan", "Kumpulan Yayasan Sabah", "Sabah", "Education Loan"),
    (73, "Yayasan Sarawak – Domestic Education Loan", "Yayasan Sarawak", "Sarawak", "Education Loan"),
    (75, "Sarawak State Government Education Loan", "Sarawak State Government / State Public Service Commission", "Sarawak", "Education Loan"),
    (76, "Bantuan Kewangan Pelajar Kolej Komuniti", "Ministry of Education Malaysia (as named in PDF)", "All States", "Financial Assistance"),
    (76, "Bantuan Kewangan Asasi (BKA UA)", "Ministry of Higher Education (MOHE)", "All States", "Financial Assistance"),
    (78, "Bantuan Kewangan Asasi TVET", "Ministry of Higher Education (MOHE)", "All States", "Financial Assistance"),
    (79, "Bantuan Sara Hidup Mahasiswa Anak Negeri", "Yayasan Negeri Sembilan / Negeri Sembilan State Government", "Negeri Sembilan", "Financial Assistance"),
    (81, "Bantuan Sara Anak IPT (MAIM)", "Majlis Agama Islam Melaka (MAIM)", "Melaka", "Financial Assistance"),
    (82, "Skim Bantuan Kewangan Bulanan MAIWP", "Majlis Agama Islam Wilayah Persekutuan (MAIWP)", "Federal Territories", "Financial Assistance"),
    (83, "Bantuan Wang Saku – Zakat Selangor", "Lembaga Zakat Selangor (LZS)", "Selangor", "Financial Assistance"),
    (84, "Monthly Financial Assistance for Asnaf IPT Students", "Majlis Ugama Islam dan Adat Resam Melayu Pahang (MUIP)", "Pahang", "Financial Assistance"),
    (85, "MAIPk – Bantuan Persediaan Pengajian Tinggi", "Majlis Agama Islam dan Adat Melayu Perak (MAIPk)", "Perak", "Financial Assistance"),
    (86, "Skim Dermasiswa Pengajian Zakat MAINPP", "Majlis Agama Islam Negeri Pulau Pinang (MAINPP)", "Pulau Pinang", "Financial Assistance"),
    (87, "Dermasiswa Sultan Ismail Petra (DSIP) MAIK", "Majlis Agama Islam dan Adat Istiadat Melayu Kelantan (MAIK)", "Kelantan", "Financial Assistance"),
    (89, "Bantuan Kewangan Orang Kurang Upaya (BKOKU)", "Ministry of Higher Education (MOHE)", "All States", "Special Assistance"),
    (90, "PTPTN – Anak eKasih Scholarship", "Perbadanan Tabung Pendidikan Tinggi Nasional (PTPTN)", "All States", "Special Assistance"),
    (91, "JAKOA – Higher Education Financial Assistance", "Department of Orang Asli Development (JAKOA)", "All States", "Special Assistance"),
    (92, "JHEV ATM – Higher Education Admission Assistance", "Department of Veterans Affairs (JHEV ATM)", "All States", "Special Assistance"),
    (93, "MAINJ – IPT Registration Assistance 2026", "Majlis Agama Islam Negeri Johor (MAINJ)", "Johor", "Special Assistance"),
    (94, "Aspirasi Bantuan Kewangan Kemasukan ke IPT Negeri Sembilan", "Pejabat Menteri Besar Negeri Sembilan / Negeri Sembilan State Government", "Negeri Sembilan", "Special Assistance"),
    (95, "Bantuan Pendaftaran ke IPT untuk Anak Asnaf MAIM", "Majlis Agama Islam Melaka (MAIM)", "Melaka", "Special Assistance"),
    (96, "Bantuan Saraan Anak IPT MAIM", "Majlis Agama Islam Melaka (MAIM)", "Melaka", "Special Assistance"),
    (97, "MAIWP – Skim Bantuan Am Pelajaran IPT", "Majlis Agama Islam Wilayah Persekutuan (MAIWP)", "Federal Territories", "Special Assistance"),
    (98, "MAIWP – Emergency Assistance", "Majlis Agama Islam Wilayah Persekutuan (MAIWP)", "Federal Territories", "Special Assistance"),
    (99, "MAIWP – General Medical Assistance", "Majlis Agama Islam Wilayah Persekutuan (MAIWP)", "Federal Territories", "Special Assistance"),
    (100, "Iltizam Mahasiswa Selangor – Hadiah Pengajian", "Selangor State Government", "Selangor", "Special Assistance"),
    (101, "Lembaga Zakat Selangor – Bantuan Dermasiswa", "Lembaga Zakat Selangor (LZS)", "Selangor", "Special Assistance"),
    (102, "Biasiswa Khas Sagong Tasi – Higher Education", "Selangor State Government", "Selangor", "Special Assistance"),
    (103, "University-Level Emergency and Welfare Assistance", "Universiti Selangor (UNISEL)", "All States", "Special Assistance"),
    (104, "Title: Biasiswa Anak Yatim – Yayasan Pahang", "Yayasan Pahang", "Pahang", "Special Assistance"),
    (105, "Dermasiswa Pelajar Miskin IPT – Yayasan Pahang", "Yayasan Pahang", "Pahang", "Special Assistance"),
    (106, "MAIPk – Emergency / Immediate Assistance", "Majlis Agama Islam dan Adat Melayu Perak (MAIPk)", "Perak", "Special Assistance"),
    (106, "MAIPk – Disaster Assistance", "Majlis Agama Islam dan Adat Melayu Perak (MAIPk)", "Perak", "Special Assistance"),
    (107, "MAIK – Natural Disaster Assistance", "Majlis Agama Islam Negeri Kedah (MAIK)", "Kedah", "Special Assistance"),
    (108, "Ministry of Education – Special Financial Assistance", "Ministry of Education (as named in PDF)", "All States", "Special Assistance"),
    (109, "Penang State Government – i-Sejahtera OKU Assistance", "Penang State Government", "Pulau Pinang", "Special Assistance"),
    (109, "MAIPs – Disaster Assistance", "Majlis Agama Islam dan Adat Istiadat Melayu Perlis (MAIPs)", "Perlis", "Special Assistance"),
    (110, "YAKIN – Bantuan Pelajar IPT Kelantan", "Yayasan Kelantan Darulnaim (YAKIN)", "Kelantan", "Special Assistance"),
    (111, "Kelantan State Government – Tabung Serambi Mekah", "Kelantan State Government", "Kelantan", "Special Assistance"),
    (112, "MAIDAM – Medical and Chronic Illness Assistance", "Majlis Agama Islam dan Adat Melayu Terengganu (MAIDAM)", "Terengganu", "Special Assistance"),
    (113, "MAIDAM – Airfare Assistance for IPT Students", "Majlis Agama Islam dan Adat Melayu Terengganu (MAIDAM)", "Terengganu", "Special Assistance"),
    (114, "BUDI – One-off Higher Education Registration", "Sabah State Government", "Sabah", "Special Assistance"),
    (115, "SENTOSA – Higher Education Student Contribution", "Sabah State Government", "Sabah", "Special Assistance"),
    (116, "Special Financial Assistance for Sarawak Students (2026)", "Sarawak State Government / Yayasan Sarawak", "Sarawak", "Special Assistance"),
    (117, "Emergency Disaster Assistance – Tabung Baitulmal Sarawak", "Tabung Baitulmal Sarawak", "Sarawak", "Special Assistance"),
    (118, "Bantuan Khas Pembelian Tiket Penerbangan", "Ministry of Transport Malaysia (MOT)", "All States", "One-off Assistance"),
    (118, "Skim Dana Ehsan Pendidikan (SDEP) – Yayasan", "Yayasan Pelajaran MARA (YPM)", "All States", "One-off Assistance"),
    (119, "Skim Dermasiswa Dato' Haji Yusoff Hilmi – Co-", "Co-opbank Pertama (CBP)", "All States", "One-off Assistance"),
    (120, "Skim Bantuan Pendaftaran (SBP) – Yayasan Pelajaran", "Yayasan Pelajaran Johor (YPJ)", "Johor", "One-off Assistance"),
    (121, "Tabung Pendidikan Sarjana PDT (TPSPDT)", "Permodalan Darul Ta'zim (PDT) / Yayasan Raja Zarith Sofiah Negeri Johor", "Johor", "One-off Assistance"),
    (122, "Bantuan Kewangan Kemasukan ke IPT (Aspirasi IPT)", "Pejabat Menteri Besar Negeri Sembilan / Negeri Sembilan State Government", "Negeri Sembilan", "One-off Assistance"),
    (123, "Bantuan Ke Institusi Pengajian Tinggi (IPT) – TAPEM", "Tabung Amanah Pendidikan Negeri Melaka (TAPEM)", "Melaka", "One-off Assistance"),
    (124, "Skim Bantuan Awal IPT – Yayasan Wilayah", "Yayasan Wilayah Persekutuan (YWP)", "Federal Territories", "One-off Assistance"),
    (126, "Hadiah Pengajian Institut Pengajian Tinggi (HPIPT)", "Selangor State Government", "Selangor", "One-off Assistance"),
    (127, "Program Bantuan Yuran Pengajian (BYP)", "Selangor State Government – Jawatankuasa Tetap Kerajaan Prihatin", "Selangor", "One-off Assistance"),
    (129, "Geran Pra Siswazah & Pasca Siswazah – Yayasan", "Yayasan Pahang", "Pahang", "One-off Assistance"),
    (130, "Yayasan Perak – Insentif Siswa Yayasan Perak", "Yayasan Perak", "Perak", "One-off Assistance"),
    (132, "Bantuan Awal Kemasukan ke Institusi Pengajian", "Kedah State Government – SPPNK", "Kedah", "One-off Assistance"),
    (134, "Bantuan Pendaftaran Pelajar ke Institut Pengajian", "Penang State Government", "Pulau Pinang", "One-off Assistance"),
    (135, "Sumbangan Dana Pendidikan Kerajaan Negeri Perlis", "Perlis State Government", "Perlis", "One-off Assistance"),
    (137, "Bantuan Persediaan Yayasan Terengganu (BPYT)", "Yayasan Terengganu", "Terengganu", "One-off Assistance"),
    (138, "Bantuan Tunai Pendaftaran IPT Secara One-Off", "Sabah State Government", "Sabah", "One-off Assistance"),
    (140, "Bantuan Kemasukan ke IPT – Tabung Baitulmal Sarawak", "Tabung Baitulmal Sarawak", "Sarawak", "One-off Assistance"),
    (141, "Hadiah Galakan ke IPT (HGIPT) – Yayasan Sarawak", "Yayasan Sarawak", "Sarawak", "One-off Assistance"),
]

def compact(value):
    return re.sub(r"[^a-z0-9]", "", value.lower())

def clean_line(line):
    return re.sub(r"^(?:[\uF0B7•]\s*|-\s+|o\s+)", "", line.strip()).strip()

def join_lines(lines):
    # Rejoin PDF hard wraps without corrupting hyphens inside names and URLs.
    result = ""
    for line in lines:
        separator = "" if result.endswith(("-", "_", "/")) else " "
        result += (separator if result else "") + line
    return result

def repair_urls(lines):
    result = []
    for line in lines:
        if result and re.search(r"https?://\S+[-_/]$", result[-1]) and not re.match(r"(?:https?://|[A-Z][a-z]+\s)", line):
            result[-1] += line
        else:
            result.append(line)
    return result

LABEL = re.compile(r"^(Title|Provider|Sponsor|Deadline(?: / Application (?:Opening Date|Period|Date|Opening))?|Opening date|Funding amount|Funding type|Funding information|Description(?: of (?:the )?funding)?|Eligibility criteria|Eligibility|Link[s]?|Application links?|Target|Status|Application Period)(?::\s*(.*)|\s*)$", re.I)

def source_fields(lines):
    fields, current = {}, None
    for line in lines:
        match = LABEL.match(line)
        if match:
            current = match[1].lower()
            fields.setdefault(current, [])
            if match[2]: fields[current].append(match[2])
        elif current:
            fields[current].append(line)
    return fields

def field(fields, prefix):
    return next((value for key, value in fields.items() if key.startswith(prefix)), [])

def levels_from_funding(lines):
    result = []
    # Only the funding schedule / positive level list, never the full eligibility
    # text, which can mention excluded qualifications and parents' studies.
    text = "\n".join(line for line in lines if re.match(r"^(?:Certificate|Foundation|Diploma|Advanced Diploma|Bachelor|First Degree|Master|PhD|Postgraduate|SPM Excellence Award|STPM|STAM|Skills Certificate|Diploma-level Skills Training)", line, re.I))
    patterns = [
        ("Matriculation", r"Matriculation"), ("Foundation", r"Foundation|Asasi"),
        ("Advanced Diploma", r"Advanced Diploma"), ("Diploma", r"(?<!Advanced )\bDiploma\b"),
        ("Undergraduate", r"Bachelor|First Degree"), ("Master's", r"Master"),
        ("PhD", r"PhD|Doctoral"), ("Certificate", r"Certificate|SKM"),
        ("TVET", r"TVET|Skills Training|Skills Certificate"),
        ("Postgraduate", r"Postgraduate|Post-Graduate"),
        ("Secondary School", r"SPM Excellence Award|STPM|STAM"),
    ]
    for name, pattern in patterns:
        if re.search(pattern, text, re.I): result.append(name)
    return result

def parse_deadline(lines):
    note = join_lines(lines)
    # A date is stored only for a specific, unambiguous closing date. Relative,
    # historical and uncertain opening/claim dates remain source notes.
    patterns = [r"(?:closing date|closing|deadline|2026 closing date):?\s*(\d{1,2} [A-Za-z]+ 2026)",
                r"^(\d{1,2} [A-Za-z]+ 2026)(?:\.|,|$)",
                r"\d{1,2}(?: [A-Za-z]+)?(?: 2026)?\s*[–-]\s*(\d{1,2} [A-Za-z]+ 2026)",
                r"extended to (\d{1,2} [A-Za-z]+ 2026)"]
    dates = []
    for line in lines:
        if re.search(r"reported|secondary|not confirmed|not independently|not verified|expected|opening|introduced|announced|claims", line, re.I): continue
        for pattern in patterns:
            match = re.search(pattern, line, re.I)
            if match:
                try: dates.append(datetime.strptime(match[1], "%d %B %Y").date().isoformat())
                except ValueError: pass
    if "extended to" in note.lower() and dates: return max(dates)
    return dates[0] if len(set(dates)) == 1 else None

def prepare(pdf_path, output):
    from pypdf import PdfReader
    digest = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA: raise ValueError("PDF differs from reviewed version; review source boundaries before importing")
    pages = [[clean_line(line) for line in page.extract_text().splitlines() if clean_line(line) and not (re.match(r"^[\uF0B7•]", line.strip()) and clean_line(line) in STATES)] for page in PdfReader(pdf_path).pages]
    flat = [(number + 1, line) for number, lines in enumerate(pages) for line in lines]
    starts = []
    for page, anchor, *_ in ENTRIES:
        candidates = [i for i, (number, line) in enumerate(flat) if number == page and compact(line).startswith(compact(anchor.split("\n")[0]))]
        # Anchors may themselves wrap; compare the next lines as well.
        if not candidates:
            candidates = [i for i, (number, _) in enumerate(flat) if number == page and compact(join_lines([s for _, s in flat[i:i+3]])).startswith(compact(anchor))]
        if len(candidates) != 1: raise ValueError(f"Ambiguous boundary on page {page}: {anchor} ({len(candidates)})")
        starts.append(candidates[0])
    if starts != sorted(set(starts)): raise ValueError("Source boundaries are unordered or repeated")
    old = json.loads((BACKEND / "data/scholarship_pdf_import.json").read_text(encoding="utf-8"))
    prefix = compact(" ".join(line for _, line in flat[:starts[0]]))
    records = deepcopy(old["records"])
    # The first 49 source entries are the earlier reviewed scholarship/loan data.
    for record in records:
        if compact(record["title"]) not in prefix: raise ValueError(f"Earlier listing changed or disappeared: {record['title']}")
        metadata = record["import_metadata"]
        metadata["source_document"] = DOCUMENT
        metadata["source_document_sha256"] = digest
        metadata["title_aliases"] = [record["title"]]
        if record["title"] == "Yayasan Pahang Education Loan (Pinjaman Pendidikan Yayasan Pahang)":
            # Correct the reviewed snapshot only. The insert-only importer will
            # not update the already stored record or its older metadata.
            metadata["source_pages"] = [57, 58, 59]
            metadata["source_fields"]["Application Portal"] = "SYSPIN – Online Application System"
    for offset, (page, anchor, sponsor, state, category) in enumerate(ENTRIES):
        pairs = flat[starts[offset]:starts[offset+1] if offset + 1 < len(starts) else len(flat)]
        lines = repair_urls([line for _, line in pairs if line != "(none)" and not re.match(r"^[345]\. BANTUAN", line)])
        fields = source_fields(lines)
        if fields.get("title"):
            title = join_lines(fields["title"]).rstrip(".")
        else:
            title_lines = []
            for index, line in enumerate(lines):
                if line == "Education Loan" and index + 1 < len(lines) and lines[index + 1] == line:
                    title_lines.append(line)
                    continue
                if LABEL.match(line) or line in ("Education Loan", "Education Loan Advance", "Financial Assistance", "One-off", "One-off assistance") or re.search(r"Confirmededucationloan|Interest-free", line): break
                title_lines.append(line)
            title = join_lines(title_lines)
        description = field(fields, "description")
        eligibility = field(fields, "eligibility")
        if not description and page == 93:
            # This short source entry has no description; preserve its literal
            # target statement, with the missing description reported below.
            description = field(fields, "target")
        funding = field(fields, "funding amount")
        dates = field(fields, "deadline") or field(fields, "application period")
        urls = list(dict.fromkeys(re.findall(r"https?://[^\s<>]+", "\n".join(lines))))
        urls = [url.rstrip(".,;") for url in urls]
        source_ref = "\n".join(field(fields, "link") or field(fields, "application link"))
        notes = []
        if not urls: notes.append("No literal official source or application URL was supplied in this PDF entry.")
        if not description: notes.append("The PDF does not provide a separate programme description.")
        if page == 93: notes.append("No separate description is provided in the PDF; its explicit target-applicant statement is displayed instead.")
        if not eligibility: notes.append("The PDF does not provide eligibility criteria; confirm with the provider.")
        if not dates: notes.append("The PDF does not provide a closing date or application-period statement.")
        if not funding: notes.append("The PDF does not provide funding rates.")
        if re.search(r"historical|not confirmed|not independently|not publicly|require.*confirmation|not .*verified", join_lines(funding), re.I):
            notes.append("Some funding amounts are historical, unspecified, or require provider confirmation; source qualifications are retained.")
        if page == 98:
            notes.append("The PDF's emergency-assistance link has the path 'usahawan-zakat-maiwp'. Confirm the correct emergency-assistance page with MAIWP; the supplied URL has not been replaced.")
        if page == 119:
            notes.append("The PDF supplies a cbp-tot.primuscore.com membership-benefits URL. Confirm CBP's current official programme/application page; no replacement URL has been invented.")
        if page in (98, 99, 106, 107, 109, 111, 112, 117):
            notes.append("This is a general welfare, emergency, medical or disability scheme, not exclusively an IPT scholarship. Students must satisfy the provider's own eligibility requirements.")
        metadata = {
            "source_document": DOCUMENT, "source_document_sha256": digest,
            "source_record_numbers": [old["source_entry_count"] + offset + 1],
            "source_pages": sorted({n for n, _ in pairs}), "source_sponsor": join_lines(field(fields, "provider")) or sponsor,
            "study_levels": levels_from_funding(funding),
            "eligible_states": ["Kuala Lumpur", "Putrajaya", "Labuan"] if state == "Federal Territories" else [state],
            "source_url": urls[0] if urls else None, "source_urls": urls,
            "deadline_note": join_lines(dates) or None, "deadline_at": None,
            "amount_note": "\n".join(funding) or None,
            "declared_closed": bool(re.search(r"\bclosed\b|intakeclosed|applicationsclosed|\bhas ended\b", join_lines(dates + field(fields, "status")), re.I)),
            "source_fields": {key: "\n".join(value) for key, value in fields.items()},
            "source_entries": ["\n".join(lines)],
            "import_notes": notes, "external_listing": True,
            "import_key": "scholarone-all-pdf:" + hashlib.sha256(compact(title).encode()).hexdigest()[:24],
            "title_aliases": [title, anchor], "source_categories": [category],
        }
        levels = metadata["study_levels"]
        # Preserve source blocks verbatim in the public description/eligibility,
        # routing only explicit headings into the existing frontend format.
        details = list(eligibility)
        funding_info = field(fields, "funding information")
        if funding_info: details += ["Funding Details", *funding_info]
        source_type = field(fields, "funding type")
        if source_type: details += ["Additional Information", "Published funding type:", *source_type]
        opening = field(fields, "opening date")
        if opening: details += ["Additional Information", "Application opening information:", *opening]
        if source_ref: details += ["Official Sources:", source_ref]
        elif urls: details += ["Official Sources:", *urls]
        records.append({"title": title, "description": "\n".join(description),
                        "eligibility_criteria": "\n".join(details), "funding_type": category,
                        "amount": None, "category": levels[0] if len(levels) == 1 else "General",
                        "study_level": levels[0] if len(levels) == 1 else None,
                        "eligible_state": "Kuala Lumpur" if state == "Federal Territories" else state,
                        "deadline": parse_deadline(dates), "import_metadata": metadata})
    # Reviewed duplicate appearances, with the most complete source version as
    # the primary display. Other versions remain preserved in provenance.
    def by_page(page):
        return next(record for record in records[48:] if record["import_metadata"]["source_pages"][0] == page)
    groups = [(81, 96), (89, 108), (122, 94), (126, 100), (138, 114)]
    for primary_page, duplicate_page in groups:
        primary, duplicate = by_page(primary_page), by_page(duplicate_page)
        a, b = primary["import_metadata"], duplicate["import_metadata"]
        a["source_variants"] = [{"title": r["title"], "fields": r["import_metadata"]["source_fields"], "pages": r["import_metadata"]["source_pages"]} for r in (primary, duplicate)]
        for key in ["source_record_numbers", "source_pages", "source_urls", "source_entries", "study_levels", "title_aliases", "source_categories"]:
            a[key] = list(dict.fromkeys(a[key] + b[key]))
        a["source_pages"].sort(); a["source_record_numbers"].sort()
        if primary_page == 122:
            a["import_notes"].append("The PDF repeats Aspirasi IPT with conflicting opening dates: 7 October 2026 (page 94) and 1 January 2026 (page 122). Both entries give 31 December 2026 as closing date; confirm opening details with the provider.")
        if primary_page == 89:
            a["import_notes"].append("The PDF repeats disability assistance under MOHE/BKOKU and MOE/Bantuan Kewangan OKU. Provider naming and scheme equivalence require confirmation; both versions are preserved without creating a second listing.")
        records.remove(duplicate)
    # Aliases identify two programmes already present under their scholarship
    # names, irrespective of the later PDF's special-assistance categorisation.
    for page, existing_title in [(102, "Biasiswa Khas Sagong Tasi (Peringkat Pengajian Tinggi)"), (104, "Biasiswa Anak Yatim Yayasan Pahang")]:
        duplicate = by_page(page)
        primary = next(record for record in records[:48] if record["title"] == existing_title)
        a, b = primary["import_metadata"], duplicate["import_metadata"]
        a["source_variants"] = [{"title": r["title"], "fields": r["import_metadata"]["source_fields"], "pages": r["import_metadata"]["source_pages"]} for r in (primary, duplicate)]
        a.setdefault("source_categories", [primary["funding_type"]])
        for key in ["source_record_numbers", "source_pages", "source_urls", "source_entries", "study_levels", "title_aliases", "source_categories"]:
            a[key] = list(dict.fromkeys(a[key] + b[key]))
        a["source_pages"].sort(); a["source_record_numbers"].sort()
        records.remove(duplicate)
    for record in records:
        metadata = record["import_metadata"]
        public_urls = re.findall(r"https?://[^\s<>]+", record["description"] + "\n" + record["eligibility_criteria"])
        missing_urls = [url for url in metadata["source_urls"] if url.rstrip("/") not in {item.rstrip("/.,;") for item in public_urls}]
        if missing_urls:
            record["eligibility_criteria"] += "\nOfficial Sources:\n" + "\n".join(missing_urls)
    dataset = {"source_document": DOCUMENT, "source_document_sha256": digest,
               "source_entry_count": old["source_entry_count"] + len(ENTRIES),
               "records": records}
    output.write_text(json.dumps(dataset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"source_entries": dataset["source_entry_count"], "snapshot_records": len(records), "additional_source_entries": len(ENTRIES)}, indent=2))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--output", type=Path, default=BACKEND / "data/financial_aid_all_import.json")
    args = parser.parse_args()
    prepare(args.pdf, args.output)
