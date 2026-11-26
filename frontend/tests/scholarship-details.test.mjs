import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildScholarshipDetails, deadlinePresentation, publishedFundingBlocks } from '../src/utils/scholarshipDetails.ts';

const records = JSON.parse(readFileSync(new URL('../../backend/data/scholarship_pdf_import.json', import.meta.url), 'utf8')).records;
const record = title => records.find(row => row.title === title);
const input = row => ({ ...row, amount_note: row.import_metadata.amount_note, source_url: row.import_metadata.source_url });
const section = (sections, title) => sections.find(row => row.title === title);
const tables = value => value.blocks.filter(block => block.kind === 'table');
const lists = value => value.blocks.filter(block => block.kind === 'list');
const textOf = sections => sections.flatMap(value => value.blocks.flatMap(block => block.kind === 'text' ? [block.text] : block.kind === 'list' ? block.items : [block.headers.join(' '), ...block.rows.map(row => row.join(' '))])).join(' ');

test('provider listing sections use the same student display without duplicating official links', () => {
  const sections = buildScholarshipDetails({ description: 'Programme description.\n\nResidency Requirements:\nResident of Johor.\n\nFunding Details:\nPaid annually in August.\n\nApplication Method:\n1. Download the form.\n2. Submit the form.\n\nRepayment Conditions:\nRepay after graduation.\n\nAdditional Information:\nNo application fee.\n\nOfficial Source: https://example.com/programme\n\nApplication Portal: https://example.com/apply',
    eligibility_criteria: '- Eligible study level: Diploma, Undergraduate\n- Eligible state: Johor, Melaka\n- Minimum CGPA: 3.00',
    amount_note: 'RM800 per year.', source_url: 'https://example.com/programme' });
  for (const title of ['Scholarship Description', 'Eligibility Criteria', 'Residency Requirements', 'Funding Details', 'Application Method', 'Repayment Conditions', 'Additional Information', 'Official Sources and Application Portal']) {
    assert.ok(section(sections, title), `Missing ${title}`);
  }
  assert.equal(lists(section(sections, 'Eligibility Criteria'))[0].items.length, 3);
  assert.equal(lists(section(sections, 'Application Method'))[0].items.length, 2);
  const renderedText = textOf(sections);
  assert.equal(renderedText.split('https://example.com/programme').length - 1, 1);
  assert.equal(renderedText.split('https://example.com/apply').length - 1, 1);
});

test('metadata-only application portals display once alongside a legacy source', () => {
  const source = 'https://example.com/legacy';
  const portal = 'https://example.com/apply?programme=loan';
  const listing = { description: `Original terms.\nOfficial Source: ${source}`, source_url: source, application_url: portal };
  assert.equal(textOf(buildScholarshipDetails(listing)).split(portal).length - 1, 1);
  listing.description += `\nApplication Portal: ${portal}`;
  const text = textOf(buildScholarshipDetails(listing));
  assert.equal(text.split(portal).length - 1, 1);
  assert.equal(text.split(source).length - 1, 1);
});

