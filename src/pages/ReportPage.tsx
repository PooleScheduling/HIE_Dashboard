import type { ReportData } from "../data/types";
import { formatDate } from "../components/ui";
import type { View } from "../components/Header";

// The board-facing front page: goal, three headline numbers, section cards, one story.
export function ReportPage({ data, go }: { data: ReportData; go: (v: View, anchor?: string) => void }) {
  const featured = data.stories.find((s) => s.id === data.featuredStoryId) ?? data.stories[0];
  const keepers = Array.from(new Map(data.sections.map((s) => [s.owner, s.kicker])).entries());

  return (
    <section className="view report">
      <div className="hero">
        <p className="eyebrow">High-Impact Experiences · Poole College of Management · As of {formatDate(data.asOf)}</p>
        <h1 className="hero-h">{data.goal}</h1>
        <p className="hero-sub">{data.intro}</p>
        <div className="headline">
          {data.headline.map((m) => (
            <div className="hn" key={m.id}>
              <div className="n">{m.value}</div>
              <div className="l">{m.label}</div>
              <div className="s">
                {[m.period, m.source.label].filter(Boolean).join(" · ")}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="sec-head">
          <h2>Inside this report</h2>
          <span className="src">Choose a section to see the detail</span>
        </div>
        <div className="chapters">
          {data.sections.map((s) => (
            <button key={s.id} className="chapter" onClick={() => go("programs", `p-${s.id}`)}>
              <span className="k">{s.kicker}</span>
              <span className={`n${s.cardMetric ? "" : " pending"}`}>{s.cardMetric?.value ?? "Awaiting data"}</span>
              <span className="l">{s.summary}</span>
              <span className="meta">
                <span>
                  {s.owner}
                  {s.cardMetric?.source.updatedOn ? ` · ${formatDate(s.cardMetric.source.updatedOn)}` : " · not yet connected"}
                </span>
                <span className="go">Read →</span>
              </span>
            </button>
          ))}
          <button className="chapter" onClick={() => go("hub")}>
            <span className="k">The Hub</span>
            <span className="n">{data.hub.metrics[0]?.value}</span>
            <span className="l">{data.hub.metrics[0]?.label}</span>
            <span className="meta">
              <span>Live · {formatDate(data.hub.metrics[0]?.source.updatedOn)}</span>
              <span className="go">Read →</span>
            </span>
          </button>
        </div>
      </div>

      {featured && (
        <figure className="pull">
          <blockquote>“{featured.quote}”</blockquote>
          <figcaption>
            {featured.attribution} ·{" "}
            <button className="link" onClick={() => go("stories")}>
              More stories
            </button>
          </figcaption>
        </figure>
      )}

      <div className="keepers">
        <div>
          <h3>Kept current by</h3>
          <p className="src">Each program owner updates their own numbers. Nothing here waits for year end.</p>
        </div>
        <div className="who">
          {keepers.map(([owner, area]) => (
            <div className="person" key={owner}>
              {owner}
              <small>{area}</small>
            </div>
          ))}
        </div>
        <button className="btn ghost" onClick={() => go("contribute")}>
          Contribute data
        </button>
      </div>
    </section>
  );
}
