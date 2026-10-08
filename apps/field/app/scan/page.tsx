"use client";

/**
 * Scan a Kori sighting code with the camera. Uses the browser's BarcodeDetector where it exists
 * (Chrome on Android) and falls back to jsQR on video frames elsewhere. Works with no signal.
 * Codes that are not Kori codes are shown as text and never opened.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import { decodeShare } from "@/shared/share-code";
import { Icon } from "@/shared/icons";

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (options: { formats: string[] }) => Detector;

export default function ScanPage() {
  const router = useRouter();
  const video = useRef<HTMLVideoElement | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [foreign, setForeign] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  function open(text: string) {
    const result = decodeShare(text);
    if (result.ok) {
      const code = text.includes("#") ? text.slice(text.indexOf("#") + 1) : text;
      router.push(`/shared#${code}`);
      return true;
    }
    setForeign(text);
    setMessage(result.reason);
    return false;
  }

  useEffect(() => {
    if (!running) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    const detector = Ctor ? new Ctor({ formats: ["qr_code"] }) : null;

    async function tick() {
      const v = video.current;
      if (stopped || !v || v.readyState < 2) {
        timer = window.setTimeout(tick, 250);
        return;
      }
      let text: string | null = null;
      try {
        if (detector) text = (await detector.detect(v))[0]?.rawValue ?? null;
        else if (ctx) {
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          ctx.drawImage(v, 0, 0);
          text = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data ?? null;
        }
      } catch {
        text = null;
      }
      if (text && open(text)) return;
      timer = window.setTimeout(tick, 250);
    }

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
        tick();
      })
      .catch(() => {
        setMessage("The camera is not available. Allow camera access for this site, or paste the link below.");
        setRunning(false);
      });

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Scan a sighting code</h1>
        <p className="muted">Point the camera at the QR code on another phone. It is read on this phone; no signal is needed.</p>
      </div>
      {running ? (
        <div className="scanner">
          <video ref={video} playsInline muted aria-label="Camera view" />
          <div className="scanner-frame" aria-hidden="true" />
        </div>
      ) : (
        <button type="button" className="btn btn-primary btn-block" onClick={() => { setMessage(null); setForeign(null); setRunning(true); }}>
          <Icon name="camera" size={24} /> Start the camera
        </button>
      )}
      {running ? (
        <button type="button" className="btn" onClick={() => setRunning(false)} style={{ alignSelf: "center" }}>
          Stop the camera
        </button>
      ) : null}
      {message ? (
        <div className="notice notice-warn" role="status">
          <Icon name="alert" size={20} />
          <span>
            {message}
            {foreign ? (
              <>
                <br />
                <span className="mono" style={{ wordBreak: "break-all" }}>
                  {foreign.slice(0, 200)}
                </span>
              </>
            ) : null}
          </span>
        </div>
      ) : null}
      <form
        className="field"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) open(manual.trim());
        }}
      >
        <label htmlFor="manual">Or paste a Kori link</label>
        <input id="manual" type="text" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="https://…/shared#k1.…" autoComplete="off" />
        <button type="submit" className="btn" style={{ alignSelf: "flex-start" }}>
          Open
        </button>
      </form>
    </div>
  );
}
