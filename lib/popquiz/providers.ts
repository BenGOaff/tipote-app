// Parses a pasted URL and returns the matching VideoSource +
// provider-specific id. We do this client-side at paste time so
// the editor can preview the video instantly — the server later
// re-validates when the row is persisted.

import type { VideoSource } from "./types";

export interface ParsedVideoUrl {
  source: VideoSource;
  externalId: string | null;
  normalizedUrl: string;
}

// YouTube IDs are exactly 11 chars of [A-Za-z0-9_-]; covers
// /watch?v=, /embed/, /v/, /shorts/, and youtu.be/ short links.
const YT_REGEX =
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const VIMEO_REGEX = /vimeo\.com\/(?:video\/)?(\d+)/;

export function parseVideoUrl(input: string): ParsedVideoUrl | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const yt = trimmed.match(YT_REGEX);
  if (yt) {
    return {
      source: "youtube",
      externalId: yt[1],
      normalizedUrl: `https://www.youtube.com/watch?v=${yt[1]}`,
    };
  }

  const vimeo = trimmed.match(VIMEO_REGEX);
  if (vimeo) {
    return {
      source: "vimeo",
      externalId: vimeo[1],
      normalizedUrl: `https://vimeo.com/${vimeo[1]}`,
    };
  }

  // Plain URL fallback (must look like an http(s) link).
  try {
    const u = new URL(trimmed);
    if (u.protocol === "http:" || u.protocol === "https:") {
      return {
        source: "url",
        externalId: null,
        normalizedUrl: u.toString(),
      };
    }
  } catch {
    // not a URL
  }
  return null;
}

export function youtubeThumbnail(externalId: string): string {
  return `https://i.ytimg.com/vi/${externalId}/hqdefault.jpg`;
}
