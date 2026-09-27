import { useState } from "react";
import { Screen, TextInput, navigate } from "ink";
export default function Search() {
  const [query, setQuery] = useState("");
  return <Screen title="Search">
    <TextInput value={query} onChange={setQuery} placeholder="Search shows…" action="search"
      onSubmit={() => { if (query.trim()) navigate({ path: "/search-results", params: { query: query.trim() } }); }} />
  </Screen>;
}
