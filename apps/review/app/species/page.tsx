import type { Metadata } from "next";
import { RULES } from "@/shared/rules";
import { SPECIES } from "@/shared/species";

export const metadata: Metadata = { title: "Species rules" };

function delay(minutes: number) {
  return minutes >= 1440 ? `${minutes / 1440} days` : `${minutes / 60} hour`;
}

export default function SpeciesPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
      <div className="page-head">
        <h1>Species rules</h1>
        <p className="muted">
          How each species is published. The sensitive list, the delays and the area sizes are proposals for the prototype; the real values will be agreed with the Department of
          Wildlife and National Parks before any park is covered. Any den or nest is treated as sensitive. Setswana names still need checking by a first-language speaker.
        </p>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Tier</th>
              <th scope="col">Published area</th>
              <th scope="col">Delay before others see it</th>
              <th scope="col">Guidance along tracks</th>
              <th scope="col">QR share</th>
            </tr>
          </thead>
          <tbody>
            {(["standard", "sensitive"] as const).map((tier) => (
              <tr key={tier}>
                <th scope="row">
                  <span className={`chip ${tier === "sensitive" ? "chip-sensitive" : "chip-approved"}`}>{tier === "sensitive" ? "Sensitive" : "Standard"}</span>
                </th>
                <td>{RULES[tier].cellMeters / 1000} km square</td>
                <td>{delay(RULES[tier].delayMinutes)}</td>
                <td>{RULES[tier].guidance ? "Yes, to a track point in the area" : "Never"}</td>
                <td>{RULES[tier].qrShare ? "Yes" : "Never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Species</th>
              <th scope="col">Setswana</th>
              <th scope="col">Scientific name</th>
              <th scope="col">Tier</th>
            </tr>
          </thead>
          <tbody>
            {SPECIES.map((s) => (
              <tr key={s.id}>
                <td>{s.common}</td>
                <td>{s.setswana ?? "—"}</td>
                <td>
                  <i>{s.scientific}</i>
                </td>
                <td>
                  <span className={`chip ${s.sensitivity === "sensitive" ? "chip-sensitive" : ""}`}>{s.sensitivity === "sensitive" ? "Sensitive" : "Standard"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
