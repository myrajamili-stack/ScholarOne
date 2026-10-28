import { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";

type ScholarshipBreakdown = {
  scholarship_id: number;
  title: string;
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
    total_applications: number;
    unique_students: number;
    awarded_students: number;
    pending_applications: number;
    rejected_applications: number;
    success_rate: number;
    top_field?: string | null;
  };
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

  useEffect(() => {
    async function loadStatistics() {
      if (!user?.user_id) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await api.get<SponsorStatisticsData>(`/sponsors/${user.user_id}/statistics`);
        setData(response.data);
      } catch (error) {
        setError(getApiErrorMessage(error, "Unable to load sponsor statistics."));
      } finally {
        setIsLoading(false);
      }
    }

    loadStatistics();
  }, [user?.user_id]);

  const maxScholarshipApplications = useMemo(() => {
    if (!data?.scholarship_breakdown.length) {
      return 0;
    }

    return Math.max(...data.scholarship_breakdown.map((item) => Number(item.total_applications || 0)));
  }, [data?.scholarship_breakdown]);

  const maxMonthlyApplications = useMemo(() => {
    if (!data?.monthly_trend.length) {
      return 0;
    }

    return Math.max(...data.monthly_trend.map((item) => Number(item.total_applications || 0)));
  }, [data?.monthly_trend]);

  const fieldTotal = useMemo(() => {
    if (!data?.field_breakdown.length) {
      return 0;
    }

    return data.field_breakdown.reduce((total, item) => total + Number(item.total_applications || 0), 0);
  }, [data?.field_breakdown]);

  if (isLoading) {
    return (
      <div className="sponsor-page">
        <section className="sponsor-empty-state">Loading scholarship statistics...</section>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="sponsor-page">
        <section className="sponsor-empty-state">{error || "Statistics data is not available."}</section>
      </div>
    );
  }

  const hasApplicationData = data.summary.total_applications > 0;

  return (
    <div className="sponsor-page">
      <section className="sponsor-statistics-hero">
        <div>
          <p className="sponsor-kicker">Performance</p>
          <h2>Statistics</h2>
          <span>See how students apply to scholarships from {data.sponsor.organization_name || "your organization"}.</span>
        </div>
      </section>

      <section className="sponsor-stats-grid" aria-label="Scholarship application statistics">
        <article className="sponsor-stat-card purple">
          <span>▣</span>
          <p>Total Applications</p>
          <strong>{data.summary.total_applications}</strong>
          <small>Student applications received</small>
        </article>
        <article className="sponsor-stat-card green">
          <span>✓</span>
          <p>Awarded Students</p>
          <strong>{data.summary.awarded_students}</strong>
          <small>Approved scholarship outcomes</small>
        </article>
        <article className="sponsor-stat-card blue">
          <span>%</span>
          <p>Award Rate</p>
          <strong>{formatPercent(Number(data.summary.success_rate || 0))}</strong>
          <small>Approved from total applications</small>
        </article>
        <article className="sponsor-stat-card blue">
          <span>◇</span>
          <p>Top Field</p>
          <strong>{data.summary.top_field || "No data"}</strong>
          <small>Most common applicant field</small>
        </article>
      </section>

      {!hasApplicationData ? (
        <section className="sponsor-empty-state scholarship-empty">
          <strong>No application statistics yet.</strong>
          <p>
            This page will show diagrams after students start applying and scholarship providers approve or reject
            applications.
          </p>
        </section>
      ) : (
        <section className="sponsor-statistics-grid">
          <article className="sponsor-panel sponsor-chart-panel">
            <div className="sponsor-panel-header">
              <div>
                <p className="sponsor-kicker">Scholarship Performance</p>
                <h2>Applications and awards</h2>
              </div>
            </div>
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

          <article className="sponsor-panel sponsor-chart-panel">
            <div className="sponsor-panel-header">
              <div>
                <p className="sponsor-kicker">Applicant Fields</p>
                <h2>Field of study mix</h2>
              </div>
            </div>
            <div className="sponsor-field-chart">
              {data.field_breakdown.map((item, index) => {
                const percentage = fieldTotal ? (Number(item.total_applications || 0) / fieldTotal) * 100 : 0;

                return (
                  <div className="sponsor-field-row" key={item.field_of_study}>
                    <span className={`sponsor-field-dot tone-${index % 4}`} />
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

          <article className="sponsor-panel sponsor-chart-panel sponsor-trend-panel">
            <div className="sponsor-panel-header">
              <div>
                <p className="sponsor-kicker">Application Trend</p>
                <h2>Monthly applications</h2>
              </div>
            </div>
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
    </div>
  );
}

export default SponsorStatisticsPage;
