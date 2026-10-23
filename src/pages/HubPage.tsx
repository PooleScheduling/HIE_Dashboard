import type { ReportData } from "../data/types";
import { Chart } from "../components/Chart";
import { MetricTile, PageHead } from "../components/ui";

export function HubPage({ data }: { data: ReportData }) {
  return (
    <section className="view">
      <PageHead
        title="Poole Undergraduate Student Hub"
        lead="Check-ins on the Hub kiosk iPad. Each tap counts as one visit, and the answer to the daily question is ignored. A student can tap more than once, so read this as traffic, not unique students."
      />
      <div className="grid kpis">
        {data.hub.metrics.map((m) => (
          <MetricTile key={m.id} m={m} />
        ))}
      </div>
      <div className="panel">
        <Chart chart={data.hub.weekly} />
      </div>
      <div className="panel">
        <Chart chart={data.hub.hourly} height={240} />
      </div>
    </section>
  );
}
