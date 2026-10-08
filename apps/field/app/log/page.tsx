"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { LonLat } from "@/shared/geo";
import { formatDistance } from "@/shared/geo";
import { SPECIES, speciesById } from "@/shared/species";
import { cellFor, ruleFor, sensitivityOf } from "@/shared/rules";
import { sampleReserve, visibleEdges } from "@/shared/reserve";
import { Icon } from "@/shared/icons";
import { CellThumb } from "@/components/cell-thumb";
import { reencodePhoto } from "@/lib/photos";
import { getStore } from "@/lib/store";

const FIRST = ["elephant", "lion", "leopard", "giraffe", "buffalo", "zebra", "wild-dog", "kori-bustard"];

function localInputValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

type Where = { point: LonLat; accuracy?: number; how: "gps" | "demo" };

export default function LogPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [speciesId, setSpeciesId] = useState<string | null>(null);
  const [count, setCount] = useState(1);
  const [when, setWhen] = useState("");
  const [where, setWhere] = useState<Where | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [denOrNest, setDenOrNest] = useState(false);
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<{ blob: Blob; url: string }[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setWhen(localInputValue(new Date())), 0);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), [photos]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FIRST.map((id) => speciesById(id)!).concat(SPECIES.filter((s) => !FIRST.includes(s.id)));
    return SPECIES.filter((s) => [s.common, s.setswana ?? "", s.scientific].some((name) => name.toLowerCase().includes(q)));
  }, [query]);

  const sensitive = speciesId ? sensitivityOf({ speciesId, denOrNest }) === "sensitive" : denOrNest;
  const cell = where && speciesId ? cellFor(where.point, ruleFor({ speciesId, denOrNest }).cellMeters) : null;

  function locateWithGps() {
    if (!("geolocation" in navigator)) {
      setGeoError("This browser cannot read your position.");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setWhere({ point: [pos.coords.longitude, pos.coords.latitude], accuracy: pos.coords.accuracy, how: "gps" });
        setLocating(false);
      },
      (err) => {
        setGeoError(err.code === err.PERMISSION_DENIED ? "Location permission is off. Turn it on for this site, or use a demo spot." : "No GPS fix yet. Try again in the open, or use a demo spot.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 45_000, maximumAge: 10_000 },
    );
  }

  function pickDemoSpot() {
    const tracks = visibleEdges(sampleReserve(), { predicted: false });
    const edge = tracks[Math.floor(Math.random() * tracks.length)];
    const at = edge.line[Math.floor(edge.line.length / 2)];
    setWhere({ point: [at[0] + (Math.random() - 0.5) * 0.004, at[1] + (Math.random() - 0.5) * 0.004], accuracy: 10, how: "demo" });
  }

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    setPhotoError(null);
    const next: { blob: Blob; url: string }[] = [];
    for (const file of Array.from(files).slice(0, 4 - photos.length)) {
      try {
        const blob = await reencodePhoto(file);
        next.push({ blob, url: URL.createObjectURL(blob) });
      } catch {
        setPhotoError("One photo could not be read. Try another.");
      }
    }
    setPhotos((current) => [...current, ...next]);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!speciesId) return setError("Choose a species first.");
    if (!where) return setError("Add where you saw it.");
    setSaving(true);
    setError(null);
    try {
      const sighting = await getStore().logSighting({
        speciesId,
        count,
        seenAt: when ? new Date(when).toISOString() : new Date().toISOString(),
        point: where.point,
        accuracyMeters: where.accuracy ? Math.round(where.accuracy) : undefined,
        denOrNest,
        notes: notes.trim() || undefined,
        photos: photos.map((p) => p.blob),
      });
      router.push(`/sighting?id=${encodeURIComponent(sighting.id)}&saved=1`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The sighting could not be saved.");
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Log a sighting</h1>
        <p className="muted">Saved on this phone first. Nobody else sees it until a reviewer approves it, and never as the exact spot.</p>
      </div>

      <form className="form" onSubmit={save} noValidate>
        <fieldset>
          <legend>What did you see?</legend>
          <input type="search" placeholder="Search, e.g. lion, tau, kudu" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search species" />
          <div className="species-grid" role="group" aria-label="Species">
            {list.map((s) => (
              <button key={s.id} type="button" className="species-btn" aria-pressed={speciesId === s.id} onClick={() => setSpeciesId(s.id)}>
                <span>{s.common}</span>
                {s.setswana ? <small>{s.setswana}</small> : <small>{s.scientific}</small>}
                {s.sensitivity === "sensitive" ? <span className="chip chip-sensitive">Sensitive</span> : null}
              </button>
            ))}
            {!list.length ? <p className="faint">No species match “{query}”.</p> : null}
          </div>
        </fieldset>

        <div className="field">
          <span className="label" id="count-label">
            How many?
          </span>
          <div className="stepper" role="group" aria-labelledby="count-label">
            <button type="button" className="icon-btn" onClick={() => setCount((c) => Math.max(1, c - 1))} aria-label="One fewer">
              −
            </button>
            <input type="number" inputMode="numeric" min={1} max={500} value={count} onChange={(e) => setCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} aria-labelledby="count-label" />
            <button type="button" className="icon-btn" onClick={() => setCount((c) => Math.min(500, c + 1))} aria-label="One more">
              +
            </button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="when">When?</label>
          <input id="when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </div>

        <fieldset>
          <legend>Where?</legend>
          <p className="hint">Your phone keeps the exact point. Everyone else only ever sees the {sensitive ? "10 km" : "1 km"} square it falls in.</p>
          <div className="btn-row">
            <button type="button" className="btn" onClick={locateWithGps} disabled={locating}>
              <Icon name="locate" size={20} /> {locating ? "Finding you…" : "Use my GPS"}
            </button>
            <button type="button" className="btn" onClick={pickDemoSpot}>
              <Icon name="pin" size={20} /> Demo spot in the sample reserve
            </button>
          </div>
          {geoError ? <p className="notice notice-warn">{geoError}</p> : null}
          {where ? (
            <div className="well">
              <p>
                <strong>{where.how === "gps" ? "Your GPS position" : "Demo spot (sample reserve, fictional)"}</strong>
                {where.accuracy ? <span className="muted"> · within {formatDistance(where.accuracy)}</span> : null}
              </p>
              {cell ? (
                <div className="thumb-lg" style={{ maxWidth: 360 }}>
                  <CellThumb cell={cell} sensitive={sensitive} title="The square other people will see" />
                </div>
              ) : (
                <p className="faint">Choose a species to see the square other people will see.</p>
              )}
            </div>
          ) : null}
        </fieldset>

        <label className="check">
          <input type="checkbox" checked={denOrNest} onChange={(e) => setDenOrNest(e.target.checked)} />
          <span>
            <strong>This is a den or a nest</strong>
            <br />
            <span className="hint">Dens and nests are treated as sensitive: a 10 km area, a 7 day delay, no guidance and no sharing.</span>
          </span>
        </label>

        <div className="field">
          <span className="label">Photos (up to 4)</span>
          <p className="hint">Each photo is redrawn on this phone before it is saved, which removes its hidden data, including any GPS position the camera wrote into it.</p>
          {photos.length ? (
            <div className="photo-strip">
              {photos.map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p.url} src={p.url} alt={`Photo ${i + 1}`} />
              ))}
            </div>
          ) : null}
          {photos.length < 4 ? (
            <label className="btn file-btn" style={{ alignSelf: "flex-start" }}>
              <Icon name="camera" size={20} /> Add a photo
              <input type="file" accept="image/*" capture="environment" multiple onChange={(e) => void addPhotos(e.target.files)} />
            </label>
          ) : null}
          {photoError ? <p className="notice notice-warn">{photoError}</p> : null}
        </div>

        <div className="field">
          <label htmlFor="notes">Notes (optional)</label>
          <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What were they doing? Anything a reviewer should know?" maxLength={600} />
        </div>

        {sensitive ? (
          <p className="notice notice-bad">
            <Icon name="eyeOff" size={20} />
            <span>
              <strong>Sensitive.</strong> This will only ever be shown as presence in a 10 km area, after 7 days. Kori will never guide anyone to it or share it by QR code.
            </span>
          </p>
        ) : null}
        {error ? (
          <p className="notice notice-bad" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
          <Icon name="check" size={24} /> {saving ? "Saving…" : "Save on this phone"}
        </button>
      </form>
    </div>
  );
}
