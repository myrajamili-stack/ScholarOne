# Latest ScholarOne financial-aid import report

**Subsequent user correction (19 November 2026):** HGIPT, ID 124, was updated
after this initial import to RM800 annually, August payment for new students and
April for continuing students, BSN account-opening/activation instructions,
closed 2026 intake, and a July–August 2027 application-period note. It is now
classified as Financial Assistance rather than One-off Assistance. Exact 2027
opening/closing dates were not supplied. The original PDF remains unchanged;
the correction is recorded in `backend/data/hgipt_payment_update.json` and the
record's `manual_corrections` metadata. Original first-time-enrolment eligibility
is preserved with a note to confirm continuing-student renewal eligibility.

Date: 19 November 2026 (Asia/Kuala_Lumpur).
Source: `SCHOLARONE DATA - ALL .pdf`, 141 pages.
PDF SHA-256: `d65c67284b2efc87ba3921e23227118e58501aa3f77e4ed93425f411e73f4b8f`.

## Completed import

- 124 programme appearances were accounted for as 116 unique programmes.
- Added and published 68 new listings: 14 education loans, 11 financial-assistance programmes, 24 special-assistance programmes, and 19 one-off assistance programmes.
- Skipped 48 already-existing programmes. All 53 original database rows were compared before/after and remain unchanged.
- Database total is now 121 listings. No tables, schema, accounts, authentication, or API routes were changed.
- All new listings use the existing ScholarOne curator, original provider attribution, external-link behavior, multi-level/state filters, descriptions, eligibility, funding notes, deadline notes, and provenance format.
- A second read-only import run proposes zero inserts. The public API returns HTTP 200; all 68 inserted rows match the reviewed fields.
- Existing eligibility, dates, funding terms, links and programme names were not overwritten by the new document. Repeated source versions are retained in the reviewed snapshot; new records also retain their merged source versions in metadata.

## Missing official source/application URL

Only one unique programme in the supplied document has no literal HTTP(S) URL:
**ID 56 ? Yayasan Pahang Education Loan (Pinjaman Pendidikan Yayasan Pahang), pages 57?59.**
The PDF supplies only the reference names ?Yayasan Pahang Education Loan ? Official Information? and ?SYSPIN ? Online Application System?. Please provide the exact official information and application-portal URLs. No URL was invented. This programme already existed and was not reinserted.

## Links that need programme-specific confirmation

The following URLs are present in the PDF but their role or accuracy needs confirmation. These are not claims that the URLs are dead; no bulk HTTP reachability audit was performed. Applications managed by offices, institutions or case assessment do not necessarily require a separate online portal.

| ID | Programme | Supplied URL | What is needed |
| --- | --- | --- | --- |
| 89 | Bantuan Kecemasan (Emergency Assistance) | https://www.maiwp.gov.my/portal-main/usahawan-zakat-maiwp | The supplied path /portal-main/usahawan-zakat-maiwp appears to refer to entrepreneurs rather than emergency assistance. Confirm the correct MAIWP programme page. |
| 108 | Skim Dermasiswa Dato' Haji Yusoff Hilmi | https://cbp-tot.primuscore.com/ms/keanggotaan/manfaat-keanggotaan | The supplied URL uses cbp-tot.primuscore.com rather than a clearly identified current application portal. Confirm the current official CBP page. |
| 107 | Skim Dana Ehsan Pendidikan (SDEP) | https://www.ypm.org.my/ | Only YPM's general homepage is supplied; confirm current availability and application method. |
| 103 | Sumbangan Mahasiswa Pengajian Tinggi Dalam Sabah (SENTOSA) | https://cm.sabah.gov.my/ | Only the Sabah Chief Minister's Office homepage is supplied; confirm the administering agency, 2026 rate and application page. |
| 101 | MAIDAM Medical Assistance (Bantuan Perubatan / Hemodialisis) | https://www.maidam.terengganu.gov.my/ | Only MAIDAM's general website is supplied; request the relevant medical-assistance guidance/application process. |
| 102 | MAIDAM Higher Education Student Airfare Assistance (Bantuan Tambang Penerbangan Pelajar IPT) | https://www.maidam.terengganu.gov.my/ | Only MAIDAM's general website is supplied; request current airfare-assistance guidance/application details. |
| 116 | Geran Pra Siswazah & Pasca Siswazah (Geran Bantuan Pelajar ke IPT) | https://www.yp.org.my | The general Yayasan Pahang website is supplied; confirm the exact online application page. |
| 120 | Sumbangan Dana Pendidikan Kerajaan Negeri Perlis | https://www.perlis.gov.my/ | Only the general Perlis Government website is supplied; request the current application form/page and eligibility/rates. |
| 123 | Higher Education Entry Assistance (Bantuan Kemasukan ke IPT) | https://www.tbs.org.my/ | The general Tabung Baitulmal Sarawak website is supplied; request the scheme-specific application guidance if needed. |

## Repeated programmes and conflicting versions

Repeated appearances were matched by reviewed programme identity, not by URL alone (different programmes may share a provider URL). The following are single database listings:

| ID | Programme | Source pages |
| --- | --- | --- |
| 19 | Biasiswa Anak Yatim Yayasan Pahang | 9, 104 |
| 23 | Biasiswa Khas Sagong Tasi (Peringkat Pengajian Tinggi) | 13, 102, 103 |
| 34 | Biasiswa Pendidikan LZNK IPTA | 23, 24, 25 |
| 75 | Monthly Living Allowance Assistance for IPT Students (Bantuan Sara Anak IPT) | 81, 82, 96 |
| 82 | Financial Assistance for Persons with Disabilities (BKOKU) | 89, 90, 108 |
| 111 | Bantuan Kewangan Kemasukan ke IPT (Aspirasi IPT) 2026 | 94, 122, 123 |
| 114 | Hadiah Pengajian Institut Pengajian Tinggi (HPIPT) Selangor / Iltizam Mahasiswa Selangor | 100, 101, 126, 127 |
| 122 | Bantuan Tunai Pendaftaran IPT Secara One-Off (BUDI) | 114, 138, 139 |

