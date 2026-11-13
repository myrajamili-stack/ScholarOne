import SubscriptionBilling from "../../components/sponsor/SubscriptionBilling";
import Icon from "../../components/advisor/AdvisorIcon";
import { useEffect, useRef, useState } from "react";
import "../../styles/sponsor-subscriptions.css";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";

type SubscriptionPlan = {
  plan_id: number;
  plan_name: string;
  price: number | string;
  scholarship_limit: number;
  duration_month: number;
  benefits?: string[] | null;
};

type CurrentSubscription = SubscriptionPlan & {
  subscription_id?: number | null;
  stripe_subscription_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  subscription_status: string;
};

type SponsorSubscriptionsData = {
  sponsor: {
    organization_name: string;
    subscription_status: string;
  };
  current_subscription: CurrentSubscription;
  plans: SubscriptionPlan[];
  usage: {
    used_scholarships: number;
    scholarship_limit: number;
  };
};

function formatCurrency(value: number | string) {
  const amount = Number(value || 0);
  if (amount === 0) return "Free";
  return new Intl.NumberFormat("en-MY", {
    style: "currency", currency: "MYR", minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value?: string | null) {
  if (!value) return "No end date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric",
  }).format(date);
}

function planDescription(plan: SubscriptionPlan) {
  const descriptions: Record<string, string> = {
    free: "Get started and manage a few scholarship listings.",
    growth: "A great choice for growing organizations.",
    professional: "For active providers with multiple scholarships.",
    premium: "More listing capacity for large organizations.",
  };
  return descriptions[plan.plan_name.toLowerCase()] || "Manage scholarship listings with an allowance that fits your organization.";
}

