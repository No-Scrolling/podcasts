import { createStore } from "@ink/store";
import { decodeShow, remember, type Show } from "./catalogue";
export const favourites = createStore<Show[]>({
  key: "podcasts.shows", version: 1, initial: [],
  decode(value) {
    if (!Array.isArray(value)) throw new Error("Invalid saved shows");
    return value.map(item => remember(decodeShow(item)));
  },
});
export async function toggleStar(show: Show) {
  await favourites.update(shows => shows.some(item => item.id === show.id)
    ? shows.filter(item => item.id !== show.id) : [...shows, show]);
}