- **Aspirasi IPT:** page 94 says applications opened 7 October 2026; page 122 says 1 January 2026. Both give 31 December 2026 as the closing date. Both versions and an explicit warning are retained. Confirm the opening date with Negeri Sembilan.
- **HPIPT/Iltizam Selangor:** an early entry says 2026 dates are unconfirmed; the later, detailed entry specifies 15 March?14 April 2026 and closed status. The detailed version is the primary new listing, with the earlier version retained in provenance.
- **BKOKU/disability assistance:** the document names MOHE/BKOKU on pages 89?90 and MOE/Bantuan Kewangan OKU on page 108. It gives RM3,100 per semester in the former and no numeric rate in the latter. These were treated conservatively as repeated disability-assistance coverage, with both versions retained and a provider/scheme-equivalence warning. Confirm with the provider if they are actually separate schemes before creating another listing.
- **MAIM Sara/Saraan Anak IPT:** pages 81?82 and 96 describe recurring support under variant names. One listing is retained, with both references and the published study-level variants.
- **BUDI:** pages 114 and 138?139 describe the same programme and rates. One listing is retained.
- **Sagong Tasi and Biasiswa Anak Yatim:** later special-assistance entries repeat existing scholarships; existing database records were skipped, not replaced.
- **LZNK IPTA:** the earlier snapshot already combined two overlapping PDF versions; the latest import preserves that identity.
- **Pre-existing database duplicate:** Wakalah PayNet-Yayasan Khazanah Scholarship Programme exists as IDs 6 and 8. It was not created by this import and was not deleted or changed. Review separately if you want it cleaned up.

## Missing or incomplete listing details

All 68 inserted rows have a programme name, provider attribution, source text for description/target, eligibility, aid category and at least one literal URL. Unknown funding is never stored as RM0. Source amounts/percentages, conditions and historical qualifiers stay in published funding notes.

**MAINJ ? IPT Registration Assistance 2026:** the short PDF entry has no separate description; its literal target statement (?Muslim students, particularly Asnaf.?) is displayed instead. A fuller official description would improve the listing.

### No fixed/verified absolute closing date: 54 new programmes

This includes rolling applications, relative deadlines after registration, institution-managed applications and dates that the PDF says are unconfirmed. These are not automatically invalid listings. The full source application-period wording is displayed; confirm with the provider before applying.

