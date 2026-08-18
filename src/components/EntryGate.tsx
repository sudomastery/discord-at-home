"use client";

import { FormEvent, useState } from "react";
import { AVATAR_CHOICES, avatarColor, randomAvatar, saveProfile, type Profile } from "@/lib/identity";

export default function EntryGate({
  onComplete,
}: {
  onComplete: (profile: Profile) => void;
}) {
  const [avatar, setAvatar] = useState(randomAvatar);
  const [username, setUsername] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const name = username.trim().slice(0, 32);
    if (!name) return;

    // Spend this click's user gesture on a real (silent) playback now, while
    // it's still valid. Browsers gate autoplay-with-sound per page, not per
    // element: once one unmuted play() succeeds from a click, the room's
    // audio/video elements (created moments later, asynchronously, after
    // LiveKit connects) are allowed to autoplay too. Without this, that
    // gesture goes unused and the room falls back to a second "click to
    // enable audio" button once the real track arrives.
    try {
      // Real (silent) samples, left unmuted at full volume: a volume of 0
      // or a muted element doesn't count as the "unmuted playback" browsers
      // check for, so it wouldn't actually unlock anything.
      const el = new Audio(
        "data:audio/wav;base64,UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQgAAACAgICAgICAgA=="
      );
      el.play().catch(() => {});
    } catch {
      // Autoplay unlock is a nice-to-have; StartAudio remains as a fallback.
    }

    const profile: Profile = { username: name, avatar };
    saveProfile(profile);
    onComplete(profile);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-3xl bg-discord-bg-secondary p-6 shadow-2xl"
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className={`flex h-20 w-20 items-center justify-center rounded-full text-4xl ${avatarColor(avatar)}`}
          >
            {avatar}
          </div>
          <h1 className="text-lg font-semibold text-discord-text-bright">
            Pick an avatar
          </h1>
        </div>

        <div className="mt-4 grid grid-cols-6 gap-2 sm:grid-cols-8">
          {AVATAR_CHOICES.map((choice) => (
            <button
              key={choice}
              type="button"
              onClick={() => setAvatar(choice)}
              className={`flex h-9 w-9 items-center justify-center rounded-full text-lg transition ${avatarColor(choice)} ${
                choice === avatar
                  ? "ring-2 ring-discord-blurple"
                  : "opacity-70 hover:opacity-100"
              }`}
            >
              {choice}
            </button>
          ))}
        </div>

        <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-discord-text-muted">
          What should we call you?
        </label>
        <input
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={32}
          placeholder="Your name"
          className="mt-2 w-full rounded-xl bg-discord-input px-4 py-3 text-sm text-discord-text-bright outline-none placeholder:text-discord-text-muted focus:ring-2 focus:ring-discord-blurple"
        />

        <button
          type="submit"
          disabled={!username.trim()}
          className="mt-5 w-full rounded-xl bg-discord-blurple py-3 text-sm font-semibold text-white transition hover:bg-discord-blurple-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Join the stream
        </button>
      </form>
    </div>
  );
}
