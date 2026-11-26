import Icon, { type AdvisorIconName } from "../../components/advisor/AdvisorIcon";
import { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";
import "../../styles/sponsor-statistics.css";

type ScholarshipBreakdown = {
  scholarship_id: number;
  title: string;
  total_views?: number;
  total_applications: number;
  awarded_students: number;
  pending_applications: number;
  rejected_applications: number;
};

type FieldBreakdown = {
  field_of_study: string;
  total_applications: number;
  awarded_students: number;
};

type MonthlyTrend = {
  month_label: string;
  total_applications: number;
  awarded_students: number;
};

type SponsorStatisticsData = {
  sponsor: {
    organization_name: string;
  };
  summary: {
    total_views: number;
    unique_viewers: number;
    total_applications: number;
    unique_students: number;
    awarded_students: number;
    pending_applications: number;
    rejected_applications: number;
    success_rate: number;
    top_field?: string | null;
  };
  listing_totals: { total: number; active: number; expired: number; closed: number; unconfirmed: number; unpublished: number };
  matched_listings: number;
  view_breakdown?: Array<{ scholarship_id: number; title: string; total_views: number }>;
  scholarship_breakdown: ScholarshipBreakdown[];
  field_breakdown: FieldBreakdown[];
  monthly_trend: MonthlyTrend[];
};

function formatPercent(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function SponsorStatisticsPage() {
  const user = getStoredUser();
  const [data, setData] = useState<SponsorStatisticsData | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [lifecycle, setLifecycle] = useState("all");

  useEffect(() => {
    const request = new AbortController();
    async function loadStatistics() {
      if (!user?.user_id) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await api.get<SponsorStatisticsData>(`/sponsors/${user.user_id}/statistics`, {
          params: { lifecycle }, signal: request.signal,
        });
        if (!request.signal.aborted) setData(response.data);
      } catch (error) {
        if (!request.signal.aborted) setError(getApiErrorMessage(error, "Unable to load sponsor statistics."));
      } finally {
        if (!request.signal.aborted) setIsLoading(false);
      }
    }

    loadStatistics();
    return () => request.abort();
  }, [user?.user_id, lifecycle]);

  const maxScholarshipApplications = useMemo(() => {
    if (!data?.scholarship_breakdown.length) {
      return 0;
    }

    return Math.max(...data.scholarship_breakdown.map((item) => Number(item.total_applications || 0)));
  }, [data]);

  const maxMonthlyApplications = useMemo(() => {
    if (!data?.monthly_trend.length) {
      return 0;
    }

    return Math.max(...data.monthly_trend.map((item) => Number(item.total_applications || 0)));
  }, [data]);

  const fieldTotal = useMemo(() => {
    if (!data?.field_breakdown.length) {
      return 0;
    }

    return data.field_breakdown.reduce((total, item) => total + Number(item.total_applications || 0), 0);
  }, [data]);

  const views = data?.view_breakdown || data?.scholarship_breakdown || [];
  const summary = data?.summary;
  const metrics = summary ? [
    { label: "Scholarship Views", value: summary.total_views || 0, icon: "eye", tone: "purple", detail: "One view per student, listing and Malaysia calendar day." },
    { label: "Unique Student Viewers", value: summary.unique_viewers || 0, icon: "users", tone: "blue", detail: "Distinct students across the selected listings." },
    { label: "Total Applications", value: summary.total_applications, icon: "quiz", tone: "purple", detail: "Applications received for the selected listings." },
    { label: "Awarded Students", value: summary.awarded_students, icon: "trophy", tone: "mint", detail: "Approved scholarship outcomes." },
    { label: "Award Rate", value: formatPercent(Number(summary.success_rate || 0)), icon: "trend", tone: "mint", detail: "Share of applications approved." },
    { label: "Top Field", value: summary.top_field?.trim() || "No data", icon: "graduation", tone: "blue", detail: "Most common applicant field." },
  ] satisfies { label: string; value: string | number; icon: AdvisorIconName; tone: string; detail: string }[] : [];

  return (
    <div className="sponsor-page sponsor-analytics">
      <header className="analytics-card analytics-header">
        <div>
          <h2>Scholarship Analytics</h2>
          <p>Track views, applications and awards across your scholarship listings.</p>
        </div>
        <div className="analytics-filter">
          <label htmlFor="analytics-lifecycle">Listing Lifecycle</label>
          <div className="analytics-select">
            <select id="analytics-lifecycle" value={lifecycle} onChange={event => {
              setLifecycle(event.target.value); setError(""); setIsLoading(true);
            }}>
              <option value="all">All listings</option><option value="active">Active</option>
              <option value="expired">Expired</option><option value="closed">Closed</option>
              <option value="unconfirmed">Deadline unconfirmed</option><option value="unpublished">Unpublished</option>
            </select>
            <Icon name="down" />
          </div>
          {error ? <p role="alert">{error}{data && " Showing the last loaded results."}</p> :
            <p role="status">{isLoading ? (data ? "Updating statistics…" : "Loading scholarship statistics…") :
              data?.matched_listings === 0 ? "No listings match this filter." :
              data?.matched_listings === undefined ? "" : `${data.matched_listings} listings in filtered statistics.`}</p>}
        </div>
      </header>

      {data && <>
        {data.listing_totals && <section className="analytics-card analytics-listings" aria-label="Listing lifecycle totals">
          <dl>
            <div><dt>Total Listings</dt><dd>{data.listing_totals.total}</dd></div>
            <div><dt>Active Listings</dt><dd>{data.listing_totals.active}</dd></div>
            <div><dt>Expired Listings</dt><dd>{data.listing_totals.expired}</dd></div>
          </dl>
        </section>}

        <section className="analytics-metrics" aria-label="Scholarship statistics" aria-busy={isLoading}>
          {metrics.map(({ label, value, icon, tone, detail }) => (
            <article className="analytics-card analytics-metric" key={label}>
              <div className="analytics-metric-heading">
                <span className={`analytics-icon ${tone}`}><Icon name={icon} /></span>
                <h3>{label}</h3>
              </div>
              <strong>{value}</strong>
              <p>{detail}</p>
            </article>
          ))}
        </section>

        {views.length > 0 && (
          <section className="analytics-card analytics-chart">
            <h3>Views by Scholarship</h3>
            <dl className="analytics-breakdown">
              {views.map(row => <div key={row.scholarship_id}><dt>{row.title}</dt><dd>{row.total_views || 0} views</dd></div>)}
            </dl>
          </section>
        )}

        {data.summary.total_applications === 0 ? (
          <section className="analytics-card analytics-empty">
            <span className="analytics-icon"><Icon name="chart" /></span>
            <div>
              <h3>{data.summary.total_views > 0 ? "No application data yet" : "No analytics data yet"}</h3>
              <p>{data.summary.total_views > 0 ? "Application and award charts will appear after students apply." :
                "View and application statistics will appear when students visit or apply to your listings."}</p>
            </div>
          </section>
        ) : (
        <section className="analytics-charts">
          <article className="analytics-card analytics-chart">
            <h3>Applications and awards</h3>
            <div className="sponsor-horizontal-chart">
              {data.scholarship_breakdown.map((item) => {
                const totalWidth = maxScholarshipApplications
                  ? Math.max((Number(item.total_applications || 0) / maxScholarshipApplications) * 100, 3)
                  : 0;
                const awardedWidth = item.total_applications
                  ? (Number(item.awarded_students || 0) / Number(item.total_applications)) * 100
                  : 0;

                return (
                  <div className="sponsor-horizontal-row" key={item.scholarship_id}>
                    <div>
                      <strong>{item.title}</strong>
                      <span>
                        {item.total_applications} applications • {item.awarded_students} awarded
                      </span>
                    </div>
                    <div className="sponsor-horizontal-track">
                      <span style={{ width: `${totalWidth}%` }}>
                        <i style={{ width: `${awardedWidth}%` }} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="analytics-card analytics-chart">
            <h3>Field of study mix</h3>
            <div className="sponsor-field-chart">
              {data.field_breakdown.length === 0 && <p>No field data available.</p>}
              {data.field_breakdown.map((item) => {
                const percentage = fieldTotal ? (Number(item.total_applications || 0) / fieldTotal) * 100 : 0;

                return (
                  <div className="sponsor-field-row" key={item.field_of_study}>
                    <span className="sponsor-field-dot" />
                    <div>
                      <strong>{item.field_of_study}</strong>
                      <small>
                        {item.total_applications} applications • {item.awarded_students} awarded
                      </small>
                    </div>
                    <em>{formatPercent(percentage)}</em>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="analytics-card analytics-chart analytics-trend">
            <h3>Monthly applications</h3>
            {data.monthly_trend.length > 0 ? (
              <div className="sponsor-trend-chart">
                {data.monthly_trend.map((item) => {
                  const totalHeight = maxMonthlyApplications
                    ? Math.max((Number(item.total_applications || 0) / maxMonthlyApplications) * 100, 8)
                    : 0;
                  const awardedHeight = item.total_applications
                    ? (Number(item.awarded_students || 0) / Number(item.total_applications)) * 100
                    : 0;

                  return (
                    <div className="sponsor-trend-column" key={item.month_label}>
                      <div>
                        <span style={{ height: `${totalHeight}%` }}>
                          <i style={{ height: `${awardedHeight}%` }} />
                        </span>
                      </div>
                      <small>{item.month_label}</small>
                      <small>{item.total_applications} applied · {item.awarded_students} awarded</small>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="sponsor-empty-state chart">Monthly application data will appear here.</div>
            )}
          </article>
        </section>
        )}
      </>}
    </div>
  );
}

export default SponsorStatisticsPage;
