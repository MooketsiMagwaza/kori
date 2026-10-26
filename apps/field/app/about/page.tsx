"use client";

import { useState } from "react";
import { Icon } from "@/shared/icons";
import { getStore } from "@/lib/store";

export default function AboutPage() {
  const [cleared, setCleared] = useState(false);
  return (
    <div className="page">
      <div className="page-head">
        <h1>Safety, privacy and sample data</h1>
        <p className="muted">The rules Kori follows, and what in this prototype is real.</p>
      </div>

      <section id="demo-data" aria-labelledby="demo-h">
        <h2 id="demo-h">About the demo data</h2>
        <div className="card">
          <p>
            Everything you see in this demo is sample data. The reserve, the sightings, the observers and the reviews are invented.
          </p>
          <p>
            <strong>The reserve is fictional.</strong> Its tracks and places are generated and do not match the ground at its coordinates. Do not navigate by it.
          </p>
          <p>
            The backend (the API, the database, and the review and publication rules) is built and tested, but it is not deployed and the apps do not call it yet. Nothing you log is
            sent anywhere: it stays on this phone.
          </p>
          <p className="faint">What does work for real is listed under &ldquo;What is real in this prototype&rdquo;, further down this page.</p>
        </div>
      </section>

      <section>
        <h2>Animals come first</h2>
        <ul className="muted" style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li>No live locations. Others see a sighting only after review, at least an hour later, as a 1 km area.</li>
          <li>Sensitive species (rhino and pangolin in the prototype; the real list will be set with the Department of Wildlife and National Parks), dens and nests: a 10 km area, after 7 days, never guided to, never shared by code.</li>
          <li>Guidance stays on existing tracks and ends at a track, not at the animal. Off-road and night driving are not allowed in Botswana&apos;s parks.</li>
          <li>Predicted tracks are labelled predicted, with a confidence level, and are off unless you switch them on. They are no substitute for a guide or a verified track.</li>
        </ul>
      </section>

      <section>
        <h2>Your data</h2>
        <ul className="muted" style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li>Your exact points stay on this phone. Photos are redrawn on the phone, which strips the location the camera hid in them.</li>
          <li>Trip recording is opt-in for each trip and stays on this phone. You can delete trips at any time.</li>
          <li>GPS traces are personal data under Botswana&apos;s Data Protection Act, 2024.</li>
        </ul>
      </section>

      <section>
        <h2>What is real in this prototype</h2>
        <div className="card">
          <p>
            <strong>Real:</strong> logging a sighting and its photos into this phone&apos;s storage; the offline outbox; downloading the sample pack into this phone and drawing it with no
            network; your GPS position; routing along tracks on the phone; QR codes and scanning; trip recording on the phone.
          </p>
          <p>
            <strong>Sample:</strong> every other sighting, observer and review; the reserve itself, which is fictional; the predicted and GPS-confirmed track labels.
          </p>
          <p>
            <strong>Not built yet:</strong> the server, so nothing is sent; real park packs; sharing trips; the track map built from many trips; imagery-based predictions.
          </p>
        </div>
      </section>

      <section>
        <h2>Clear this phone</h2>
        <p className="muted">Delete every sighting, photo, trip and pack Kori stored on this phone.</p>
        <button
          type="button"
          className="btn btn-danger"
          style={{ alignSelf: "flex-start" }}
          onClick={async () => {
            if (!window.confirm("Delete everything Kori stored on this phone?")) return;
            await getStore().clearAll();
            setCleared(true);
          }}
        >
          <Icon name="trash" size={20} /> Delete Kori&apos;s data
        </button>
        {cleared ? <p className="notice notice-good">Done. Kori&apos;s data on this phone is gone.</p> : null}
      </section>

      <section id="credits">
        <h2>Credits and data licences</h2>
        <p className="faint">
          Maps by MapLibre GL JS (BSD-3-Clause), read from the phone&apos;s storage with PMTiles (BSD-3-Clause). Titles in Zilla Slab and map labels in Noto Sans (both SIL Open Font
          License). QR codes by node-qrcode (MIT), scanning fallback by jsQR (Apache-2.0), storage by idb (ISC). Kori&apos;s code is © 2026 Mooketsi Vincent Magwaza, all rights reserved.
        </p>
        <p className="faint">
          <strong>Real park packs</strong> (private for now, never published): map data <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>, available
          under the Open Database License (ODbL 1.0). A pack&apos;s base map (cut from the Protomaps basemap, an ODbL Produced Work) and its track graph are derived from OpenStreetMap,
          so they are ODbL too, whatever the licence of Kori&apos;s code. Satellite imagery: contains modified Copernicus Sentinel data 2025 (Sentinel-2, processed by Kori: stretched,
          reprojected and tiled). The sightings shown on a real pack are sample data.
        </p>
      </section>
    </div>
  );
}
