"use client";

import { sampleSightings } from "@/shared/sample-sightings";
import { speciesById } from "@/shared/species";
import { Icon } from "@/shared/icons";
import { clearDecisions, useDecisions } from "@/lib/decisions";
import { clockTime, useNow, when } from "@/lib/use-now";

export default function AuditPage() {
  const now = useNow();
  const decisions = useDecisions();
  if (!now) return <p className="empty">Loading…</p>;
  const sightings = new Map(sampleSightings(now).map((s) => [s.id, s]));
  const sampleRows = sampleSightings(now)
    .filter((s) => s.review)
    .map((s) => ({ key: `sample-${s.id}`, at: s.review!.decidedAt, who: s.review!.reviewer, action: s.status, id: s.id, reason: s.review!.reason, sample: true }));
  const mine = decisions.map((d, i) => ({ key: `mine-${i}`, at: d.at, who: "You (prototype)", action: d.status, id: d.id, reason: d.reason, sample: false }));
  const rows = [...mine, ...sampleRows].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
      <div className="page-head">
        <h1>Audit log</h1>
        <p className="muted">
          Every review decision, newest first. On the server this log will be append-only. Here, decisions you make are kept in this browser and the rest are sample entries.
        </p>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Reviewer</th>
              <th scope="col">Decision</th>
              <th scope="col">Sighting</th>
              <th scope="col">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = sightings.get(r.id);
              return (
                <tr key={r.key}>
                  <td>
                    {when(r.at, now)} <span className="faint">({clockTime(r.at)})</span>
                  </td>
                  <td>
                    {r.who} {r.sample ? <span className="chip chip-sample">Sample</span> : null}
                  </td>
                  <td>
                    <span className={`chip ${r.action === "approved" ? "chip-approved" : "chip-rejected"}`}>{r.action === "approved" ? "Approved" : "Rejected"}</span>
                  </td>
                  <td>
                    {s ? `${speciesById(s.speciesId)?.common} × ${s.count}` : r.id} <span className="faint mono">{r.id}</span>
                  </td>
                  <td>{r.reason ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {decisions.length ? (
        <button type="button" className="btn" style={{ alignSelf: "flex-start" }} onClick={clearDecisions}>
          <Icon name="trash" size={20} /> Clear my decisions in this browser
        </button>
      ) : null}
    </div>
  );
}