test('MyBrainSc keeps five complete requirements, including the wrapped CGPA condition', () => {
  const sections = buildScholarshipDetails(input(record('MyBrainSc Scholarship')));
  assert.equal(lists(section(sections, 'Eligibility Criteria'))[0].items.length, 5);
  assert.match(textOf(sections), /3\.60 in pre-university qualifications/);
  assert.equal(section(sections, 'Repayment Conditions'), undefined);
  const sources = textOf([section(sections, 'Official Sources and Application Portal')]);
  assert.equal(sources.match(/https:\/\/biasiswa\.mohe\.gov\.my\/MyBrainSc\//g).length, 1);
});

test('PFF keeps eligibility separate and shows monetary categories once in the upper summary', () => {
  const row = input(record('Penang Future Foundation (PFF) Scholarship'));
  const sections = buildScholarshipDetails(row);
  assert.equal(lists(section(sections, 'Eligibility Criteria'))[0].items.length, 12);
  assert.doesNotMatch(textOf([section(sections, 'Eligibility Criteria')]), /Employment bond|Tuition fees/);
  const published = publishedFundingBlocks(row.amount_note);
  assert.equal(published.find(block => block.kind === 'table').rows.length, 2);
  const table = tables(section(sections, 'Funding Details'))[0];
  assert.deepEqual(table.rows.map(row => row[0]), ['Study duration', 'Employment bond']);
  assert.doesNotMatch(textOf([section(sections, 'Funding Details')]), /RM100,000|RM60,000|RM800|RM500/);
  assert.match(textOf(sections), /bond duration\s+depends on the total sponsorship received/);
});

test('PWPT TAPEM retains three financing bands, nine annual rates, eight steps and four repayment conditions', () => {
  const sections = buildScholarshipDetails(input(record('Pinjaman Wang Pengajian Tinggi (PWPT) TAPEM')));
  assert.equal(lists(section(sections, 'Eligibility Criteria'))[0].items.length, 8);
  const funding = tables(section(sections, 'Funding Details'));
  assert.deepEqual(funding.map(table => table.rows.length), [3, 9]);
  assert.deepEqual(funding[0].rows.map(row => row[1]), ['100%', '75%', '50%']);
  assert.equal(funding[1].rows.at(-1)[1], 'RM12,676.66');
  assert.match(funding[1].rows[1][0], /Islamic Studies Degree/);
  const residency = textOf([section(sections, 'Residency Requirements')]);
  assert.match(residency, /at least ten years/);
  assert.match(residency, /residency and voter registration conditions/);
  assert.equal(lists(section(sections, 'Application Method'))[0].items.length, 8);
  const repayment = lists(section(sections, 'Repayment Conditions'))[0];
  assert.equal(repayment.items.length, 4);
  assert.match(repayment.items[2], /six months after the normal study period ends/);
  assert.match(repayment.items[3], /outstanding loan immediately/);
  assert.match(textOf([section(sections, 'Official Sources and Application Portal')]), /https:\/\/tapemonline\.melaka\.gov\.my\//);
});

test('Yayasan Pahang retains eight funding rows, academic fields, five steps and three repayment conditions', () => {
  const sections = buildScholarshipDetails(input(record('Yayasan Pahang Education Loan (Pinjaman Pendidikan Yayasan Pahang)')));
  const table = tables(section(sections, 'Funding Details'))[0];
  assert.equal(table.rows.length, 8);
  assert.match(table.rows[1][1], /RM10,000 throughout the study period/);
  assert.match(table.rows[2][0], /20 selected public universities/);
  assert.match(textOf([section(sections, 'Eligibility Criteria')]), /3\.20|3\.00/);
  assert.equal(lists(section(sections, 'Application Method'))[0].items.length, 5);
  assert.equal(lists(section(sections, 'Repayment Conditions'))[0].items.length, 3);
  const source = textOf([section(sections, 'Official Sources and Application Portal')]);
  assert.match(source, /SYSPIN/);
  assert.doesNotMatch(source, /https?:/); // No URL was supplied; none is invented.
  assert.equal(section(sections, 'Residency Requirements'), undefined); // Not exposed by the API.
});

test('ambiguous content and unknown tables survive as complete readable fallback text', () => {
  const raw = 'Funding Details\nUnknown header\nTier A: conditional benefit\nCheck eligibility and repayment with provider.';
  const sections = buildScholarshipDetails({ eligibility_criteria: raw });
  assert.equal(section(sections, 'Funding Details').blocks[0].text, raw.split('\n').slice(1).join('\n'));
  assert.equal(buildScholarshipDetails({}).length, 0);
  assert.equal(buildScholarshipDetails({ eligibility_criteria: 'One long paragraph without clear boundaries' })[0].blocks[0].items.length, 1);
});

test('unknown schemes keep every monetary value and literal URL from all existing imported records', () => {
  for (const raw of records) {
    const row = input(raw);
    const sections = buildScholarshipDetails(row);
    const displayed = textOf([...sections, { blocks: publishedFundingBlocks(row.amount_note) }]);
    const original = [row.description, row.eligibility_criteria, row.amount_note, row.source_url].filter(Boolean).join(' ');
    for (const token of original.match(/RM[\d,]+(?:\.\d+)?|\d+(?:\.\d+)?%|https?:\/\/\S+/g) || []) {
      assert.ok(displayed.includes(token), `${raw.title}: missing ${token}`);
    }
  }
});

test('similar numbers in an upper summary do not suppress a different benefit or amount', () => {
  const sections = buildScholarshipDetails({ amount_note: 'Annual allowance RM8000.', eligibility_criteria: 'Funding Details\nItem Amount\nMonthly allowance RM800' });
  assert.equal(tables(section(sections, 'Funding Details'))[0].rows.length, 1);
});

test('all existing numerical requirements and source references remain present across the catalogue', () => {
  for (const raw of records) {
    const row = input(raw);
    const displayed = textOf([...buildScholarshipDetails(row), { blocks: publishedFundingBlocks(row.amount_note) }]);
    const original = [row.description, row.eligibility_criteria, row.amount_note].filter(Boolean).join(' ').replace(/^\s*\d+[.)]\s+/gm, '');
    for (const number of original.match(/\d[\d,.]*(?:%)?/g) || []) assert.ok(displayed.includes(number), `${raw.title}: missing numerical requirement ${number}`);
  }
});

// Transpile the actual TSX renderer for SSR smoke checks without adding a test framework.
const componentUrl = new URL('../src/components/ScholarshipDetailSections.tsx', import.meta.url);
const compiled = ts.transpileModule(readFileSync(componentUrl, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
  .replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve('react/jsx-runtime')))
  .replaceAll('"react"', JSON.stringify(import.meta.resolve('react')))
  .replaceAll('"../utils/scholarshipDetails"', JSON.stringify(new URL('../src/utils/scholarshipDetails.ts', import.meta.url).href));
const { default: DetailSections } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('actual React output renders semantic tables, numbered steps, bullets and safe official links', () => {
  const html = renderToStaticMarkup(createElement(DetailSections, { scholarship: input(record('Pinjaman Wang Pengajian Tinggi (PWPT) TAPEM')) }));
  assert.equal((html.match(/<table /g) || []).length, 2);
  assert.match(html, /<ol class="scholarship-detail-list">/);
  assert.match(html, /<ul class="scholarship-detail-list">/);
  assert.match(html, /href="https:\/\/tapemonline\.melaka\.gov\.my\/" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /scope="col"/);
  assert.match(html, /scope="row"/);
  const unsafe = renderToStaticMarkup(createElement(DetailSections, { scholarship: { eligibility_criteria: 'Official Source: javascript:alert(1)\n<script>alert(2)</script>' } }));
  assert.doesNotMatch(unsafe, /href="javascript:|<script>/);
});

test('latest ALL-PDF import fits the existing detail format without losing public figures or URLs', () => {
  const latest = JSON.parse(readFileSync(new URL('../../backend/data/financial_aid_all_import.json', import.meta.url), 'utf8')).records;
  for (const raw of latest) {
    const row = input(raw);
    const displayed = textOf([...buildScholarshipDetails(row), { blocks: publishedFundingBlocks(row.amount_note) }]);
    const original = [row.description, row.eligibility_criteria, row.amount_note, row.source_url].filter(Boolean).join(' ').replace(/^\s*\d+[.)]\s+/gm, '');
    for (const token of original.match(/RM[\d,]+(?:\.\d+)?|\d[\d,.]*(?:%)?|https?:\/\/\S+/g) || []) {
      assert.ok(displayed.includes(token), `${raw.title}: missing ${token}`);
    }
  }
});

test('Perak loan and Sarawak entry assistance retain published terms without invented dates or amounts', () => {
  const latest = JSON.parse(readFileSync(new URL('../../backend/data/financial_aid_all_import.json', import.meta.url), 'utf8')).records;
  const perak = input(latest.find(row => row.title.startsWith('Perak State Higher Education Loan')));
  const sarawak = input(latest.find(row => row.title.startsWith('Higher Education Entry Assistance')));
  for (const row of [perak, sarawak]) {
    assert.equal(row.deadline, null);
    assert.equal(deadlinePresentation({ ...row, deadline_note: row.import_metadata.deadline_note }).note, row.import_metadata.deadline_note);
  }
  assert.match(textOf(buildScholarshipDetails(perak)), /repayment exemption/);
  assert.match(textOf(buildScholarshipDetails(perak)), /https:\/\/studyfund\.perak\.gov\.my\//);
  assert.match(textOf(buildScholarshipDetails(sarawak)), /https:\/\/www\.tbs\.org\.my\//);
  assert.match(textOf([{ blocks: publishedFundingBlocks(sarawak.amount_note) }]), /Amount subject to the applicable assistance rate/);
});