function SponsorSubscriptionsPage() {
  const sponsorId = getStoredUser()?.user_id;
  const [data, setData] = useState<SponsorSubscriptionsData | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const activationInFlight = useRef(false);
  const checkoutDialog = useRef<HTMLDialogElement>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<SubscriptionPlan | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadSubscriptions() {
      try {
        if (!sponsorId) throw new Error("Please log in as a sponsorship provider to view subscriptions.");
        const response = await api.get<SponsorSubscriptionsData>(`/sponsors/${sponsorId}/subscriptions`);
        if (!cancelled) {
          setData(response.data);
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) setError(getApiErrorMessage(loadError, "Unable to load subscription plans."));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void loadSubscriptions();
    return () => { cancelled = true; };
  }, [sponsorId, reloadKey]);

  useEffect(() => {
    const refresh = () => setReloadKey(value => value + 1);
    window.addEventListener("scholarone-billing-updated", refresh);
    return () => window.removeEventListener("scholarone-billing-updated", refresh);
  }, []);

  function choosePlan(plan: SubscriptionPlan) {
    setCheckoutPlan(plan);
    checkoutDialog.current?.showModal();
  }

  async function activatePlan(planId: number) {
    if (!sponsorId || activationInFlight.current) return;
    activationInFlight.current = true;
    setSelectedPlanId(planId);
    setIsSubmitting(true);
    setError("");
    setSuccess("");
    try {
      if (checkoutPlan && Number(checkoutPlan.price) > 0) {
        const response = await api.post<{ url: string }>(`/sponsors/${sponsorId}/billing/checkout`, { plan_id: planId });
        window.location.assign(response.data.url);
        return;
      }
      const response = await api.post(`/sponsors/${sponsorId}/subscriptions`, { plan_id: planId });
      const { subscription, plan } = response.data;
      setData((current) => current && ({
        ...current,
        sponsor: { ...current.sponsor, subscription_status: plan.plan_name.toLowerCase() },
        current_subscription: { ...plan, ...subscription },
        usage: { ...current.usage, scholarship_limit: plan.scholarship_limit },
      }));
      setSuccess(response.data.message || "Subscription plan activated.");
      checkoutDialog.current?.close();
    } catch (activationError) {
      setError(getApiErrorMessage(activationError, "Unable to activate this subscription plan."));
    } finally {
      activationInFlight.current = false;
      setIsSubmitting(false);
      setSelectedPlanId(null);
    }
  }

  if (isLoading) return <div className="sponsor-page"><section className="sponsor-empty-state" role="status">Loading subscription plans…</section></div>;
  if (!data) return <div className="sponsor-page"><section className="sponsor-empty-state" role="alert">
    <p>{error || "Subscription data is not available."}</p>
    <button className="sponsor-primary-button" type="button" onClick={() => { setIsLoading(true); setReloadKey((key) => key + 1); }}>Try Again</button>
  </section></div>;

  const used = Number(data.usage.used_scholarships ?? 0);
  const limit = Number(data.usage.scholarship_limit ?? 3);
  const usagePercent = limit > 0 ? Math.min(100, Math.max(0, used / limit * 100)) : 0;
  const isFree = Number(data.current_subscription.price) === 0;
  const remaining = Math.max(0, limit - used);

  return (
    <div className="sponsor-page sponsor-subscriptions-page">
      <section className="sponsor-subscriptions-hero sponsor-hero sponsor-workspace-hero sponsor-learning-banner sponsor-subscriptions-banner">
        <div>
          <h2>Choose the Right Plan<br />for Your Organization</h2>
          <span>Get more listing capacity and manage applications efficiently with a plan that fits your needs.</span>
        </div>
      </section>

      {error && <div className="sponsor-form-error" role="alert">{error}</div>}
      {success && <div className="sponsor-form-success" role="status">{success}</div>}

      <section className="sps-overview" aria-label="Subscription summary">
        <article className="sponsor-panel sps-current-plan">
          <div className="sps-plan-identity">
            <span className="sps-large-icon"><Icon name="layers" /></span>
            <div><p>Current Plan</p><h2>{data.current_subscription.plan_name}</h2><span className="sps-active-status">Active Plan</span></div>
          </div>
          <div className="sps-plan-facts">
            <div><Icon name="calendar" /><div><span>Plan Period</span><strong>{isFree ? "Unlimited" : data.current_subscription.end_date ? `Until ${formatDate(data.current_subscription.end_date)}` : "No end date"}</strong></div></div>
            <div><Icon name="layers" /><div><span>Listing Allowance</span><strong>{used} / {limit}</strong></div></div>
          </div>
        </article>
        <article className="sponsor-panel sps-usage">
          <header><h2><Icon name="chart" />Your Usage</h2><strong>{used} of {limit} slots used</strong></header>
          <div className="sps-progress" role="progressbar" aria-label="Scholarship listing usage" aria-valuemin={0} aria-valuemax={Math.max(limit, used, 1)} aria-valuenow={used} aria-valuetext={`${used} of ${limit} slots used`}><span style={{ width: `${usagePercent}%` }} /></div>
          <p>{remaining > 0 ? `You can add ${remaining} more scholarship advertisement${remaining === 1 ? "" : "s"} on your current plan.` : "Your listing allowance is fully used. Choose a plan with more slots to add scholarships."}</p>
        </article>
      </section>

      <section aria-labelledby="sps-available-heading">
        <header className="sps-plans-heading"><h2 id="sps-available-heading">Available Plans</h2><p>Choose a plan that fits your scholarship listing needs.</p></header>
        <div className="sps-plan-grid">
          {data.plans.map((plan) => {
            const current = data.current_subscription.plan_id === plan.plan_id && (Number(plan.price) === 0 || Boolean(data.current_subscription.stripe_subscription_id));
            const recommended = plan.plan_name.toLowerCase() === "professional";
            return <article className={`sps-plan-card${current ? " sps-current" : ""}${recommended ? " sps-recommended" : ""}`} key={plan.plan_id}>
              {recommended && <span className="sps-plan-badge"><Icon name="star" />Recommended</span>}
              <h3>{plan.plan_name}</h3>
              <p className="sps-plan-description">{planDescription(plan)}</p>
              <p className="sps-price"><strong>{formatCurrency(plan.price)}</strong><span>{Number(plan.price) === 0 ? "per month" : `/ ${plan.duration_month === 1 ? "month" : `${plan.duration_month} months`}`}</span></p>
              <ul>
                {[`Up to ${plan.scholarship_limit} scholarship listings`, ...(plan.benefits ?? ["Application management dashboard", "Scholarship performance statistics"])].map((feature) => <li key={feature}><span aria-hidden="true">✓</span>{feature}</li>)}
              </ul>
              <button type="button" className={recommended && !current ? "sps-primary-choice" : ""} disabled={current || isSubmitting} onClick={() => choosePlan(plan)}>
                {current ? "Current Plan" : isSubmitting && selectedPlanId === plan.plan_id ? "Opening checkout…" : "Choose Plan"}
              </button>
            </article>;
          })}
        </div>
        {data.plans.length === 0 && <div className="sponsor-empty-state">No plans are available at the moment.</div>}
      </section>

      <SubscriptionBilling />
      <dialog ref={checkoutDialog} className="sps-checkout-dialog" aria-labelledby="checkout-heading">
        <h2 id="checkout-heading">{checkoutPlan?.plan_name} subscription</h2>
        <p><strong>{formatCurrency(checkoutPlan?.price || 0)} / month</strong></p>
        <p>{Number(checkoutPlan?.price || 0) > 0 ? "This plan renews automatically every month. Enter billing and test card details in Stripe Checkout. Your listing allowance activates after payment confirmation." : "Switch to the Free plan. If you have a recurring subscription, use Manage Billing to cancel its renewal first."}</p>
        <p>For an existing paid subscription, use Manage Billing below to change plans.</p>
        {error && <p role="alert" className="sponsor-form-error">{error}</p>}
        <button type="button" className="billing-secondary" disabled={isSubmitting} onClick={() => checkoutDialog.current?.close()}>Back</button>
        <button type="button" className="sponsor-primary-button" disabled={isSubmitting || !checkoutPlan} onClick={() => checkoutPlan && activatePlan(checkoutPlan.plan_id)}>{isSubmitting ? "Please wait…" : Number(checkoutPlan?.price || 0) > 0 ? "Continue to Stripe Checkout" : "Activate Free Plan"}</button>
      </dialog>

      <section className="sponsor-panel sps-benefits" aria-label="Subscription benefits">
        <h2><Icon name="star" />Subscription Benefits</h2>
        <div><Icon name="layers" /><div><h3>More Listing Capacity</h3><p>Share more scholarship opportunities.</p></div></div>
        <div><Icon name="chart" /><div><h3>Better Management</h3><p>Track and manage applications easily.</p></div></div>
        <div><Icon name="bolt" /><div><h3>Greater Flexibility</h3><p>Choose a plan that grows with you.</p></div></div>
      </section>
    </div>
  );
}

export default SponsorSubscriptionsPage;
