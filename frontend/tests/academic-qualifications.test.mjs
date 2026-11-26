import assert from 'node:assert/strict';
import { test } from 'node:test';
import { academicResultError, emptyAcademicResult } from '../src/utils/academicQualifications.ts';
import { getProfileCompletion } from '../src/utils/profileCompletion.ts';

test('subject grades count as academic results for profile completion', () => {
  const profile = {
    full_name: 'Test Student', email: 'student@example.invalid', phone_number: '0123456789',
    date_of_birth: '2005-01-01', gender: 'Female', nationality: 'Malaysian Citizen',
    education_level: 'Foundation', field_of_study: 'Science', university: 'Example College',
  };
  assert.equal(getProfileCompletion(profile), 90);
  assert.equal(getProfileCompletion({ ...profile, academic_qualifications: {
    spm: { subjects: [{ subject: 'Mathematics', grade: 'A' }] },
  } }), 100);
  assert.equal(getProfileCompletion({ ...profile, cgpa: 0 }), 100);
});

test('detects invalid CGPA and subjects on the selected scale', () => {
  assert.match(academicResultError({ ...emptyAcademicResult('diploma'), cgpa: '4.01' }), /CGPA/);
  assert.match(academicResultError({
    grading_scale: 'igcse_numeric', subjects: [{ subject: 'Biology', grade: 'A' }],
  }), /selected scale/);
  assert.equal(academicResultError({
    grading_scale: 'igcse_numeric', subjects: [{ subject: 'Biology', grade: '9' }],
  }), '');
});
