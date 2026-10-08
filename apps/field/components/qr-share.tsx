"use client";

/** The QR code for a sighting. Generated on the phone; the link opens Kori's /shared page. */

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { Sighting } from "@/shared/sample-sightings";
import { canShare } from "@/shared/rules";
import { shareLink } from "@/shared/share-code";
import { Icon } from "@/shared/icons";

export function QrShare({ sighting, now }: { sighting: Sighting; now: Date }) {
  const permission = canShare(sighting, now);
  const [svg, setSvg] = useState<string | null>(null);
  const [link, setLink] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!permission.ok) return;
    const url = shareLink(window.location.origin, {
      speciesId: sighting.speciesId,
      count: sighting.count,
      seenAt: sighting.seenAt,
      cell: sighting.cell,
      reviewed: sighting.status === "approved",
    });
    let alive = true;
    QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#1b1611", light: "#ffffff" } })
      .then((text) => {
        if (alive) {
          setSvg(text);
          setLink(url);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [permission.ok, sighting.speciesId, sighting.count, sighting.seenAt, sighting.cell, sighting.status]);

  if (!permission.ok) {
    return (
      <p className="notice notice-plain">
        <Icon name="lock" size={20} />
        <span>{permission.reason}</span>
      </p>
    );
  }

  return (
    <div className="card">
      <p className="muted">
        Another phone can scan this with no signal. It carries the species, count, time to the quarter hour and the 1 km area. Never the exact point, never who saw it.
      </p>
      {svg ? <div className="qr-box" role="img" aria-label="QR code for this sighting" dangerouslySetInnerHTML={{ __html: svg }} /> : <p className="faint">Drawing the code…</p>}
      {link ? (
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            onClick={() => {
              navigator.clipboard
                ?.writeText(link)
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }}
          >
            <Icon name="share" size={20} /> {copied ? "Link copied" : "Copy link"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
