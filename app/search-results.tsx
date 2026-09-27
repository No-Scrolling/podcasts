import * as v from "valibot";
import { useShowImages } from "../lib/appearance";
import { Screen, List, Row, LoadingState, ErrorState, EmptyState, useSnapshot, useRouteParams } from "ink";
import { searchShows, thumbnail } from "../lib/catalogue";
const parseParams = v.parser(v.object({ query: v.string() }));

export default function Results() {
  const showImages = useShowImages();
  const { query } = useRouteParams(parseParams);
  const source = searchShows(query);
  const result = useSnapshot(source);
  return <Screen title="Results" wide>
    {result.status === "loading" ? <LoadingState /> : result.status === "error"
      ? <ErrorState message={result.error.message} onRetry={source.refresh} />
      : !result.data.length ? <EmptyState title="No shows found" />
      : <List items={result.data} gap={8} keyExtractor={show => show.id} renderItem={show =>
        <Row title={show.title} titleMaxLines={1} subtitle={show.author} image={showImages ? thumbnail(show) || undefined : undefined}
          href={{ path: "/show/[id]", params: { id: show.id } }} />} />}
  </Screen>;
}