| ID | Programme | Published application-period information |
| --- | --- | --- |
| 57 | Perak State Higher Education Loan (Pinjaman Pengajian Tinggi Negeri Perak) | Open throughout the year (no fixed closing date announced). |
| 59 | Yayasan Islam Negeri Kedah (YINK) – Education Loan | No fixed annual deadline published; applications are accepted during advertised application periods. |
| 61 | Perlis State Education Loan (Pinjaman Pelajaran Negeri Perlis) | No fixed closing date published. Confirm the current application period with YIPs. |
| 62 | Perlis Education Loan Advance (Pendahuluan Pinjaman Pelajaran) | Submit at least 4 weeks before the commencement of studies. |
| 63 | Yayasan Kelantan Darulnaim (YAKIN) – Education Loan (Pinjaman Pelajaran) | Depends on the annual application announcement. No fixed 2026 closing date published. |
| 64 | Yayasan Terengganu – Overseas First Degree Tuition Fee Loan | No fixed 2026 deadline confirmed. |
| 65 | Yayasan Terengganu – Domestic IPTA Top-Up Education Loan | No fixed 2026 deadline published. |
| 66 | Yayasan Terengganu – Domestic IPTS One-Off / Top-Up Education Loan | No fixed 2026 deadline published. |
| 67 | Yayasan Terengganu – Skills Training Education Loan (Pinjaman Latihan Kemahiran) | No fixed 2026 deadline published. |
| 69 | Yayasan Sarawak – Domestic Education Loan (Skim Biasiswa Pinjaman Pelajaran Dalam Negara) | No fixed annual deadline published. |
| 70 | Sarawak State Government Education Loan (Biasiswa Pinjaman Kerajaan Negeri Sarawak – BPKNS) | No confirmed 2026 deadline published. |
| 71 | Financial Assistance for Community College Students (BKPKK) | No fixed nationwide application date. Applications are managed through the respective Community College during student registration. |
| 72 | Foundation Financial Assistance for Public Universities (BKA UA) | No fixed public application date. New students are screened after registering at their respective public universities. Applications and selection are coordinated through the universities and MOHE. |
| 73 | Foundation Financial Assistance for TVET Students (BKA TVET) | No fixed public application date. New students are screened after registering at participating polytechnics. Subject to annual government allocation and approval. |
| 75 | Monthly Living Allowance Assistance for IPT Students (Bantuan Sara Anak IPT) | No fixed annual application deadline stated. Applications are handled through MAIM's zakat assistance process. Existing monthly zakat recipients can request the addition of this assistance. Subject to MAIM assessment and approval. |
| 76 | Monthly Financial Assistance Scheme (Skim Bantuan Kewangan Bulanan) | No fixed annual application deadline published. Applications can be submitted through MAIWP's Zakat Distribution Centres (PAZA). Subject to eligibility assessment and approval. |
| 77 | Student Monthly Living Allowance Assistance (Bantuan Wang Saku Zakat Selangor) | Applications for existing approved BDPT students are available throughout the year. Students must apply at the beginning of each semester or study level. The online application facility was introduced on 30 September 2025. For the 2026 scheme, the published FAQ specifies existing BDPT recipients whose sponsorship was approved by 31 March 2026. Future application arrangements for newly approved 2026 BDPT students should be confirmed with LZS. |
| 78 | Monthly Living Allowance for Asnaf Higher Education Students (Bantuan Sara Hidup Bulanan Pelajar IPT) | No fixed annual application deadline publicly announced. Applications are subject to individual assessment by Majlis Ugama Islam dan Adat Resam Melayu Pahang (MUIP). Students may apply through MUIP's zakat assistance channels. 2026: MUIP confirmed that monthly assistance is being provided to IPT students. |
| 79 | MAIPk – Bantuan Persediaan Pengajian Tinggi | Within three months from the IPT registration date. |
| 80 | Higher Education Financial Assistance Scheme (Skim Dermasiswa Pengajian Zakat MAINPP) | No fixed annual application deadline stated on the official page. Applications are submitted online through the MAINPP education portal. Existing applicants must update their academic and supporting documents for the current year. Subject to application assessment and approval. |
| 81 | Sultan Ismail Petra Education Financial Assistance (Dermasiswa Sultan Ismail Petra – DSIP MAIK) | Usually opens in January each year. Applications are subject to official announcements and annual approval. 2026 programme information is available. |
| 82 | Financial Assistance for Persons with Disabilities (BKOKU) | 2026 existing-student claims: 26 August – 25 September 2026. New application dates: Check with the respective institution's BKOKU coordinator. |
| 83 | Free Education Initiative – PTPTN eKasih Children Scholarship (BAeK PTPTN) | 2026 implementation announced on 20 January 2026. Specific application dates: Not announced in the cited announcement. Students should monitor PTPTN announcements and their respective institutions. |
| 84 | JAKOA Higher Education Financial Assistance (Bantuan Kewangan Pendidikan IPT) | Current application availability: Application portal provides an online application facility. 2026 closing date: Not specified. Applicants should contact JAKOA for the latest intake and application deadline. |
| 87 | Bantuan Pendaftaran ke IPT untuk Anak Asnaf MAIM 2026 | Announcement: 15 June 2026. Application opening: Not specifically stated. Closing date: Not published. Applications are submitted through the nearest MAIM Zakat Distribution Office. |
| 88 | Skim Bantuan Am Pelajaran IPT | Opening: No fixed annual opening date published. Closing: No fixed deadline published. Applications can be submitted through MAIWP's Zakat Distribution Centres (PAZA). |
| 89 | Bantuan Kecemasan (Emergency Assistance) | Opening: No fixed opening date. Closing: No fixed deadline. Applications are considered based on emergency circumstances. |
| 90 | Bantuan Perubatan Am (General Medical Assistance) | Opening: No fixed opening date. Closing: No fixed deadline. Applications are accepted through MAIWP's Zakat Distribution Centres (PAZA). |
| 91 | Bantuan Dermasiswa Pengajian Tinggi (BDPT) 2026 | Applications for 2026 are opened according to the admission schedules of participating institutions. There is no single fixed annual closing date. Applicants should check the Zakat Selangor Education Portal for the relevant intake. |
| 92 | UNISEL Student Financial Assistance (Bantuan Kewangan Pelajar) | No fixed public application dates. Assistance announcements are generally made through the UNISEL Student Portal. Some assistance is provided once per semester or once per year, subject to available funding. |
| 93 | Dermasiswa Pelajar Miskin IPT – Yayasan Pahang | No fixed annual deadline publicly confirmed. Contact Yayasan Pahang for application availability. |
| 94 | MAIPk Emergency / Immediate Assistance | No fixed closing date published; subject to application and assessment. |
| 95 | MAIPk Disaster Assistance | Subject to disaster occurrence and MAIPk's assistance arrangements. |
| 96 | MAIK Natural Disaster Assistance | No fixed closing date. Applications can be made through the nearest District Religious Office. |
| 97 | i-Sejahtera – OKU Assistance Programme (Program Bantuan OKU) | Applications are made through the i-Sejahtera portal. Check the portal for the current application cycle. |
| 98 | MAIPs Disaster Assistance (Skim Agihan Bencana) | No fixed closing date published. Applications are processed according to the disaster and damage assessment. |
| 99 | Kelantan Higher Education Student Assistance (Bantuan Pelajar IPT Kelantan) – Yayasan Kelantan Darulnaim (YAKIN) | Reported 2026 closing date: 31 October 2026. The 2026 application period has ended. The next application period has not been confirmed. |
| 100 | Tabung Serambi Mekah (Kelantan State Government Emergency Assistance Fund) | No fixed application opening or closing date. Applications can be submitted when a qualifying emergency occurs. Application forms are available from the relevant District and Land Office. |
| 101 | MAIDAM Medical Assistance (Bantuan Perubatan / Hemodialisis) | Applications depend on medical needs and eligibility. No fixed annual application period. Subject to MAIDAM's assessment and approval. |
| 102 | MAIDAM Higher Education Student Airfare Assistance (Bantuan Tambang Penerbangan Pelajar IPT) | Subject to the current MAIDAM / Yayasan Pendidikan MAIDAM application announcement. No fixed annual deadline independently verified. |
| 103 | Sumbangan Mahasiswa Pengajian Tinggi Dalam Sabah (SENTOSA) | Introduced for the 2026 programme. Application period and closing date: Not independently confirmed. Refer to the official Sabah Government announcement for application updates. |
| 105 | Emergency Assistance for Natural Disasters and Public Health Emergencies (Bantuan Kecemasan – Bencana Alam dan Kesihatan Awam) | No fixed annual application deadline published. Applications must be submitted within 30 days of the emergency incident. |
| 106 | Bantuan Khas Pembelian Tiket Penerbangan Secara Sekali Beri (One-Off) – FlySiswa 2026 | For new students enrolling in September and October 2026. Applications are subject to the 2026 programme's application period. Check the official portal for the latest closing date. |
| 107 | Skim Dana Ehsan Pendidikan (SDEP) | No fixed annual application deadline verified. Contact YPM to confirm current application availability. |
| 108 | Skim Dermasiswa Dato' Haji Yusoff Hilmi | SPM Excellence Award – Opens annually after SPM results are announced. Bachelor's Degree Excellence Award – Open throughout the year for graduates completing their studies in the current year. |
| 112 | Bantuan Ke Institusi Pengajian Tinggi (IPT) | Applications are accepted within six months from the student's official IPT registration date. No single annual closing date is specified on the official application page. Application portal is available online. For 2026, confirm the current intake and application status with TAPEM before submission. |
| 113 | Skim Bantuan Awal IPT (Yayasan Wilayah Persekutuan) | Application period follows the IPT admission intake. No fixed 2026 closing date was confirmed on the official website. Applicants should check the official portal for the latest application announcement. |
| 115 | Program Bantuan Yuran Pengajian (BYP) Institusi Pengajian Tinggi Awam dan Swasta bagi Pelajar Komuniti India B40 | No confirmed 2026 application opening or closing date found. Previous programme applications were administered through the Selangor State Government. Applicants should contact the programme secretariat to confirm the next application intake. |
| 116 | Geran Pra Siswazah & Pasca Siswazah (Geran Bantuan Pelajar ke IPT) | Applications can be submitted four weeks before the official IPT registration date. Applications can also be submitted within six weeks after IPT registration. No fixed annual application closing date. Application is available online through Yayasan Pahang. |
| 120 | Sumbangan Dana Pendidikan Kerajaan Negeri Perlis | No confirmed fixed opening or closing date for 2026. Application form is listed on the official Perlis Government website. Applicants should contact the State Secretary's Office to confirm the current application period. |
| 121 | Bantuan Persediaan Yayasan Terengganu (BPYT) – University Category (IPTA/IPTS) | Applications are linked to the student's official registration date at the institution. The official application guideline states that applications must be submitted no later than one month after official registration. This is not a fixed annual application period. Applicants must complete an eligibility screening before submitting an application. The application portal is available online. Check its current status before applying. |
| 122 | Bantuan Tunai Pendaftaran IPT Secara One-Off (BUDI) | 2026 applications are available through the official online portal. A third-party programme listing, updated on 13 October 2026, reports that applications are open. The official portal does not clearly specify a final closing date. Applicants should check the portal for the latest application status. |
| 123 | Higher Education Entry Assistance (Bantuan Kemasukan ke IPT) | No fixed annual deadline published. Applications should be submitted within 180 days (six months) from the registration date if the student has already enrolled. Preferably apply before registration. |
| 124 | Hadiah Galakan ke IPT (Higher Education Encouragement Award) | Applications are subject to the current intake and programme announcement. The application period for 2026 needs confirmation with Yayasan Sarawak. General programme guidance indicates an application deadline of six months from the student's registration date. |

