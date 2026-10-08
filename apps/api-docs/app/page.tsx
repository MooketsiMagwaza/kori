import Link from "next/link";
import { BASE_URL, listSightingsExample } from "@/lib/examples";

export default function Overview() {
  return (
    <>
      <h1>Kori API</h1>
      <p className="lead">
        Reviewed wildlife sightings from Botswana&apos;s parks, for researchers, lodges and conservation groups. Every sighting has been approved by a reviewer and is published as an
        area, after a delay, never as a live location.
      </p>

      <h2>What you can read</h2>
      <ul>
        <li>
          <strong>Sightings</strong>: species, count, time to the quarter hour, and the grid cell (1 km, or 10 km for sensitive species).
        </li>
        <li>
          <strong>Species</strong>: names (English, Setswana where known, scientific) and the publication rules for each.
        </li>
        <li>
          <strong>Tracks</strong>: the aggregated track map, only segments driven on three or more separate trips, under ODbL.
        </li>
      </ul>
      <p className="muted">
        What you will never get: exact points, observers, photos&apos; hidden data, raw GPS traces, or anything about a sensitive species finer than 10 km or sooner than 7 days. See{" "}
        <Link href="/data-rules">data rules</Link>.
      </p>

      <h2>First request</h2>
      <p>
        Ask for a key (see <Link href="/keys">keys and scopes</Link>), then send it as a bearer token. The base URL below is a placeholder until the API is deployed.
      </p>
      <pre>
        <code>{`curl ${BASE_URL}/sightings?area=sample-reserve&limit=2 \\\n  -H "Authorization: Bearer $KORI_KEY"`}</code>
      </pre>
      <p className="faint">Example response (sample data):</p>
      <pre>
        <code>{listSightingsExample()}</code>
      </pre>

      <h2>Conventions</h2>
      <ul>
        <li>JSON in and out, UTF-8, times in ISO 8601 UTC, coordinates as longitude and latitude (WGS 84).</li>
        <li>
          Lists are paged with <code>limit</code> (up to 200) and an opaque <code>cursor</code>.
        </li>
        <li>
          Every response carries a <code>request_id</code> header; quote it when you report a problem.
        </li>
        <li>
          The version is in the path (<code>/v1</code>). Fields may be added without notice; nothing is removed or renamed within a version.
        </li>
      </ul>
    </>
  );
}
