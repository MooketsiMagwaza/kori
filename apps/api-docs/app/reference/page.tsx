import type { Metadata } from "next";
import { BASE_URL, listSightingsExample, oneSightingExample, sensitiveExample, speciesExample, tracksExample } from "@/lib/examples";
import { OPENAPI_VERSION, OPERATIONS } from "@/lib/openapi";

export const metadata: Metadata = { title: "Endpoints" };

function Endpoint({ path, scope, children }: { path: string; scope: string; children: React.ReactNode }) {
  return (
    <section className="endpoint" aria-label={`GET ${path}`}>
      <p className="endpoint-line">
        <span className="method">GET</span>
        <span>{path}</span>
        <span className="scope">{scope}</span>
      </p>
      {children}
    </section>
  );
}

export default function ReferencePage() {
  return (
    <>
      <h1>Endpoints</h1>
      <p className="lead">
        Four read-only endpoints under <code>{BASE_URL}</code>. All responses below are built from sample data.
      </p>

      <h2>From the API&apos;s own description</h2>
      <p className="muted">
        This table is generated from the OpenAPI document exported by the API (version {OPENAPI_VERSION}). A test in the API fails when the two disagree.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Operation</th>
              <th scope="col">Summary</th>
              <th scope="col">Responses</th>
            </tr>
          </thead>
          <tbody>
            {OPERATIONS.map((op) => (
              <tr key={op.operationId}>
                <td>
                  <code>
                    {op.method} {op.path}
                  </code>
                </td>
                <td>{op.summary}</td>
                <td>{op.responses.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Each endpoint, with examples</h2>
      <Endpoint path="/sightings" scope="sightings:read">
        <p>Approved, public sightings, newest first.</p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Parameter</th>
                <th scope="col">Meaning</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>area</code>
                </td>
                <td>A park or reserve id. Required.</td>
              </tr>
              <tr>
                <td>
                  <code>species</code>
                </td>
                <td>One species id, or several separated by commas.</td>
              </tr>
              <tr>
                <td>
                  <code>since</code>
                </td>
                <td>Only sightings seen at or after this time (ISO 8601).</td>
              </tr>
              <tr>
                <td>
                  <code>limit</code>, <code>cursor</code>
                </td>
                <td>Paging: up to 200 per page; pass <code>next_cursor</code> back as <code>cursor</code>.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <pre>
          <code>{listSightingsExample()}</code>
        </pre>
        <p className="muted">A sensitive species appears only as presence in a 10 km cell, at least 7 days later:</p>
        <pre>
          <code>{sensitiveExample()}</code>
        </pre>
      </Endpoint>

      <Endpoint path="/sightings/{id}" scope="sightings:read">
        <p>One public sighting. Answers 404 while it waits for review or its delay.</p>
        <pre>
          <code>{oneSightingExample()}</code>
        </pre>
      </Endpoint>

      <Endpoint path="/species" scope="species:read">
        <p>The species list with each species&apos; tier and publication rules.</p>
        <pre>
          <code>{speciesExample()}</code>
        </pre>
      </Endpoint>

      <Endpoint path="/tracks" scope="tracks:read">
        <p>
          The aggregated track map for an area as GeoJSON, under ODbL. Only segments supported by three or more separate trips; never raw traces, never closed or patrol tracks.
          Predicted tracks are not served by this endpoint.
        </p>
        <pre>
          <code>{tracksExample()}</code>
        </pre>
      </Endpoint>
    </>
  );
}
