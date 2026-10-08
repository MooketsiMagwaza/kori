"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { decodeShare, type DecodeResult } from "@/shared/share-code";
import { speciesById } from "@/shared/species";
import { Icon } from "@/shared/icons";
import { CellThumb } from "@/components/cell-thumb";
import { clockTime, relativeTime, useNow } from "@/lib/hooks";
import { getStore } from "@/lib/store";

export default function SharedPage() {
  const router = useRouter();
  const now = useNow();
  const [result, setResult] = useState<DecodeResult | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const read = () => setResult(window.location.hash.length > 1 ? decodeShare(window.location.hash) : { ok: false, reason: "No sighting code in this link." });
    const t = window.setTimeout(read, 0);
    window.addEventListener("hashchange", read);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("hashchange", read);
    };
  }, []);

  if (!result || !now) return <div className="page"><p className="empty">Reading the code…</p></div>;

  if (!result.ok) {
    return (
      <div className="page">
        <h1>Could not open this code</h1>
        <p className="notice notice-warn">
          <Icon name="alert" size={20} />
          <span>{result.reason}</span>
        </p>
        <Link href="/scan" className="btn" style={{ alignSelf: "flex-start" }}>
          <Icon name="scan" size={20} /> Scan another
        </Link>
      </div>
    );
  }

  const s = result.sighting;
  const species = speciesById(s.speciesId);
  return (
    <div className="page">
      <div className="page-head">
        <p className="kicker">Shared with you, read on this phone with no server</p>
        <h1>
          {species?.common} <span className="muted">× {s.count}</span>
        </h1>
        <p className="muted">
          Seen {relativeTime(s.seenAt, now)} (around {clockTime(s.seenAt)}) · {s.reviewed ? "approved in review" : "not reviewed yet"}
        </p>
      </div>
      <div className="thumb-lg">
        <CellThumb cell={s.cell} title={`The ${s.cell.sizeMeters / 1000} km area of the shared sighting`} />
      </div>
      <p className="faint">The code holds a 1 km area, not a point, and nothing about who saw it. The background drawing is the fictional sample reserve.</p>
      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          const saved = await getStore().saveShared(s);
          router.push(`/sighting?id=${encodeURIComponent(saved.id)}`);
        }}
      >
        <Icon name="download" size={22} /> Save to this phone
      </button>
    </div>
  );
}
