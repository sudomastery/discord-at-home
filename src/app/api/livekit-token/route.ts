import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";

const MAX_USERNAME_LENGTH = 32;

// 10 viewers + 1 slot reserved for the broadcaster.
const MAX_ROOM_PARTICIPANTS = 11;

const VIEWER_SOURCES = [TrackSource.MICROPHONE, TrackSource.CAMERA];
const BROADCASTER_SOURCES = [
  TrackSource.MICROPHONE,
  TrackSource.CAMERA,
  TrackSource.SCREEN_SHARE,
  TrackSource.SCREEN_SHARE_AUDIO,
];

export async function POST(req: NextRequest) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  if (!apiKey || !apiSecret || !livekitUrl) {
    return NextResponse.json(
      { error: "LiveKit is not configured on the server." },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  const room = typeof body?.room === "string" ? body.room.trim() : "";
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const broadcasterKey =
    typeof body?.broadcasterKey === "string" ? body.broadcasterKey : "";

  if (!room || !username) {
    return NextResponse.json(
      { error: "room and username are required." },
      { status: 400 }
    );
  }

  if (username.length > MAX_USERNAME_LENGTH) {
    return NextResponse.json(
      { error: `username must be ${MAX_USERNAME_LENGTH} characters or fewer.` },
      { status: 400 }
    );
  }

  const serverBroadcasterKey = process.env.BROADCASTER_KEY;
  const isBroadcaster = Boolean(
    serverBroadcasterKey && broadcasterKey && broadcasterKey === serverBroadcasterKey
  );

  // Best-effort: sets the participant cap the first time this room is
  // created. Has no effect on a room that's already running, since LiveKit
  // fixes maxParticipants at creation time.
  try {
    const roomService = new RoomServiceClient(
      livekitUrl.replace(/^ws/, "http"),
      apiKey,
      apiSecret
    );
    await roomService.createRoom({ name: room, maxParticipants: MAX_ROOM_PARTICIPANTS });
  } catch {
    // Room may already exist with different settings; joining still proceeds.
  }

  // Suffix the identity so two people picking the same display name don't
  // collide (LiveKit disconnects the older connection on identity clash).
  const identity = `${username}-${Math.random().toString(36).slice(2, 8)}`;

  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    name: username,
    ttl: "2h",
  });

  token.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canPublishSources: isBroadcaster ? BROADCASTER_SOURCES : VIEWER_SOURCES,
    canSubscribe: true,
    canPublishData: true,
  });

  return NextResponse.json({
    token: await token.toJwt(),
    url: livekitUrl,
    role: isBroadcaster ? "broadcaster" : "viewer",
  });
}
