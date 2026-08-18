import { RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import { isBroadcasterKeyValid } from "@/lib/broadcasterAuth";
import { ROOM_NAME } from "@/lib/room";
import { supabase } from "@/lib/supabase";

// Liveness itself always comes from LiveKit, not from anything we wrote to
// Supabase: that's the only source that self-corrects if a broadcaster's
// connection drops without a clean "End stream" (a stale DB flag would
// otherwise say "live" forever). Supabase only supplies the start
// timestamp, since LiveKit's track info doesn't carry one.
async function isScreenShareLive(): Promise<boolean> {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (!apiKey || !apiSecret || !livekitUrl) return false;

  const roomService = new RoomServiceClient(
    livekitUrl.replace(/^ws/, "http"),
    apiKey,
    apiSecret
  );

  try {
    const participants = await roomService.listParticipants(ROOM_NAME);
    return participants.some((p) =>
      p.tracks.some((t) => t.source === TrackSource.SCREEN_SHARE)
    );
  } catch {
    // Room doesn't exist yet (nobody has ever joined) -> not live.
    return false;
  }
}

export async function GET() {
  const live = await isScreenShareLive();
  if (!live) {
    return NextResponse.json({ live: false, since: null });
  }

  const { data } = await supabase
    .from("stream_status")
    .select("started_at")
    .eq("room", ROOM_NAME)
    .maybeSingle();

  return NextResponse.json({ live: true, since: data?.started_at ?? null });
}

// Called by the broadcaster's client the moment they start sharing, purely
// to record when for the duration display. Not itself the source of truth
// for whether a stream is live (see isScreenShareLive above).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const broadcasterKey =
    typeof body?.broadcasterKey === "string" ? body.broadcasterKey : "";

  if (!isBroadcasterKeyValid(broadcasterKey)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const startedAt = new Date().toISOString();
  const { error } = await supabase
    .from("stream_status")
    .upsert({ room: ROOM_NAME, started_at: startedAt });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ since: startedAt });
}
