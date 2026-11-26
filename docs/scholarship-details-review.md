# Scholarship details presentation review

Reviewed against the existing Supabase records, API mapping, import snapshot, and
the supplied `SCHOLARONE DATA - SCHOLARSHIP.pdf` (pages 1, 25–26, 49–51, 57–60).
No database records, schema, API routes, authentication, or source data were changed.

## What the frontend displays

The existing deadline, funding amount/type, published funding, and description
remain above the detailed sections. Only explicit headings in the API text create
new sections. Eligibility and repayment requirements become bullets; clearly
numbered applications become ordered lists. Recognized funding schedules become
tables. Unrecognized formats remain intact as readable text rather than guessed
columns or inferred requirements.

The PFF monetary summary appears in the upper published funding table. Equivalent
tuition/monthly-allowance rows are suppressed below only when the category,
benefit, amounts, and qualifiers match. Duration, bond, and other distinct terms
remain visible. Literal HTTP(S) URLs become links; source names without URLs stay
as reference text. No URLs are invented.

## Records tested

| ID | Existing record | Verified display |
| --- | --- | --- |
| 9 | MyBrainSc Scholarship | Five complete eligibility bullets; CGPA 3.60; official URL once in source section; unknown deadline/funding preserved. |
| 35 | Penang Future Foundation (PFF) Scholarship | Twelve eligibility bullets; two funding categories in upper table; duration and employment bond retained below; original description and 5 August 2026 deadline preserved. |
| 51 | Pinjaman Wang Pengajian Tinggi (PWPT) TAPEM | Eight eligibility bullets; Melaka residency definition and caveat; three financing bands; nine annual rates, including RM12,676.66; eight application steps; four repayment conditions; both literal source/portal URLs. |
| 56 | Yayasan Pahang Education Loan (Pinjaman Pendidikan Yayasan Pahang) | Eight funding rows; full-time/part-time qualifications; academic fields and requirements; five application steps; three repayment conditions; original named source/portal references without invented URLs. |

Automated preservation checks also cover numerical requirements, funding figures,
percentages, and URLs across all 48 imported records. React rendering tests check
table/list markup, links, and text escaping. These are content/rendering checks,
not a claim of interactive browser testing.

## Data needing review (no corrections applied)

1. **Record 56, Yayasan Pahang:**
   `import_metadata.source_fields["Application Portal"]` contains
   `SYSPIN – Online Application System Perak Kedah Pulau Pinang Perlis Kelantan Terengganu Sabah Sarawak`.
   The trailing state names belong to the PDF's following geographic index, not
   the portal name (page 59). Proposed correction: retain only
   `SYSPIN – Online Application System`. The actual eligibility text's portal
   reference is already clean; this metadata field is not displayed by the API.
   No literal application URL was supplied; keep it unset until verified.

2. **Residency data is stored but omitted from the existing API response:**
   - Record 35: “No compulsory Penang residency requirement.”
   - Record 36, PFF Mutiara Scholar: “No compulsory Penang residency or birthplace requirement.”
   - Record 56: Pahang birth/parentage alternative, more-than-ten-years residence,
     intention to remain, and relevant authority confirmation.
   These are in `import_metadata.source_fields["Residency Requirement"]`, not in
   the API's description/eligibility fields. This is a mapping limitation rather
   than proof of incorrect database content. A separately authorized future API
   change could expose them. This frontend change does not copy seed/PDF text
   into live records or invent a residency section from a state filter.
   Record 51's detailed Melaka residency definition is already in the public
   eligibility field and is displayed.

3. **Unconfirmed source information stays unconfirmed:** MyBrainSc's deadline
   note says “23 December 2026 (as previously listed; verify current portal)”,
   while the actual deadline is unset. Preserve this distinction; do not turn
   the note into a confirmed date without provider verification. The PFF deadline
   is 5 August 2026 and is already marked as a closed intake by the existing API.

No incorrect eligibility, funding amount, or repayment wording was found in the
four checked public records compared with the supplied PDF.

## Validation and manual check

From `frontend`:

```powershell
node --test tests/scholarship-details.test.mjs
npm.cmd run build
.\node_modules\.bin\eslint.cmd src/utils/scholarshipDetails.ts src/components/ScholarshipDetailSections.tsx src/pages/student/ScholarshipsPage.tsx
```

Full-project lint also reports existing errors in sponsor Messages, Settings, and
Statistics pages, outside this change. The edited TypeScript files pass lint.

For a visual check, open the student's Scholarships page, clear filters, search
each programme above, and open its details. Check the tables and complete terms
against the rows in this report. At a narrow/mobile width, the modal stays within
the viewport and tables can scroll horizontally. Existing apply, official-source,
save, filter, and reminder behavior is retained.
