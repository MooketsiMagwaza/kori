"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { canGuide, isPublic, sensitivityOf, visibleFrom } from "@/shared/rules";
import { speciesById } from "@/shared/species";
import { formatDistance } from "@/shared/geo";
import { Icon } from "@/shared/icons";
import { CellThumb } from "@/components/cell-thumb";
import { QrShare } from "@/components/qr-share";
import { SampleNote, SensitiveChip, SourceChip, StatusChip } from "@/components/bits";
import { clockTime, relativeTime, useNow, useStoreData } from "@/lib/hooks";
import { getStore } from "@/lib/store";

function Photos({ id }: { id: string }) {
  const { data } = useStoreData((store) => store.photos(id), [id]);
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    if (!data) return;
    const made = data.map((blob) => URL.createObjectURL(blob));
    const t = window.setTimeout(() => setUrls(made), 0);
    return () => {
      window.clearTimeout(t);
      made.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [data]);
  if (!urls.length) return null;
  return (
    <div className="photo-strip">
      {urls.map((url, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={url} src={url} alt={`Photo ${i + 1}`} />
      ))}
    </div>
  );
}

function Detail() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id") ?? "";
  const saved = params.get("saved") === "1";
  const now = useNow();
  const { data: sighting, error } = useStoreData(async (store) => (await store.getSighting(id, new Date())) ?? null, [id]);

  if (error) return <p className="notice notice-bad">{error}</p>;
  if (!now || sighting === undefined) return <p className="empty">Loading…</p>;
  if (sighting === null) {
    return (
      <div className="card">
        <h1>Sighting not found</h1>
        <p className="muted">It may have been deleted from this phone.</p>
        <Link href="/sightings" className="btn">
          Back to sightings
        </Link>
      </div>
    );
  }

  const species = speciesById(sighting.speciesId);
  const sensitive = sensitivityOf(sighting) === "sensitive";
  if (sighting.source === "sample" && !isPublic(sighting, now)) {
    return (
      <div className="card">
        <h1>Not visible yet</h1>
        <p className="muted">This sighting is waiting for review or for its delay to pass. Until then only reviewers can see it.</p>
        <Link href="/sightings" className="btn">
          Back to sightings
        </Link>
      </div>
    );
  }
  const guide = canGuide(sighting, now);
  const own = sighting.source === "mine";
  const km = sighting.cell.sizeMeters / 1000;

  return (
    <>
      <Link href="/sightings" className="back-link">
        <Icon name="chevronLeft" size={20} /> Sightings
      </Link>
      {saved ? (
        <p className="notice notice-good" role="status">
          <Icon name="check" size={20} />
          <span>
            <strong>Saved on this phone.</strong> It goes to a reviewer when Kori can reach its server. In this prototype no server is connected yet, so it stays here.
          </span>
        </p>
      ) : null}
      <div className="page-head">
        <h1>
          {species?.common ?? "Unknown species"} <span className="muted">× {sighting.count}</span>
        </h1>
        <p className="muted">
          {species?.setswana ? `${species.setswana} · ` : ""}
          <i>{species?.scientific}</i>
        </p>
        <div className="btn-row" style={{ gap: 6 }}>
          <SourceChip source={sighting.source} />
          <StatusChip status={sighting.status} />
          {sensitive ? <SensitiveChip /> : null}
        </div>
      </div>
      {sighting.source === "sample" ? <SampleNote /> : null}

      <div className="thumb-lg">
        <CellThumb cell={sighting.cell} sensitive={sensitive} showTracks={!sensitive} title={`The ${km} km area of this sighting`} />
      </div>

      <dl className="facts">
        <dt>Seen</dt>
        <dd>
          {relativeTime(sighting.seenAt, now)} ({clockTime(sighting.seenAt)})
        </dd>
        <dt>Area</dt>
        <dd>
          A {km} km square <span className="faint mono">{sighting.cell.id}</span>
        </dd>
        {own ? (
          <>
            <dt>Exact point</dt>
            <dd>
              <span className="mono">
                {sighting.point[1].toFixed(5)}, {sighting.point[0].toFixed(5)}
              </span>
              {sighting.accuracyMeters ? ` · within ${formatDistance(sighting.accuracyMeters)}` : ""}
              <br />
              <span className="faint">Only on this phone and with reviewers. Never published.</span>
            </dd>
          </>
        ) : null}
        <dt>Seen by</dt>
        <dd>{own ? "You" : sighting.source === "shared" ? "Received by QR code" : "Not shown to others"}</dd>
        {sighting.notes ? (
          <>
            <dt>Notes</dt>
            <dd>{sighting.notes}</dd>
          </>
        ) : null}
        <dt>Public from</dt>
        <dd>
          {clockTime(visibleFrom(sighting).toISOString())}, {sensitive ? "7 days" : "1 hour"} after it was seen, once approved
        </dd>
      </dl>

      {own ? (
        <Photos id={sighting.id} />
      ) : sighting.photos ? (
        <p className="faint">{sighting.photos} photo(s) attached by the observer (sample; not included in the prototype).</p>
      ) : null}

      {sighting.status === "rejected" && sighting.review?.reason ? (
        <p className="notice notice-bad">
          <Icon name="x" size={20} />
          <span>
            <strong>Rejected in review.</strong> {sighting.review.reason}
          </span>
        </p>
      ) : null}

      <section aria-labelledby="guide-h">
        <h2 id="guide-h">Get there along tracks</h2>
        {guide.ok ? (
          <>
            <p className="muted">
              Kori routes you on known tracks to the nearest track point in this area, never to the animal. Stay on the tracks: off-road driving is not allowed in
              Botswana&apos;s parks.
            </p>
            <Link href={`/map?to=${encodeURIComponent(sighting.id)}`} className="btn btn-primary btn-block">
              <Icon name="route" size={22} /> Route along tracks
            </Link>
          </>
        ) : (
          <p className="notice notice-plain">
            <Icon name="lock" size={20} />
            <span>{guide.reason}</span>
          </p>
        )}
      </section>

      <section aria-labelledby="share-h">
        <h2 id="share-h">Share with no signal</h2>
        <QrShare sighting={sighting} now={now} />
      </section>

      {own || sighting.source === "shared" ? (
        <button
          type="button"
          className="btn btn-danger"
          onClick={async () => {
            await getStore().deleteSighting(sighting.id);
            router.push("/sightings");
          }}
        >
          <Icon name="trash" size={20} /> Delete from this phone
        </button>
      ) : null}
    </>
  );
}

export default function SightingPage() {
  return (
    <div className="page">
      <Suspense fallback={<p className="empty">Loading…</p>}>
        <Detail />
      </Suspense>
    </div>
  );
}
