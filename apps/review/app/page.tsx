"use client";

import { useState } from "react";
import { isInsideReserve, sampleReserve } from "@/shared/reserve";
import { isPublic, sensitivityOf, visibleFrom, type SightingStatus } from "@/shared/rules";
import { reviewChecks, sampleSightings, type Sighting } from "@/shared/sample-sightings";
import { speciesById } from "@/shared/species";
import { Icon } from "@/shared/icons";
import { ReviewMap } from "@/components/review-map";
import { decide, latestById, useDecisions } from "@/lib/decisions";
import { clockTime, useNow, when } from "@/lib/use-now";

const TABS: { id: "pending" | "approved" | "rejected" | "all"; label: string }[] = [
  { id: "pending", label: "Waiting" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
];

const REASONS = [
  "The photo shows a different species.",
  "Duplicate of an earlier report from the same vehicle.",
  "The location is outside the reserve.",
  "Not enough detail to confirm.",
];

const LABEL: Record<SightingStatus, string> = { queued: "On the phone", pending: "Waiting", approved: "Approved", rejected: "Rejected" };
const CHIP: Record<SightingStatus, string> = { queued: "chip-queued", pending: "chip-pending", approved: "chip-approved", rejected: "chip-rejected" };

function Detail({ sighting, now }: { sighting: Sighting; now: Date }) {
  const [reason, setReason] = useState(REASONS[0]);
  const [other, setOther] = useState("");
  const species = speciesById(sighting.speciesId);
  const sensitive = sensitivityOf(sighting) === "sensitive";
  const checks = reviewChecks(sighting, isInsideReserve(sampleReserve(), sighting.point), now);
  const publicAt = visibleFrom(sighting);
  return (
    <div className="card queue-detail" aria-live="polite">
      <div className="section-head">
        <h2>
          {species?.common} <span className="muted">× {sighting.count}</span>
        </h2>
        <span className={`chip ${CHIP[sighting.status]}`}>{LABEL[sighting.status]}</span>
      </div>
      <p className="muted">
        {species?.setswana ? `${species.setswana} · ` : ""}
        <i>{species?.scientific}</i> · seen {when(sighting.seenAt, now)} ({clockTime(sighting.seenAt)}) by {sighting.observer}
      </p>
      {sensitive ? (
        <p className="notice notice-bad">
          <Icon name="eyeOff" size={20} />
          <span>
            <strong>Sensitive{sighting.denOrNest ? " (den or nest)" : ""}.</strong> If approved, it is published only as presence in a 10 km area after 7 days, with no guidance and
            no QR share.
          </span>
        </p>
      ) : null}
      <div className="thumb-lg">
        <ReviewMap point={sighting.point} accuracy={sighting.accuracyMeters} cell={sighting.cell} sensitive={sensitive} />
      </div>
      <p className="faint">
        Black dot: the exact point the observer&apos;s phone recorded, visible to reviewers only. Square: the {sighting.cell.sizeMeters / 1000} km area that would be published.
        Fictional sample reserve.
      </p>
      {sighting.notes ? <p>“{sighting.notes}”</p> : null}
      <h3>Automated checks</h3>
      <ul className="checks">
        {checks.map((c) => (
          <li key={c.id}>
            <span className={c.passed ? "ok" : "no"}>
              <Icon name={c.passed ? "check" : "alert"} size={20} />
            </span>
            <span>
              <strong>{c.label}.</strong> <span className="muted">{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      {sighting.status === "pending" ? (
        <>
          <button type="button" className="btn btn-primary" onClick={() => decide({ id: sighting.id, status: "approved" })}>
            <Icon name="check" size={22} /> Approve
          </button>
          <p className="faint">
            {now >= publicAt ? "It becomes visible to others at once, as an area." : `Approved sightings stay hidden until ${clockTime(publicAt.toISOString())} on ${publicAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.`}
          </p>
          <fieldset>
            <legend>Or reject it</legend>
            <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason">
              {REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
              <option value="other">Another reason…</option>
            </select>
            {reason === "other" ? <input type="text" value={other} onChange={(e) => setOther(e.target.value)} placeholder="Tell the observer why" aria-label="Other reason" /> : null}
            <button
              type="button"
              className="btn btn-danger"
              style={{ alignSelf: "flex-start" }}
              disabled={reason === "other" && !other.trim()}
              onClick={() => decide({ id: sighting.id, status: "rejected", reason: reason === "other" ? other.trim() : reason })}
            >
              <Icon name="x" size={20} /> Reject with this reason
            </button>
          </fieldset>
        </>
      ) : (
        <p className="notice notice-plain">
          {sighting.status === "approved"
            ? isPublic(sighting, now)
              ? "Approved and visible to others as an area."
              : `Approved. Visible to others from ${clockTime(publicAt.toISOString())}, ${publicAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.`
            : `Rejected: ${sighting.review?.reason ?? "no reason recorded"}`}
        </p>
      )}
    </div>
  );
}

export default function QueuePage() {
  const now = useNow();
  const decisions = useDecisions();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("pending");
  const [selected, setSelected] = useState<string | null>(null);

  if (!now) return <p className="empty">Loading the queue…</p>;
  const latest = latestById(decisions);
  const all: Sighting[] = sampleSightings(now).map((s) => {
    const d = latest.get(s.id);
    return d ? { ...s, status: d.status, review: { decidedAt: d.at, reviewer: "You (prototype)", reason: d.reason } } : s;
  });
  const counts = { pending: 0, approved: 0, rejected: 0, all: all.length };
  for (const s of all) if (s.status in counts) counts[s.status as "pending" | "approved" | "rejected"] += 1;
  const shown = all.filter((s) => tab === "all" || s.status === tab);
  const current = all.find((s) => s.id === selected) ?? shown[0] ?? null;

  return (
    <div className="stack" style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
      <div className="page-head">
        <h1>Review queue</h1>
        <p className="muted">Nothing is seen by anyone else until it is approved here, and even then only as an area, after its delay.</p>
      </div>
      <div className="tabs" role="group" aria-label="Show">
        {TABS.map((t) => (
          <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
            <span className="count">{counts[t.id]}</span>
          </button>
        ))}
      </div>
      <div className="queue">
        <ul className="list queue-list" aria-label="Sightings">
          {shown.length === 0 ? <li className="empty">Nothing here. The queue is clear.</li> : null}
          {shown.map((s) => {
            const species = speciesById(s.speciesId);
            const sensitive = sensitivityOf(s) === "sensitive";
            return (
              <li key={s.id}>
                <button type="button" className="row" aria-current={current?.id === s.id ? "true" : undefined} onClick={() => setSelected(s.id)}>
                  <span className="row-main">
                    <span className="row-title">
                      {species?.common} <span className="muted">× {s.count}</span>
                    </span>
                    <span className="row-sub">
                      {when(s.seenAt, now)} · {s.observer}
                    </span>
                  </span>
                  <span className="row-end">
                    <span className={`chip ${CHIP[s.status]}`}>{LABEL[s.status]}</span>
                    {sensitive ? <span className="chip chip-sensitive">Sensitive</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {current ? <Detail key={current.id} sighting={current} now={now} /> : null}
      </div>
    </div>
  );
}
