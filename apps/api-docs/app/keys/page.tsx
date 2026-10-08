import type { Metadata } from "next";

export const metadata: Metadata = { title: "Keys and scopes" };

const SAMPLE_KEYS = [
  { name: "Sample research group", prefix: "kori_sample_7Hq…", scopes: ["sightings:read", "species:read"], created: "2026-09-14", last: "2026-10-07" },
  { name: "Lodge guide tablet", prefix: "kori_sample_c2N…", scopes: ["sightings:read"], created: "2026-09-30", last: "2026-10-06" },
  { name: "Track map mirror", prefix: "kori_sample_Pa9…", scopes: ["tracks:read"], created: "2026-10-01", last: "never" },
];

export default function KeysPage() {
  return (
    <>
      <h1>Keys and scopes</h1>
      <p className="lead">Every request needs a key. A key carries scopes, and each endpoint needs one scope.</p>

      <h2>Scopes</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Scope</th>
              <th scope="col">Lets the key read</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>sightings:read</code>
              </td>
              <td>Approved sightings, as areas, after their delay</td>
            </tr>
            <tr>
              <td>
                <code>species:read</code>
              </td>
              <td>The species list and each species&apos; publication rules</td>
            </tr>
            <tr>
              <td>
                <code>tracks:read</code>
              </td>
              <td>The aggregated track map (ODbL)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Sending a key</h2>
      <pre>
        <code>{`Authorization: Bearer kori_live_…`}</code>
      </pre>
      <ul>
        <li>Keys are shown once, when created. Kori stores only a hash of the key, so a lost key is replaced, not recovered.</li>
        <li>Revoke a key at any time; revocation takes effect on the next request.</li>
        <li>Never put a key in a web page or an app that others can download. Call the API from your server.</li>
        <li>
          A missing or unknown key gets <code>401</code>; a key without the endpoint&apos;s scope gets <code>403</code>.
        </li>
      </ul>

      <h2>
        Your keys <span className="chip chip-sample">Sample</span>
      </h2>
      <p className="muted">
        This is how the key list will look in the developer console. These rows are invented; they are not real keys and nothing here can create one yet.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Key</th>
              <th scope="col">Scopes</th>
              <th scope="col">Created</th>
              <th scope="col">Last used</th>
            </tr>
          </thead>
          <tbody>
            {SAMPLE_KEYS.map((k) => (
              <tr key={k.name}>
                <td>{k.name}</td>
                <td>
                  <code>{k.prefix}</code>
                </td>
                <td>
                  {k.scopes.map((s) => (
                    <code key={s} style={{ marginRight: 6 }}>
                      {s}
                    </code>
                  ))}
                </td>
                <td>{k.created}</td>
                <td>{k.last}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
