import type { Metadata } from "next";
import { ERROR_EXAMPLE } from "@/lib/examples";

export const metadata: Metadata = { title: "Rate limits" };

export default function LimitsPage() {
  return (
    <>
      <h1>Rate limits</h1>
      <p className="lead">Each key has an hourly limit and a monthly quota. The numbers below are the planned defaults; a research group can ask for more.</p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Window</th>
              <th scope="col">Default per key</th>
              <th scope="col">When it runs out</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Rolling hour</td>
              <td>600 requests</td>
              <td>
                <code>429</code> with <code>Retry-After</code> in seconds
              </td>
            </tr>
            <tr>
              <td>Calendar month (UTC)</td>
              <td>50,000 requests</td>
              <td>
                <code>429</code> until the first of next month
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Headers on every response</h2>
      <pre>
        <code>{`X-RateLimit-Limit: 600\nX-RateLimit-Remaining: 587\nX-RateLimit-Reset: 2026-10-07T15:41:00Z\nX-Quota-Remaining: 48120`}</code>
      </pre>

      <h2>When you are limited</h2>
      <pre>
        <code>{`HTTP/1.1 429 Too Many Requests\nRetry-After: 1260\n\n${ERROR_EXAMPLE}`}</code>
      </pre>
      <ul>
        <li>
          Wait for <code>Retry-After</code> before retrying, and back off further if you are limited again.
        </li>
        <li>Sightings change slowly: they appear at least an hour after they happen. Polling more than once every few minutes gains nothing.</li>
      </ul>

      <h2>Other errors</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Status</th>
              <th scope="col">Code</th>
              <th scope="col">Meaning</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["400", "bad_request", "A parameter is malformed; the message names it."],
              ["401", "unauthenticated", "No key, or an unknown or revoked key."],
              ["403", "missing_scope", "The key lacks the scope this endpoint needs."],
              ["404", "not_found", "No such sighting, or it is not public (yet)."],
              ["429", "rate_limited", "Hourly limit or monthly quota reached."],
              ["503", "unavailable", "Maintenance or overload; retry later."],
            ].map(([status, code, meaning]) => (
              <tr key={code}>
                <td>{status}</td>
                <td>
                  <code>{code}</code>
                </td>
                <td>{meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="faint">A sighting that is waiting for review or for its delay answers 404, the same as one that does not exist, so the API never confirms that something was seen.</p>
    </>
  );
}
