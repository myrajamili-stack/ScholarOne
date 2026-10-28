import { useEffect, useState } from "react";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";

type SubscriptionPlan = {
  plan_id: number;
  plan_name: string;
  price: number | string;
  scholarship_limit: number;
  duration_month: number;
};

type CurrentSubscription = SubscriptionPlan & {
  subscription_id?: number | null;
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

  if (!amount) {
    return "Free";
  }

  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value?: string | null) {
  if (!value) {
    return "No renewal date";
  }

  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function getPlanFeatures(plan: SubscriptionPlan) {
  const limitText =
    plan.scholarship_limit >= 999 ? "Unlimited scholarship advertisements" : `${plan.scholarship_limit} scholarship advertisements`;

  return [
    limitText,
    "Application management dashboard",
    "Scholarship performance statistics",
    Number(plan.price || 0) > 0 ? "Priority provider visibility" : "Basic provider visibility",
  ];
}

function SponsorSubscriptionsPage() {
  const user = getStoredUser();
  const [data, setData] = useState<SponsorSubscriptionsData | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadSubscriptions() {
    if (!user?.user_id) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await api.get<SponsorSubscriptionsData>(`/sponsors/${user.user_id}/subscriptions`);
      setData(response.data);
      setSelectedPlanId(response.data.current_subscription.plan_id || null);
      setError("");
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to load subscription plans."));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadSubscriptions();
  }, [user?.user_id]);

  async function activatePlan(planId: number) {
    if (!user?.user_id) {
      return;
    }

    setIsSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const response = await api.post(`/sponsors/${user.user_id}/subscriptions`, { plan_id: planId });
      setSuccess(response.data.message || "Subscription plan activated.");
      await loadSubscriptions();
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to activate this subscription plan."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="sponsor-page">
        <section className="sponsor-empty-state">Loading subscription plans...</section>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="sponsor-page">
        <section className="sponsor-empty-state">{error}</section>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="sponsor-page">
        <section className="sponsor-empty-state">Subscription data is not available.</section>
      </div>
    );
  }

  const used = Number(data.usage.used_scholarships || 0);
  const limit = Number(data.usage.scholarship_limit || 3);
  const usagePercent = limit >= 999 ? 8 : Math.min((used / limit) * 100, 100);

  return (
    <div className="sponsor-page">
      <section className="sponsor-subscriptions-hero">
        <div>
          <p className="sponsor-kicker">Provider Plan</p>
          <h2>Subscriptions</h2>
          <span>Choose the scholarship advertising plan that fits {data.sponsor.organization_name || "your organization"}.</span>
        </div>
      </section>

      <section className="sponsor-stats-grid" aria-label="Subscription summary">
        <article className="sponsor-stat-card purple">
          <span>□</span>
          <p>Current Plan</p>
          <strong>{data.current_subscription.plan_name}</strong>
          <small>{data.current_subscription.subscription_status || "free"} plan status</small>
        </article>
        <article className="sponsor-stat-card blue">
          <span>↻</span>
          <p>Renewal Date</p>
          <strong>{formatDate(data.current_subscription.end_date)}</strong>
          <small>Based on active subscription</small>
        </article>
        <article className="sponsor-stat-card green">
          <span>▣</span>
          <p>Usage</p>
          <strong>{limit >= 999 ? `${used} / Unlimited` : `${used} / ${limit}`}</strong>
          <small>Scholarship advertisement slots</small>
        </article>
        <article className="sponsor-stat-card gold">
          <span>★</span>
          <p>Plan Price</p>
          <strong>{formatCurrency(data.current_subscription.price)}</strong>
          <small>Per {data.current_subscription.duration_month || 1} month</small>
        </article>
      </section>

      <section className="sponsor-panel sponsor-current-plan-panel">
        <div>
          <p className="sponsor-kicker">Current Usage</p>
          <h2>Scholarship advertisement quota</h2>
          <span>
            You have used {used} slot{used === 1 ? "" : "s"} from your current plan.
          </span>
        </div>
        <div className="sponsor-progress">
          <span style={{ width: `${usagePercent}%` }} />
        </div>
      </section>

      {error && <div className="sponsor-form-error">{error}</div>}
      {success && <div className="sponsor-form-success">{success}</div>}

      <section className="sponsor-plan-grid" aria-label="Available subscription plans">
        {data.plans.map((plan) => {
          const isCurrentPlan = data.current_subscription.plan_id === plan.plan_id;
          const isSelected = selectedPlanId === plan.plan_id;

          return (
            <article className={`sponsor-plan-card ${isCurrentPlan ? "current" : ""}`} key={plan.plan_id}>
              {isCurrentPlan && <span className="sponsor-plan-badge">Current plan</span>}
              <div className="sponsor-plan-header">
                <div>
                  <p className="sponsor-kicker">{plan.duration_month || 1} month plan</p>
                  <h2>{plan.plan_name}</h2>
                </div>
                <strong>{formatCurrency(plan.price)}</strong>
              </div>

              <p className="sponsor-plan-limit">
                {plan.scholarship_limit >= 999 ? "Unlimited listings" : `${plan.scholarship_limit} scholarship listings`}
              </p>

              <ul>
                {getPlanFeatures(plan).map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>

              <button
                className={isSelected ? "selected" : ""}
                disabled={isCurrentPlan || isSubmitting}
                type="button"
                onClick={() => {
                  setSelectedPlanId(plan.plan_id);
                  activatePlan(plan.plan_id);
                }}
              >
                {isCurrentPlan ? "Active Plan" : isSubmitting && isSelected ? "Activating..." : "Choose Plan"}
              </button>
            </article>
          );
        })}
      </section>
    </div>
  );
}

export default SponsorSubscriptionsPage;
