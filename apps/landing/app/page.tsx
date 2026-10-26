import { CellCompare, GuidanceArt, HeroMap, TripArt } from "@/components/reserve-art";
import { Icon, KoriLogo } from "@/shared/icons";
import { ThemeToggle } from "@/shared/theme-toggle";
import { formatDistance } from "@/shared/geo";
import { sampleReserve } from "@/shared/reserve";
import { routeAlongTracks } from "@/shared/routing";
import { publicSightings, sampleSightings } from "@/shared/sample-sightings";
import { speciesById } from "@/shared/species";
import { API_DOCS_URL, FIELD_APP_URL } from "@/lib/links";

const NOW = new Date("2026-10-07T15:00:00Z");

function heroRoute() {
  const reserve = sampleReserve();
  const visible = publicSightings(sampleSightings(NOW), NOW).filter((s) => !s.sensitive);
  const target = visible.find((s) => s.speciesId === "leopard") ?? visible[0];
  const gate = reserve.nodes.find((n) => n.kind === "gate")!;
  const route = routeAlongTracks(reserve, gate.at, target.cell.centre, { includePredicted: false });
  return { species: speciesById(target.speciesId)?.common ?? "Sighting", length: route ? formatDistance(route.lengthMeters) : "", gate: gate.name };
}

function sampleResponse() {
  const first = publicSightings(sampleSightings(NOW), NOW).find((s) => !s.sensitive)!;
  return JSON.stringify(
    {
      data: [
        {
          id: first.id,
          species: first.speciesId,
          count: first.count,
          seen_at: first.seenAt,
          area: { cell: first.cell.id, centre: first.cell.centre, size_m: first.cell.sizeMeters },
          sensitive: first.sensitive,
        },
      ],
      sample: true,
    },
    null,
    2,
  );
}

