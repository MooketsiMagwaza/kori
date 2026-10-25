"use client";

import { useState } from "react";
import Link from "next/link";
import { isPublic } from "@/shared/rules";
import { Icon } from "@/shared/icons";
import { SampleNote } from "@/components/bits";
import { SightingRow } from "@/components/sighting-row";
import { useNow, useStoreData } from "@/lib/hooks";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "mine", label: "Yours" },
  { id: "shared", label: "Shared with you" },
] as const;

export default function SightingsPage() {
  const now = useNow();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const { data } = useStoreData((store) => store.listSightings(new Date()), []);

  const visible =
    now && data ? data.filter((s) => (s.source === "sample" ? isPublic(s, now) : true)).filter((s) => filter === "all" || s.source === filter) : [];

  return (
    <div className="page">
      <div className="page-head">
        <h1>Sightings</h1>
        <p className="muted">Approved sightings from others, shown as areas, plus everything you logged or received on this phone.</p>
      </div>
      <div className="btn-row" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className="btn"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <SampleNote />
      {!now || !data ? (
        <p className="empty">Loading sightings…</p>
      ) : visible.length ? (
        <ul className="list">
          {visible.map((s) => (
            <SightingRow key={s.id} sighting={s} now={now} />
          ))}
        </ul>
      ) : (
        <div className="card empty">
          <p>{filter === "mine" ? "You have not logged anything on this phone yet." : "Nothing here yet. Scan a code from another phone to receive a sighting."}</p>
          <Link href={filter === "mine" ? "/log" : "/scan"} className="btn" style={{ alignSelf: "center" }}>
            <Icon name={filter === "mine" ? "plus" : "scan"} size={20} /> {filter === "mine" ? "Log a sighting" : "Scan a code"}
          </Link>
        </div>
      )}
    </div>
  );
}
