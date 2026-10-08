/** Small presentational pieces used across screens. */

import type { SightingStatus } from "@/shared/rules";
import { Icon } from "@/shared/icons";

export function SampleNote({ children }: { children?: React.ReactNode }) {
  return (
    <p className="sample-note">
      <Icon name="info" size={20} />
      <span>{children ?? "Sample data. The sightings, observers and reserve on this screen are invented for the prototype."}</span>
    </p>
  );
}

const STATUS: Record<SightingStatus, { label: string; className: string }> = {
  queued: { label: "On this phone", className: "chip-queued" },
  pending: { label: "Waiting for review", className: "chip-pending" },
  approved: { label: "Approved", className: "chip-approved" },
  rejected: { label: "Rejected", className: "chip-rejected" },
};

export function StatusChip({ status }: { status: SightingStatus }) {
  const s = STATUS[status];
  return <span className={`chip ${s.className}`}>{s.label}</span>;
}

export function SourceChip({ source }: { source: "sample" | "mine" | "shared" }) {
  if (source === "sample") return <span className="chip chip-sample">Sample</span>;
  if (source === "shared") return <span className="chip chip-shared">Shared with you</span>;
  return <span className="chip">Yours</span>;
}

export function SensitiveChip() {
  return (
    <span className="chip chip-sensitive">
      <Icon name="eyeOff" size={14} /> Sensitive
    </span>
  );
}