export default function Home() {
  const hero = heroRoute();
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="wrap header-row">
          <a href="#main" className="kori-logo" aria-label="Kori home">
            <KoriLogo size={36} />
          </a>
          <nav aria-label="Sections" className="site-nav">
            <a href="#offline">No signal</a>
            <a href="#safety">Safety</a>
            <a href="#api">Researchers</a>
            <a href="#status">Status</a>
          </nav>
          <div className="header-end">
            <a className="btn btn-primary btn-sm" href={FIELD_APP_URL}>
              Open the app
            </a>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <section className="hero">
          <div className="wrap hero-grid">
            <div className="hero-copy">
              <h1>Wildlife sightings that keep working where the signal ends.</h1>
              <p className="lead">
                Kori is a safari app for Botswana. Log what you see with no signal, find your way along the park&apos;s own tracks to what others have seen, and share a sighting
                phone to phone with a QR code.
              </p>
              <div className="btn-row">
                <a className="btn btn-primary" href={FIELD_APP_URL}>
                  Open the field app <Icon name="arrowRight" size={20} />
                </a>
                <a className="btn" href="#safety">
                  How Kori protects animals
                </a>
              </div>
            </div>
            <div className="phone" aria-label="The field app's map screen">
              <div className="phone-screen">
                <HeroMap />
                <div className="phone-banner">
                  <strong>No signal.</strong> Map from your downloaded pack.
                </div>
                <div className="phone-sheet">
                  <p className="phone-sheet-title">To the {hero.species.toLowerCase()} area</p>
                  <p>
                    <strong>{hero.length}</strong> along tracks from {hero.gate}
                  </p>
                  <p className="phone-sheet-note">Ends on a track in the area, never at the animal.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="offline" className="band">
          <div className="wrap">
            <h2>Made for parks with no signal</h2>
            <p className="section-lead">Download the park at home or on lodge Wi-Fi. After that, almost everything happens on the phone.</p>
            <div className="table-wrap">
              <table className="split-table">
                <thead>
                  <tr>
                    <th scope="col">Works with no signal</th>
                    <th scope="col">Needs a connection</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Your GPS position on the map. The phone&apos;s satellite receiver needs no mobile network.</td>
                    <td>Downloading or updating a park pack</td>
                  </tr>
                  <tr>
                    <td>Drawing the park from the pack on your phone</td>
                    <td>Sending your sightings for review</td>
                  </tr>
                  <tr>
                    <td>Logging sightings, with photos, into a queue on the phone</td>
                    <td>Receiving other people&apos;s newly approved sightings</td>
                  </tr>
                  <tr>
                    <td>Routing along tracks, computed on the phone</td>
                    <td>Signing in for the first time</td>
                  </tr>
                  <tr>
                    <td>Sharing a sighting by QR code, phone to phone</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="safety">
          <div className="wrap two-col">
            <div className="stack">
              <h2>Animals first</h2>
              <p className="section-lead">A sighting app can lead people, and poachers, to animals. Kori is built so it cannot.</p>
              <ul className="rules">
                <li>
                  <strong>No live locations.</strong> Others see a sighting only after a reviewer approves it and at least an hour has passed.
                </li>
                <li>
                  <strong>An area, never a point.</strong> Published sightings are a 1 km square. The exact point stays on the observer&apos;s phone.
                </li>
                <li>
                  <strong>Sensitive species stay vague.</strong> Rhino and pangolin (the list will be set with the Department of Wildlife and National Parks), dens and nests:
                  presence in a 10 km square, a week later, never guided to, never shared.
                </li>
              </ul>
            </div>
            <figure className="figure">
              <CellCompare />
              <figcaption>
                <span className="key key-cell" /> A giraffe sighting: a 1 km area. <span className="key key-sensitive" /> A rhino sighting: 10 km, dashed, a week later.
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="band">
          <div className="wrap two-col reverse">
            <figure className="figure">
              <GuidanceArt />
              <figcaption>
                <span className="key key-route" /> Kori&apos;s route, on tracks. <span className="key key-never" /> The shortcut across country it never offers.
              </figcaption>
            </figure>
            <div className="stack">
              <h2>Guidance on tracks, never across country</h2>
              <p className="section-lead">
                Off-road driving is not allowed in Botswana&apos;s parks. Kori routes only along known roads and tracks, to the nearest track point in a sighting&apos;s area.
              </p>
              <ul className="rules">
                <li>If you leave the route, Kori shows you the way back along the track, not a straight line.</li>
                <li>
                  Tracks predicted from imagery are dashed, labelled <em>predicted</em> with a confidence level, and left out of routing until you switch them on. They are no
                  substitute for a guide.
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <div className="wrap two-col">
            <div className="stack">
              <h2>Your trips stay yours</h2>
              <p className="section-lead">Kori&apos;s track map grows from GPS trips that people choose to share. A trip trace is personal data, so:</p>
              <ul className="rules">
                <li>Recording is off unless you switch it on, one trip at a time.</li>
                <li>Nothing leaves the phone while you drive. Sharing is a separate choice after the trip.</li>
                <li>The first and last kilometre are cut, times are rounded to the minute, and only tracks driven on three or more separate trips are ever published.</li>
                <li>You can delete a trip at any time.</li>
              </ul>
            </div>
            <figure className="figure">
              <TripArt />
              <figcaption>A synthetic trip. The faded ends are removed before it could be shared.</figcaption>
            </figure>
          </div>
        </section>

        <section id="api" className="band">
          <div className="wrap two-col">
            <div className="stack">
              <h2>Reviewed data for researchers and lodges</h2>
              <p className="section-lead">Approved sightings are available through a keyed API, with the same areas and delays as the app.</p>
              <ul className="rules">
                <li>Keys are scoped (sightings, species, tracks) and rate limited per hour and per month.</li>
                <li>No raw GPS traces, no exact points, no observers, ever.</li>
                <li>The track layer will be published under ODbL, credited to OpenStreetMap where it builds on it.</li>
              </ul>
              <a className="btn" href={API_DOCS_URL} style={{ alignSelf: "flex-start" }}>
                <Icon name="code" size={20} /> Read the API docs
              </a>
            </div>
            <figure className="figure code-figure">
              <pre className="code" aria-label="Example response from GET /v1/sightings">
                <code>{`GET /v1/sightings?area=sample-reserve\nAuthorization: Bearer <your key>\n\n${sampleResponse()}`}</code>
              </pre>
              <figcaption>An example response, built from the sample data. The API server itself is not deployed yet.</figcaption>
            </figure>
          </div>
        </section>

        <section id="status">
          <div className="wrap">
            <h2>What works today</h2>
            <p className="section-lead">Kori is an early prototype. This is exactly where it stands.</p>
            <div className="table-wrap">
              <table className="status-table">
                <tbody>
                  <tr>
                    <th scope="row">
                      <span className="chip chip-approved">Works in the browser</span>
                    </th>
                    <td>
                      Logging sightings and photos into the phone&apos;s storage, the offline queue, downloading the sample park and drawing it with no tiles, your GPS position, routing along
                      tracks, QR share and scan, opt-in trip recording.
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">
                      <span className="chip chip-sample">Sample data</span>
                    </th>
                    <td>Every other sighting, observer and review, and the reserve itself, which is fictional.</td>
                  </tr>
                  <tr>
                    <th scope="row">
                      <span className="chip chip-pending">Not built yet</span>
                    </th>
                    <td>
                      The server (nothing is sent yet), real park packs, sharing trips, the review console, the API, and tracks predicted from satellite imagery, which wait on a
                      feasibility check.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {FIELD_APP_URL === "#status" ? <p className="faint">The field app link appears here once it is deployed.</p> : null}
            <div id="demo-data" className="demo-about">
              <h3>About the demo data</h3>
              <p>
                Everything you see in this demo is sample data. The reserve, the sightings, the observers and the reviews are invented, and the drawings on this page are made from the
                same invented data.
              </p>
              <p>
                <strong>The reserve is fictional.</strong> Its tracks and places are generated and do not match the ground at its coordinates, so it must not be used to navigate.
              </p>
              <p>
                The backend (the API, the database, and the review and publication rules) is built and tested, but it is not deployed and the apps do not call it yet. Nothing you
                log is sent anywhere.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap footer-row">
          <div className="stack-sm">
            <KoriLogo size={28} />
            <p className="faint">Named after the kori bustard, kgori in Setswana, Botswana&apos;s national bird.</p>
          </div>
          <div className="stack-sm footer-end">
            <a className="demo-chip" href="#demo-data">
              Demo data
            </a>
            <p className="faint">© 2026 Mooketsi Vincent Magwaza. All rights reserved.</p>
          </div>
        </div>
      </footer>
      <ThemeToggle />
    </>
  );
}
