import * as v from "valibot";
import "@ink/network";
import { resource } from "ink";
import { callNative } from "ink/native";
import { downloads } from "./downloads";
import { progressLabel, type EpisodeProgress } from "./progress";
import { createShowDetails } from "./show-cache";
import { decodeHTML } from "entities";

export type Episode = { id: string; title: string; audio: string; artwork: string; date: string; duration: number };
export type EpisodePage = { episodes: Episode[]; total: number; next: string | null; updatedAt: number };
const knownShows = new Map<string, Show>();
export function remember(show: Show) { knownShows.set(show.id, show); return show; }
export function thumbnail(show: Show) {
  return show.artwork.replace(/\/\d+x\d+bb\./, "/160x160bb.");
}
const text = v.fallback(v.string(), "");
const url = v.pipe(text, v.transform(value => /^https?:\/\//i.test(value) ? value : ""));
function clean(value: string) { return decodeHTML(value.replace(/<[^>]*>/g, "")).trim(); }
const showSchema = v.object({
  id: v.string(), title: v.pipe(v.string(), v.minLength(1)), author: text,
  feed: v.pipe(url, v.minLength(1)), artwork: url,
});
export type Show = v.InferOutput<typeof showSchema>;
export const decodeShow = v.parser(showSchema);
const appleShowSchema = v.object({
  collectionId: v.number(), feedUrl: v.pipe(url, v.minLength(1)),
  collectionName: text, artistName: text, artworkUrl600: url, artworkUrl100: url,
});
const appleResults = v.object({ results: v.optional(v.array(v.fallback(v.nullable(appleShowSchema), null)), []) });
function appleShow(item: v.InferOutput<typeof appleShowSchema>): Show {
  return remember({ id: String(item.collectionId), title: clean(item.collectionName), author: clean(item.artistName),
    feed: item.feedUrl, artwork: item.artworkUrl600 || item.artworkUrl100 });
}
const episodeSchema = v.object({
  guid: text, audio: url, title: text, artwork: url, pubDate: text, "itunes:duration": text,
});
const episodeDetailsSchema = v.object({
  ...episodeSchema.entries,
  description: v.optional(v.array(v.object({ text, href: url })), []),
});
const pageSchema = v.nullable(v.object({
  items: v.array(episodeSchema), total: v.number(), updatedAt: v.number(), next: v.nullable(v.string()),
}));
async function request(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Could not load podcasts (${response.status})`);
  return response;
}
function createSearch() { return resource({
  key: (query: string) => ["search", query], staleTime: 300_000,
  async load(query: string) {
    const response = await request(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=podcast&entity=podcast&country=gb&limit=30`);
    const body = v.parse(appleResults, await response.json());
    return body.results.filter(item => item !== null).map(appleShow);
  },
}); }
export async function getShow(id: string): Promise<Show> {
  let show = knownShows.get(id);
  if (!show) {
    const cached = v.parse(v.nullable(showSchema), JSON.parse(await callNative("podcast-feeds", "cached-show", { id })));
    if (cached !== null) show = remember(cached);
  }
  if (!show) {
    const response = await request(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&entity=podcast`);
    const result = v.parse(appleResults, await response.json()).results.find(item => item !== null);
    if (result) show = appleShow(result);
  }
  if (!show) throw new Error("Show not found");
  return show;
}

function createEpisodeDetails() { return resource({
  key: (showId: string, episodeId: string) => ["episode", showId, episodeId], staleTime: 300_000,
  async load(showId: string, episodeId: string) {
    const show = await getShow(showId);
    const item = v.parse(episodeDetailsSchema, JSON.parse(await callNative("podcast-feeds", "details",
      { url: show.feed, id: episodeId }, { timeoutMs: 60_000 })));
    const episode = decodeEpisode(item, show);
    const description = item.description.map(part => ({ text: part.text, href: part.href || undefined }));
    return { show, episode, description };
  },
}); }

function decodeEpisode(item: v.InferOutput<typeof episodeSchema>, show: Show): Episode {
  const audio = item.audio;
  const parts = item["itunes:duration"].split(":").map(Number);
  const duration = parts.reduce((seconds, part) => seconds * 60 + part, 0) * 1000;
  const date = item.pubDate;
  return { id: item.guid, audio: decodeHTML(audio), title: clean(item.title) || "Untitled episode",
    artwork: item.artwork || show.artwork, date: Number.isFinite(Date.parse(date)) ? date : "",
    duration: Number.isFinite(duration) ? Math.max(0, duration) : 0 };
}

export async function nextEpisode(show: Show, id: string, finished: string[]): Promise<Episode | null> {
  const value = v.parse(v.nullable(episodeSchema), JSON.parse(await callNative("podcast-feeds", "next", { show, id, finished }, { timeoutMs: 60_000 })));
  return value === null ? null : decodeEpisode(value, show);
}

export async function episodePage(show: Show, after?: string, operation: "cached" | "load" = "load"): Promise<EpisodePage | null> {
  const page = v.parse(pageSchema, JSON.parse(await callNative("podcast-feeds", after ? "page" : operation,
    { show, id: show.id, after }, { timeoutMs: 60_000 })));
  if (page === null) return null;
  const episodes = page.items.map(value => decodeEpisode(value, show));
  const changed = await callNative("podcast-downloads", "metadata", { items: episodes.map(episode => ({
    id: `${show.id}/${episode.id}`, title: episode.title, artist: show.title,
    artwork: episode.artwork, date: episode.date, duration: episode.duration,
  })) });
  if (changed === "true") await downloads.refresh();
  return { episodes, total: page.total, next: page.next, updatedAt: page.updatedAt };
}

export function episodeInfo(episode: { date?: string; duration?: number }, progress?: EpisodeProgress) {
  const date = episode.date ? new Date(episode.date) : null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const duration = progress?.duration || episode.duration || 0;
  const time = progressLabel(progress) || (duration > 0 ? `${Math.round(duration / 60_000)} min` : "");
  return [date && `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`, time].filter(Boolean).join(" • ");
}

export const searchShows = createSearch();
export const showDetails = createShowDetails();
export const episodeDetails = createEpisodeDetails();
