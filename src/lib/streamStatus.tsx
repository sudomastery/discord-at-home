"use client";

import { useEffect, useState } from "react";

export type StreamStatus = { live: boolean; since: string | null };

// `since` is fetched from the server periodically; the on-screen clock
// ticks locally between polls instead of re-fetching every second.
export function useStreamStatus(pollMs: number): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>({ live: false, since: null });

  useEffect(() => {
    let cancelled = false;

    const poll = () => {
      fetch("/api/stream-status")
        .then((res) => res.json())
        .then((data: StreamStatus) => {
          if (!cancelled) setStatus(data);
        })
        .catch(() => {});
    };

    poll();
    const interval = setInterval(poll, pollMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pollMs]);

  return status;
}

function formatElapsed(sinceIso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(sinceIso).getTime()) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function ElapsedTimer({ since, className }: { since: string; className?: string }) {
  const [, forceTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  return <span className={className}>{formatElapsed(since)}</span>;
}