### No numeric RM funding rate supplied: 33 new programmes

Some legitimately cover assessed fees or costs rather than a fixed cash award. Request rates only where the provider publishes them; do not assume zero or promise an unconfirmed amount.

| ID | Programme | Published funding information |
| --- | --- | --- |
| 57 | Perak State Higher Education Loan (Pinjaman Pengajian Tinggi Negeri Perak) | Diploma – Not publicly specified Bachelor's Degree – Not publicly specified Master's Degree – Not publicly specified PhD – Not publicly specified |
| 64 | Yayasan Terengganu – Overseas First Degree Tuition Fee Loan | Bachelor's Degree (Overseas) – Tuition fees; amount subject to approval. |
| 65 | Yayasan Terengganu – Domestic IPTA Top-Up Education Loan | Diploma – Amount subject to approval. Bachelor's Degree – Amount subject to approval. |
| 66 | Yayasan Terengganu – Domestic IPTS One-Off / Top-Up Education Loan | Diploma – Amount subject to approval. Bachelor's Degree – Amount subject to approval. |
| 67 | Yayasan Terengganu – Skills Training Education Loan (Pinjaman Latihan Kemahiran) | Skills Certificate – Amount subject to approval. Diploma-level Skills Training – Amount subject to approval. |
| 68 | Yayasan Sabah – Higher Education Loan (Pinjaman Pengajian Tinggi Yayasan Sabah) | Certificate – Subject to approval Diploma – Subject to approval Bachelor's Degree – Subject to approval Master's Degree – Subject to approval PhD – Subject to approval |
| 69 | Yayasan Sarawak – Domestic Education Loan (Skim Biasiswa Pinjaman Pelajaran Dalam Negara) | Foundation – Subject to approval and eligible institution. Diploma – Subject to approval. Bachelor's Degree – Subject to approval. Master's Degree – Subject to approval. PhD – Subject to approval. |
| 70 | Sarawak State Government Education Loan (Biasiswa Pinjaman Kerajaan Negeri Sarawak – BPKNS) | Diploma – Not publicly specified. Bachelor's Degree – Subject to approval. |
| 73 | Foundation Financial Assistance for TVET Students (BKA TVET) | Foundation (TVET): Financial assistance covering eligible tuition fees, accommodation fees and study allowances. Exact monetary allocation: Refer to the current programme terms. |
| 75 | Monthly Living Allowance Assistance for IPT Students (Bantuan Sara Anak IPT) | Diploma: Amount not publicly specified. Bachelor's Degree: Amount not publicly specified. Master's Degree: Amount not publicly specified. PhD: Amount not publicly specified. Payment frequency: Monthly. |
| 76 | Monthly Financial Assistance Scheme (Skim Bantuan Kewangan Bulanan) | Diploma: Amount determined by MAIWP. Bachelor's Degree: Amount determined by MAIWP. Postgraduate: Subject to MAIWP assessment. Payment frequency: Monthly. Exact IPT-specific amount: Not publicly confirmed. |
| 79 | MAIPk – Bantuan Persediaan Pengajian Tinggi | Certificate / Foundation / STPM / STAM – Amount subject to MAIPk approval Diploma – Amount subject to MAIPk approval Bachelor's Degree – Amount subject to MAIPk approval |
| 80 | Higher Education Financial Assistance Scheme (Skim Dermasiswa Pengajian Zakat MAINPP) | Diploma: Not publicly specified. Bachelor's Degree: Not publicly specified. Master's Degree: Not publicly specified. PhD: Not publicly specified. Payment frequency and amount: To be confirmed with MAINPP. |
| 83 | Free Education Initiative – PTPTN eKasih Children Scholarship (BAeK PTPTN) | Diploma: PTPTN-approved education financing converted into a scholarship. Bachelor's Degree: PTPTN-approved education financing converted into a scholarship. Exact individual funding amount: Based on the applicable PTPTN financing rate and programme. |
| 84 | JAKOA Higher Education Financial Assistance (Bantuan Kewangan Pendidikan IPT) | Diploma: Amount subject to JAKOA approval. Bachelor's Degree: Amount subject to JAKOA approval. Postgraduate: Amount subject to course suitability and approval. Exact funding rates: Not publicly specified in the available application form. |
| 87 | Bantuan Pendaftaran ke IPT untuk Anak Asnaf MAIM 2026 | Certificate: Not publicly specified. Matriculation: Not publicly specified. Diploma: Not publicly specified. Bachelor's Degree: Not publicly specified. |
| 88 | Skim Bantuan Am Pelajaran IPT | Certificate: Subject to MAIWP assessment. Diploma: Subject to MAIWP assessment. Bachelor's Degree: Subject to MAIWP assessment. Postgraduate: Subject to MAIWP assessment. Exact funding rates are not publicly specified. |
| 90 | Bantuan Perubatan Am (General Medical Assistance) | Medical treatment: Based on the approved treatment cost. Medication: Subject to MAIWP assessment. Medical procedures: Subject to approval and supporting medical documents. No fixed maximum amount publicly specified. |
| 91 | Bantuan Dermasiswa Pengajian Tinggi (BDPT) 2026 | Tuition fees – Covered according to the approved sponsorship and eligibility. University preparation allowance – Provided to eligible students. Airfare – Available where applicable, particularly for eligible students studying in Sabah and Sarawak. Educational necessities – May include pocket money, reference books, accommodation and learning equipment through recognised sponsoring agencies. |
| 92 | UNISEL Student Financial Assistance (Bantuan Kewangan Pelajar) | Financial assistance – Amount varies according to the approved assistance and available allocation. Food assistance – Subject to eligibility and the university's welfare programme. |
| 93 | Dermasiswa Pelajar Miskin IPT – Yayasan Pahang | IPT students: Amount subject to Yayasan Pahang's approval and allocation. No current standard payment amount publicly verified. |
| 94 | MAIPk Emergency / Immediate Assistance | Not publicly specified. |
| 95 | MAIPk Disaster Assistance | Not publicly specified. |
| 96 | MAIK Natural Disaster Assistance | Not publicly specified. |
| 98 | MAIPs Disaster Assistance (Skim Agihan Bencana) | Not publicly specified. |
| 99 | Kelantan Higher Education Student Assistance (Bantuan Pelajar IPT Kelantan) – Yayasan Kelantan Darulnaim (YAKIN) | Exact funding amount by qualification level: Not independently verified. No confirmed Diploma or Bachelor's Degree payment breakdown available. |
| 101 | MAIDAM Medical Assistance (Bantuan Perubatan / Hemodialisis) | No fixed payment amount independently verified. Assistance depends on medical requirements, treatment costs and eligibility. |
| 102 | MAIDAM Higher Education Student Airfare Assistance (Bantuan Tambang Penerbangan Pelajar IPT) | No fixed amount independently verified. Assistance is subject to approved airfare and eligibility conditions. |
| 105 | Emergency Assistance for Natural Disasters and Public Health Emergencies (Bantuan Kecemasan – Bencana Alam dan Kesihatan Awam) | No fixed amount publicly specified. Subject to individual case assessment and approval. |
| 107 | Skim Dana Ehsan Pendidikan (SDEP) | Diploma – Amount subject to approval. Bachelor's Degree – Amount subject to approval. Postgraduate – Subject to approval. |
| 110 | Tabung Pendidikan Sarjana PDT (TPSPDT) | Master's Degree – Subject to the programme's approved allocation. Other study levels – Not eligible. |
| 123 | Higher Education Entry Assistance (Bantuan Kemasukan ke IPT) | Diploma: Amount subject to the applicable assistance rate. Bachelor's Degree: Amount subject to the applicable assistance rate. Master's Degree: Amount subject to the applicable assistance rate. PhD: Amount subject to the applicable assistance rate. |
| 124 | Hadiah Galakan ke IPT (Higher Education Encouragement Award) | Diploma: Amount requires confirmation from the current official guideline. Bachelor's Degree: Amount requires confirmation from the current official guideline. |

