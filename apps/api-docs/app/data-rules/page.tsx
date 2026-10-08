import type { Metadata } from "next";
import { RULES } from "@/shared/rules";

export const metadata: Metadata = { title: "Data rules and licences" };

export default function DataRulesPage() {
  return (
    <>
      <h1>Data rules and licences</h1>
      <p className="lead">The API serves exactly what the app shows to the public, under the same rules. They protect animals first and people&apos;s privacy second.</p>

      <h2>Sightings</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col"></th>
              <th scope="col">Standard species</th>
              <th scope="col">Sensitive species, dens and nests</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Published as</th>
              <td>A {RULES.standard.cellMeters / 1000} km grid cell</td>
              <td>Presence in a {RULES.sensitive.cellMeters / 1000} km grid cell</td>
            </tr>
            <tr>
              <th scope="row">Earliest</th>
              <td>{RULES.standard.delayMinutes / 60} hour after it was seen, and only once approved</td>
              <td>{RULES.sensitive.delayMinutes / 1440} days after it was seen, and only once approved</td>
            </tr>
            <tr>
              <th scope="row">Time</th>
              <td>Rounded down to the quarter hour</td>
              <td>Rounded down to the quarter hour</td>
            </tr>
          </tbody>
        </table>
      </div>
      <ul>
        <li>The sensitive list (rhino and pangolin in the draft) and these values are proposals, to be agreed with the Department of Wildlife and National Parks.</li>
        <li>Nothing is published inside areas the park authority flags.</li>
        <li>Do not use the data to locate or approach animals off the park&apos;s roads and tracks; off-road driving is not allowed in Botswana&apos;s parks.</li>
      </ul>

      <h2>GPS traces</h2>
      <p>
        Traces are personal data under Botswana&apos;s Data Protection Act, 2024. The API never returns them. Only the aggregated track map is published, built from segments driven
        on three or more separate trips that people chose to share, after trimming the first and last kilometre of each trip.
      </p>

      <h2>Licences and credit</h2>
      <ul>
        <li>
          <strong>Sightings and species:</strong> terms of use to be published with the API. Credit &ldquo;Kori contributors&rdquo;.
        </li>
        <li>
          <strong>Tracks:</strong> ODbL 1.0. Where the track map builds on OpenStreetMap, credit &ldquo;© OpenStreetMap contributors&rdquo; as well, and share derived databases under
          ODbL.
        </li>
        <li>
          <strong>Imagery:</strong> any layer derived from Sentinel-2 will carry &ldquo;Contains modified Copernicus Sentinel data&rdquo; and the year. No such layer is served yet.
        </li>
      </ul>
    </>
  );
}
