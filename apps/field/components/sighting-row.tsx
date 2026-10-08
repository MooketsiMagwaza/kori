import Link from "next/link";
import type { Sighting } from "@/shared/sample-sightings";
import { sensitivityOf } from "@/shared/rules";
import { speciesById } from "@/shared/species";
import { relativeTime } from "@/lib/hooks";
import { CellThumb } from "@/components/cell-thumb";
import { SensitiveChip, SourceChip, StatusChip } from "@/components/bits";
import { Icon } from "@/shared/icons";

export function SightingRow({ sighting, now }: { sighting: Sighting; now: Date }) {
  const species = speciesById(sighting.speciesId);
  const sensitive = sensitivityOf(sighting) === "sensitive";
  return (
    <li>
      <Link className="row" href={`/sighting?id=${encodeURIComponent(sighting.id)}`}>
        <span className="row-art" aria-hidden="true">
          <CellThumb cell={sighting.cell} sensitive={sensitive} showTracks={!sensitive} />
        </span>
        <span className="row-main">
          <span className="row-title">
            {species?.common ?? "Unknown"} <span className="muted">× {sighting.count}</span>
          </span>
          <span className="row-sub">
            {relativeTime(sighting.seenAt, now)}
            {species?.setswana ? ` · ${species.setswana}` : ""}
          </span>
          <span style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
            <SourceChip source={sighting.source} />
            {sighting.source !== "sample" || sighting.status !== "approved" ? <StatusChip status={sighting.status} /> : null}
            {sensitive ? <SensitiveChip /> : null}
          </span>
        </span>
        <Icon name="chevronRight" size={22} />
      </Link>
    </li>
  );
}
