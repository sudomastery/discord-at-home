"use client";

import Link from "next/link";
import { ElapsedTimer, useStreamStatus } from "@/lib/streamStatus";

export default function LiveIndicator() {
  const { live, since } = useStreamStatus(15_000);

  if (!live) return null;

  return (
    <Link
      href="/room"
      className="flex items-center gap-2 rounded-full bg-discord-red/15 px-4 py-2 text-sm font-medium text-discord-red transition hover:bg-discord-red/25"
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-discord-red" />
      Live now
      {since && (
        <span className="font-mono text-discord-text-bright">
          · <ElapsedTimer since={since} />
        </span>
      )}
    </Link>
  );
}
