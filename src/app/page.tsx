import Link from "next/link";
import LiveIndicator from "@/components/LiveIndicator";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-discord-blurple text-3xl">
          🎬
        </div>
        <h1 className="text-3xl font-semibold text-discord-text-bright">Home Discord</h1>
        <p className="max-w-sm text-discord-text-muted">
          One room. Screen share, voice, and chat. No account, no sign-in,
          just click and you&apos;re in.
        </p>
      </div>
      <LiveIndicator />
      <Link
        href="/room"
        className="rounded-full bg-discord-blurple px-8 py-3 font-medium text-white transition hover:bg-discord-blurple-hover"
      >
        Join the room
      </Link>
      <p className="max-w-xs text-xs text-discord-text-muted">
        You&apos;ll pick a name and an avatar the first time you join, then
        it&apos;s remembered.
      </p>
    </main>
  );
}