### No specific qualification levels provided: 16 new programmes

Many are general welfare/medical/emergency schemes rather than IPT-only programmes. They remain visible under All Study Levels; qualification levels were not invented. Confirm level-specific eligibility with the provider if you need finer filtering.

| ID | Programme |
| --- | --- |
| 89 | Bantuan Kecemasan (Emergency Assistance) |
| 90 | Bantuan Perubatan Am (General Medical Assistance) |
| 91 | Bantuan Dermasiswa Pengajian Tinggi (BDPT) 2026 |
| 92 | UNISEL Student Financial Assistance (Bantuan Kewangan Pelajar) |
| 93 | Dermasiswa Pelajar Miskin IPT – Yayasan Pahang |
| 94 | MAIPk Emergency / Immediate Assistance |
| 95 | MAIPk Disaster Assistance |
| 96 | MAIK Natural Disaster Assistance |
| 97 | i-Sejahtera – OKU Assistance Programme (Program Bantuan OKU) |
| 98 | MAIPs Disaster Assistance (Skim Agihan Bencana) |
| 99 | Kelantan Higher Education Student Assistance (Bantuan Pelajar IPT Kelantan) – Yayasan Kelantan Darulnaim (YAKIN) |
| 100 | Tabung Serambi Mekah (Kelantan State Government Emergency Assistance Fund) |
| 101 | MAIDAM Medical Assistance (Bantuan Perubatan / Hemodialisis) |
| 102 | MAIDAM Higher Education Student Airfare Assistance (Bantuan Tambang Penerbangan Pelajar IPT) |
| 103 | Sumbangan Mahasiswa Pengajian Tinggi Dalam Sabah (SENTOSA) |
| 105 | Emergency Assistance for Natural Disasters and Public Health Emergencies (Bantuan Kecemasan – Bencana Alam dan Kesihatan Awam) |

