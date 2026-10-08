"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

// MapLibre needs the browser, so the map is never rendered on the server.
const ParkMap = dynamic(() => import("@/components/park-map"), {
  ssr: false,
  loading: () => <div className="map-page"><p className="empty">Loading the map…</p></div>,
});

function WithParams() {
  const params = useSearchParams();
  return <ParkMap to={params.get("to")} />;
}

export default function MapPage() {
  return (
    <Suspense fallback={<div className="map-page" />}>
      <h1 className="sr-only">Map</h1>
      <WithParams />
    </Suspense>
  );
}
