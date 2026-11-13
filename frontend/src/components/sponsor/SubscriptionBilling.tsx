import { useEffect, useState } from "react";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";
import "../../styles/subscription-billing.css";

export type SubscriptionPayment = {
  payment_id: number;
  invoice_number?: string | null;
  plan_name: string;
  amount: number | string;
  currency: string;
  payment_status: string;
  created_at: string;
  invoice_url?: string | null;
  invoice_pdf?: string | null;
};

type BillingData = {
  enabled: boolean;
  test_mode: boolean;
  portal_available: boolean;
  subscription: null | {
    plan_name: string;
    stripe_status: string;
    subscription_status: string;
    payment_status: string;
    cancel_at_period_end: boolean;
    end_date: string;
    billing_amount: number | string;
  };
  payments: SubscriptionPayment[];
};

export function PaymentHistory({ payments }: { payments: SubscriptionPayment[] }) {
  return <div className="billing-table-wrap"><table className="billing-table">
    <thead><tr><th>Invoice</th><th>Plan</th><th>Date</th><th>Amount</th><th>Status</th><th>Documents</th></tr></thead>
    <tbody>{payments.map(payment => <tr key={payment.payment_id}>
      <td>{payment.invoice_number || `Payment ${payment.payment_id}`}</td><td>{payment.plan_name}</td>
      <td>{new Date(payment.created_at).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}</td>
      <td>{new Intl.NumberFormat("en-MY", { style: "currency", currency: payment.currency.toUpperCase() }).format(Number(payment.amount))}</td>
      <td><span className={`billing-status billing-${payment.payment_status}`}>{payment.payment_status.replaceAll("_", " ")}</span></td>
      <td>{payment.invoice_url && <a href={payment.invoice_url} target="_blank" rel="noreferrer">View invoice</a>}{payment.invoice_pdf && <a href={payment.invoice_pdf} target="_blank" rel="noreferrer">PDF</a>}</td>
    </tr>)}{!payments.length && <tr><td colSpan={6}>Your subscription invoices will appear here after checkout.</td></tr>}</tbody>
  </table></div>;
}

export default function SubscriptionBilling() {
  const sponsorId = getStoredUser()?.user_id;
  const [data, setData] = useState<BillingData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await api.get<BillingData>(`/sponsors/${sponsorId}/billing`);
        if (cancelled) return;
        setData(response.data);
        setError("");
        const params = new URLSearchParams(window.location.search);
        if (params.get("checkout") === "cancelled") setNotice("Checkout cancelled. You can choose a plan whenever you are ready.");
        if (response.data.enabled && (params.get("checkout") === "success" || params.has("billing"))) {
          await api.post(`/sponsors/${sponsorId}/billing/refresh`);
          const updated = await api.get<BillingData>(`/sponsors/${sponsorId}/billing`);
          if (cancelled) return;
          setData(updated.data);
          setNotice(updated.data.subscription?.subscription_status === "active" ? "Your subscription is active and billing details are up to date." : "Payment is awaiting confirmation. Use Refresh Billing to check its status.");
          window.dispatchEvent(new Event("scholarone-billing-updated"));
        }
      } catch (loadError) {
        if (!cancelled) setError(getApiErrorMessage(loadError, "Unable to load billing details."));
      }
    }
    if (sponsorId) void load();
    return () => { cancelled = true; };
  }, [sponsorId, retry]);

  async function refresh() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (data?.enabled) await api.post(`/sponsors/${sponsorId}/billing/refresh`);
      setRetry(value => value + 1);
      window.dispatchEvent(new Event("scholarone-billing-updated"));
    } catch (refreshError) {
      setError(getApiErrorMessage(refreshError, "Unable to refresh billing."));
    } finally { setBusy(false); }
  }

  async function openPortal() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await api.post<{ url: string }>(`/sponsors/${sponsorId}/billing/portal`);
      window.location.assign(response.data.url);
    } catch (portalError) {
      setError(getApiErrorMessage(portalError, "Unable to open billing management."));
      setBusy(false);
    }
  }

  const subscription = data?.subscription;
  return <section className="sponsor-panel subscription-billing">
    <header className="billing-heading"><div><h2>Subscription &amp; Payments</h2><p>Monthly billing, payment methods, invoices, and automatic renewal.</p></div><span className="billing-test-badge">Stripe test mode</span></header>
    {error && <p className="sponsor-form-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {data && !data.enabled && <p role="status">Stripe test payments are awaiting backend configuration.</p>}
    <dl className="billing-summary">
      <div><dt>Subscription</dt><dd>{subscription?.plan_name || "Free"}</dd></div>
      <div><dt>Status</dt><dd>{subscription?.stripe_status.replaceAll("_", " ") || "Free plan"}</dd></div>
      <div><dt>{subscription?.cancel_at_period_end ? "Access ends" : "Next billing date"}</dt><dd>{subscription?.end_date && !["canceled", "incomplete_expired"].includes(subscription.stripe_status) ? new Date(subscription.end_date).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur" }) : "—"}</dd></div>
      <div><dt>Automatic renewal</dt><dd>{subscription && !subscription.cancel_at_period_end && !["canceled", "incomplete_expired"].includes(subscription.stripe_status) ? "Enabled" : "Off"}</dd></div>
    </dl>
    {subscription && <p className="billing-help">Recurring charge {new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(Number(subscription.billing_amount))} / month</p>}
    {(subscription?.stripe_status === "past_due" || (subscription?.stripe_status === "active" && subscription.payment_status !== "paid")) && <p role="alert">Your payment needs attention. Update your payment method in Manage Billing to restore your paid listing allowance.</p>}
    {subscription?.cancel_at_period_end && <p>Your subscription is scheduled to end at the displayed date. You can resume automatic renewal in Manage Billing.</p>}
    <div className="billing-actions"><button type="button" className="sponsor-primary-button" disabled={busy || !data?.enabled || !data.portal_available} onClick={openPortal}>Manage Billing</button><button type="button" className="billing-secondary" disabled={busy} onClick={refresh}>{busy ? "Please wait…" : "Refresh Billing"}</button></div>
    <p className="billing-help">Manage Billing opens Stripe’s portal to change plans, update payment methods, download invoices, or cancel renewal. Plan changes may include prorated charges.</p>
    <h3>Payment History</h3><PaymentHistory payments={data?.payments || []} />
  </section>;
}