### Historical or qualified rates

- Perlis State Education Loan: RM10,000/year references historical published rates; confirm current rates and repayment terms.
- Sumbangan Dana Pendidikan Kerajaan Negeri Perlis: amounts are explicitly from the 2019 State Budget; they are not confirmed 2026 amounts.
- Skim Bantuan Awal IPT (YWP): RM700 is a December 2024 reference award, not a confirmed 2026 rate.
- SENTOSA: RM300 is attributed to a 2025 Budget announcement; the PDF requests confirmation of 2026 rates.
- BPYT: amounts come from a 2024 guideline and must be confirmed with Yayasan Terengganu.
- YAKIN IPT assistance: the PDF attributes its closed 2026 intake to a secondary publication and does not verify funding levels. No unverified absolute closing date was manufactured.
- MyBrainSc (existing ID 9): the note still says 23 December 2026 was previously listed and needs portal verification; the actual deadline remains unset.

### PDF slots explicitly marked ?(none)?

The PDF lists no programme under recurring/financial assistance for Johor, Kedah, Perlis, Terengganu, Sabah and Sarawak, and no one-off programme for Kelantan. No placeholder listings were inserted. These gaps do not prove that no real-world schemes exist; provide additional verified entries if you want to fill them.

## Other existing information not overwritten

Existing Yayasan Pahang loan metadata still has unrelated state names appended to its application-portal reference. The reviewed file corrects that provenance reference, but the insert-only database operation deliberately does not update the existing row. The previous details review documents this separately.
Some existing residency metadata is not exposed by the current API. No API or schema change was made as part of this data import.

## Inserted listings

