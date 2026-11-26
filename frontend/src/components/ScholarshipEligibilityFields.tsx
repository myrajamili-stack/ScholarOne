import { eligibilityStates } from "../utils/financialAid";

export default function ScholarshipEligibilityFields() {
  return <div className="eligibility-inputs">
    <label>Your State<select name="residency_state" defaultValue=""><option value="">Not provided</option>{eligibilityStates.map(state => <option key={state}>{state}</option>)}</select></label>
    <label>Household Income (MYR)<input name="household_income" type="number" min="0" step="0.01" placeholder="Optional" /></label>
  </div>;
}
