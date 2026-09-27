import { useShowImages } from "../../lib/appearance";
import { Screen, List, Row, EmptyState, ErrorState, LoadingState, useSnapshot, navigate } from "ink";
import { graphicEq } from "ink/icons";
import { favourites } from "../../lib/library";
import { thumbnail } from "../../lib/catalogue";
export default function Shows() {
  const showImages = useShowImages();
  const saved = useSnapshot(favourites);
  return <Screen wide title="Shows" rightAction={{ icon: graphicEq, onPress: () => navigate("/playing") }}>
    {saved.status === "loading" ? <LoadingState /> : saved.status === "error"
      ? <ErrorState message={saved.error.message} onRetry={() => { void favourites.get(); }} />
      : !saved.data.length ? <EmptyState title="No starred shows" />
      : <List items={saved.data} gap={8} keyExtractor={show => show.id} renderItem={show =>
        <Row title={show.title} titleMaxLines={1} subtitle={show.author} image={showImages ? thumbnail(show) || undefined : undefined}
          href={{ path: "/show/[id]", params: { id: show.id } }} />} />}
  </Screen>;
}