| ID | Programme | Aid category | PDF pages | Primary source URL |
| --- | --- | --- | --- | --- |
| 57 | Perak State Higher Education Loan (Pinjaman Pengajian Tinggi Negeri Perak) | Education Loan | 59, 60 | https://studyfund.perak.gov.my/ |
| 58 | Kedah State Education Financing – SPPNK (iPINJAM) | Education Loan | 60, 61 | https://sppnk.kedah.gov.my/ipinjam |
| 59 | Yayasan Islam Negeri Kedah (YINK) – Education Loan | Education Loan | 62 | https://yink.gov.my |
| 60 | Penang State Student Loan (Pinjaman Penuntut Negeri Pulau Pinang – ePPN) | Education Loan | 63, 64 | https://eppn.penang.gov.my |
| 61 | Perlis State Education Loan (Pinjaman Pelajaran Negeri Perlis) | Education Loan | 64, 65 | https://yips.gov.my |
| 62 | Perlis Education Loan Advance (Pendahuluan Pinjaman Pelajaran) | Education Loan | 65, 66 | https://www.perlis.gov.my/images/pekeliling/BORANG_PENDAHULUAN_PINJAMAN_-_MELAYU.pdf |
| 63 | Yayasan Kelantan Darulnaim (YAKIN) – Education Loan (Pinjaman Pelajaran) | Education Loan | 66, 67 | https://yakin.kelantan.gov.my/index.php?catid=9&id=60&view=article |
| 64 | Yayasan Terengganu – Overseas First Degree Tuition Fee Loan | Education Loan | 68 | https://yt.gov.my/bahagian/penajaan |
| 65 | Yayasan Terengganu – Domestic IPTA Top-Up Education Loan | Education Loan | 69 | https://yt.gov.my/bahagian/penajaan |
| 66 | Yayasan Terengganu – Domestic IPTS One-Off / Top-Up Education Loan | Education Loan | 70 | https://yt.gov.my/bahagian/penajaan |
| 67 | Yayasan Terengganu – Skills Training Education Loan (Pinjaman Latihan Kemahiran) | Education Loan | 71 | https://yt.gov.my/bahagian/penajaan |
| 68 | Yayasan Sabah – Higher Education Loan (Pinjaman Pengajian Tinggi Yayasan Sabah) | Education Loan | 72, 73 | https://ptps.sabah.gov.my |
| 69 | Yayasan Sarawak – Domestic Education Loan (Skim Biasiswa Pinjaman Pelajaran Dalam Negara) | Education Loan | 73, 74 | https://yayasansarawak.org.my/my/pinjaman |
| 70 | Sarawak State Government Education Loan (Biasiswa Pinjaman Kerajaan Negeri Sarawak – BPKNS) | Education Loan | 75, 76 | https://escholarship.sarawak.gov.my |
| 71 | Financial Assistance for Community College Students (BKPKK) | Financial Assistance | 76 | https://www.moe.gov.my/bantuan-kewangan |
| 72 | Foundation Financial Assistance for Public Universities (BKA UA) | Financial Assistance | 76, 77, 78 | https://www.moe.gov.my/bantuan-kewangan-asasi |
| 73 | Foundation Financial Assistance for TVET Students (BKA TVET) | Financial Assistance | 78, 79 | https://biasiswa.mohe.gov.my/bantuanasasi/index1.php |
| 74 | Living Allowance Assistance for Negeri Sembilan Students (Bantuan Sara Hidup Mahasiswa Anak Negeri Sembilan) | Financial Assistance | 79, 80 | https://www.yns.gov.my/v7/ms/bahagian/pendidikan/pembangunan-insan/bantuan-sara-hidup |
| 75 | Monthly Living Allowance Assistance for IPT Students (Bantuan Sara Anak IPT) | Financial Assistance | 81, 82, 96 | https://www.maim.gov.my/index.php/ms/agihan-zakat/skim-bantuan-zakat |
| 76 | Monthly Financial Assistance Scheme (Skim Bantuan Kewangan Bulanan) | Financial Assistance | 82, 83 | https://www.maiwp.gov.my/portal-main/bantuan-zakat |
| 77 | Student Monthly Living Allowance Assistance (Bantuan Wang Saku Zakat Selangor) | Financial Assistance | 83, 84 | https://www.zakatselangor.com.my/pendidikan/ |
| 78 | Monthly Living Allowance for Asnaf Higher Education Students (Bantuan Sara Hidup Bulanan Pelajar IPT) | Financial Assistance | 84, 85 | https://muip.gov.my/zakat/skim-bantuan-zakat |
| 79 | MAIPk – Bantuan Persediaan Pengajian Tinggi | Financial Assistance | 85, 86 | https://bestari.maipk.gov.my |
| 80 | Higher Education Financial Assistance Scheme (Skim Dermasiswa Pengajian Zakat MAINPP) | Financial Assistance | 86, 87 | https://zakat.mainpp.gov.my/bantuan-dermasiswa/ |
| 81 | Sultan Ismail Petra Education Financial Assistance (Dermasiswa Sultan Ismail Petra – DSIP MAIK) | Financial Assistance | 87, 88, 89 | https://eagihan.e-maik.my/ |
| 82 | Financial Assistance for Persons with Disabilities (BKOKU) | Special Assistance | 89, 90, 108 | https://bkoku.mohe.gov.my |
| 83 | Free Education Initiative – PTPTN eKasih Children Scholarship (BAeK PTPTN) | Special Assistance | 90, 91 | https://www.ptptn.gov.my/en/pelaksanaan-inisiatif-belanjawan-2026 |
| 84 | JAKOA Higher Education Financial Assistance (Bantuan Kewangan Pendidikan IPT) | Special Assistance | 91, 92 | https://idamak.jakoa.gov.my/permohonan |
| 85 | Higher Education Admission Assistance (Skim Bantuan Kemasukan ke Institusi Pengajian Tinggi – IPT) | Special Assistance | 92, 93 | https://jhev.gov.my/bantuan-untuk-veteran-atm/meringankan-beban-kewangan |
| 86 | MAINJ – IPT Registration Assistance 2026 | Special Assistance | 93 | https://www.maij.gov.my/?p=8875 |
| 87 | Bantuan Pendaftaran ke IPT untuk Anak Asnaf MAIM 2026 | Special Assistance | 95 | https://www.maim.gov.my/index.php/ms/lagi-pengumuman/bantuan-pendaftaran-ke-ipt-untuk-anak-asanf-maim |
| 88 | Skim Bantuan Am Pelajaran IPT | Special Assistance | 97 | https://www.maiwp.gov.my/portal-main/bantuan-zakat |
| 89 | Bantuan Kecemasan (Emergency Assistance) | Special Assistance | 98 | https://www.maiwp.gov.my/portal-main/usahawan-zakat-maiwp |
| 90 | Bantuan Perubatan Am (General Medical Assistance) | Special Assistance | 99, 100 | https://www.maiwp.gov.my/portal-main/bantuan-zakat |
| 91 | Bantuan Dermasiswa Pengajian Tinggi (BDPT) 2026 | Special Assistance | 101, 102 | https://www.zakatselangor.com.my/pendidikan/ |
| 92 | UNISEL Student Financial Assistance (Bantuan Kewangan Pelajar) | Special Assistance | 103, 104 | https://comnet.unisel.edu.my/bantuan_pendidikan |
| 93 | Dermasiswa Pelajar Miskin IPT – Yayasan Pahang | Special Assistance | 105 | https://www.yp.org.my/program-bantuan-pendidikan/derwasiswa-pelajar-miskin-ipt/ |
| 94 | MAIPk Emergency / Immediate Assistance | Special Assistance | 106 | https://www.maipk.gov.my/index.php/en/info/download/category/1-borang-zakat |
| 95 | MAIPk Disaster Assistance | Special Assistance | 106 | https://www.maipk.gov.my/index.php/en/info/download/category/1-borang-zakat |
| 96 | MAIK Natural Disaster Assistance | Special Assistance | 107 | https://maik.kedah.gov.my/utama/baitulmal/ |
| 97 | i-Sejahtera – OKU Assistance Programme (Program Bantuan OKU) | Special Assistance | 109 | https://isejahtera.penang.gov.my/ |
| 98 | MAIPs Disaster Assistance (Skim Agihan Bencana) | Special Assistance | 109, 110 | https://www.maips.gov.my/skim-bantuan-zakat/ |
| 99 | Kelantan Higher Education Student Assistance (Bantuan Pelajar IPT Kelantan) – Yayasan Kelantan Darulnaim (YAKIN) | Special Assistance | 110, 111 | https://yakin.kelantan.gov.my/ |
| 100 | Tabung Serambi Mekah (Kelantan State Government Emergency Assistance Fund) | Special Assistance | 111, 112 | https://ppn.kelantan.gov.my/index.php/hubungi-kami/about?catid=8&id=51:soalan-lazim-tabung-serambi-mekah&view=article |
| 101 | MAIDAM Medical Assistance (Bantuan Perubatan / Hemodialisis) | Special Assistance | 112, 113 | https://www.maidam.terengganu.gov.my/ |
| 102 | MAIDAM Higher Education Student Airfare Assistance (Bantuan Tambang Penerbangan Pelajar IPT) | Special Assistance | 113 | https://www.maidam.terengganu.gov.my/ |
| 103 | Sumbangan Mahasiswa Pengajian Tinggi Dalam Sabah (SENTOSA) | Special Assistance | 115 | https://cm.sabah.gov.my/ |
| 104 | Special Financial Assistance for Sarawak Students (Bantuan Khas Kewangan Sarawak) | Special Assistance | 116 | https://myys.yayasansarawak.org.my/ |
| 105 | Emergency Assistance for Natural Disasters and Public Health Emergencies (Bantuan Kecemasan – Bencana Alam dan Kesihatan Awam) | Special Assistance | 117, 118 | https://www.tbs.org.my/www/?page=154 |
| 106 | Bantuan Khas Pembelian Tiket Penerbangan Secara Sekali Beri (One-Off) – FlySiswa 2026 | One-off Assistance | 118 | https://bantuansiswa.mot.gov.my/ |
| 107 | Skim Dana Ehsan Pendidikan (SDEP) | One-off Assistance | 118, 119 | https://www.ypm.org.my/ |
| 108 | Skim Dermasiswa Dato' Haji Yusoff Hilmi | One-off Assistance | 119, 120 | https://cbp-tot.primuscore.com/ms/keanggotaan/manfaat-keanggotaan |
| 109 | Skim Bantuan Pendaftaran (SBP) | One-off Assistance | 120, 121 | https://www.ypj.gov.my/ |
| 110 | Tabung Pendidikan Sarjana PDT (TPSPDT) | One-off Assistance | 121, 122 | https://www.pdt.com.my/ |
| 111 | Bantuan Kewangan Kemasukan ke IPT (Aspirasi IPT) 2026 | One-off Assistance | 94, 122, 123 | https://www.n9.digital/ |
| 112 | Bantuan Ke Institusi Pengajian Tinggi (IPT) | One-off Assistance | 123, 124 | https://tapem.melaka.gov.my/bantuan-ke-institusi-pengajian-tinggi |
| 113 | Skim Bantuan Awal IPT (Yayasan Wilayah Persekutuan) | One-off Assistance | 124, 125 | https://www.yayasanwp.org/skim-bantuan-awal |
| 114 | Hadiah Pengajian Institut Pengajian Tinggi (HPIPT) Selangor / Iltizam Mahasiswa Selangor | One-off Assistance | 100, 101, 126, 127 | https://ehpipt.selangor.gov.my/hpipt/register |
| 115 | Program Bantuan Yuran Pengajian (BYP) Institusi Pengajian Tinggi Awam dan Swasta bagi Pelajar Komuniti India B40 | One-off Assistance | 127, 128 | https://dewan.selangor.gov.my/question/bantuan-pelajar-lepasan-spm/ |
| 116 | Geran Pra Siswazah & Pasca Siswazah (Geran Bantuan Pelajar ke IPT) | One-off Assistance | 129, 130 | https://www.yp.org.my |
| 117 | Yayasan Perak – Insentif Siswa Yayasan Perak (INSISYP) | One-off Assistance | 130, 131 | https://yayasanperak.gov.my/v7/index.php/insentif-siswa-yayasan-perak-insisyp-dalam-dan-luar-negara/ |
| 118 | Bantuan Awal Kemasukan ke Institusi Pengajian Tinggi (BAKIPT) | One-off Assistance | 132, 133 | https://eservices.kedah.gov.my/ibakipt |
| 119 | Bantuan Pendaftaran Pelajar ke Institut Pengajian Tinggi (iBITA) | One-off Assistance | 134, 135 | https://ibita.penang.gov.my/ |
| 120 | Sumbangan Dana Pendidikan Kerajaan Negeri Perlis | One-off Assistance | 135, 136 | https://www.perlis.gov.my/ |
| 121 | Bantuan Persediaan Yayasan Terengganu (BPYT) – University Category (IPTA/IPTS) | One-off Assistance | 137, 138 | https://bp.yt.gov.my/ |
| 122 | Bantuan Tunai Pendaftaran IPT Secara One-Off (BUDI) | One-off Assistance | 114, 138, 139 | https://budi.sabah.gov.my/ |
| 123 | Higher Education Entry Assistance (Bantuan Kemasukan ke IPT) | One-off Assistance | 140 | https://www.tbs.org.my/ |
| 124 | Hadiah Galakan ke IPT (Higher Education Encouragement Award) | One-off Assistance | 141 | https://myys.yayasansarawak.org.my/ |

## Files and repeatable checks

- `backend/data/financial_aid_all_import.json`: reviewed data using the existing field/metadata format.
- `backend/scripts/prepare_all_financial_aid.py`: PDF-to-reviewed-snapshot preparation with explicit, reviewed boundaries and duplicate groups. It never touches the database.
- `backend/scripts/import_all_financial_aid.py`: read-only by default; `--apply --publish` performs parameterized INSERTs only. Existing records are never updated, and original rows are verified unchanged before commit.
- `backend/tests/test_all_financial_aid_import.py`: source coverage, alias deduplication, ambiguous-match refusal, dates, wrapped text, programme levels and source links.
- `frontend/tests/scholarship-details.test.mjs`: verifies the latest data preserves figures/links through the existing renderer.
- `docs/financial-aid-all-import-result.json`: completed database-import audit of inserted/skipped IDs (no credentials).

Validation: 12 new backend import tests and all 29 frontend tests passed. Source coverage and all 68 new public API responses were verified. A second read-only import run proposes zero inserts.

```powershell
.\backend\.venv\Scripts\python.exe -B -m unittest discover -s backend/tests -p test_all_financial_aid_import.py
.\backend\.venv\Scripts\python.exe -B backend/scripts/import_all_financial_aid.py
cd frontend
node --test tests/*.test.mjs
```

Refresh the student Scholarships page and clear filters to see the new records. Use the aid-type, study-level and state dropdowns. No commit or push was performed.
