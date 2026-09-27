import { Text } from "ink";

type Part = { text: string; href?: string };

export function EpisodeDescription({ parts, duration, onTimestamp }: {
  parts: readonly Part[];
  duration: number;
  onTimestamp: (position: number) => void;
}) {
  const occurrences = new Map<string, number>();
  function contentKey(...identity: string[]) {
    const key = JSON.stringify(identity);
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);
    return `${key}:${occurrence}`;
  }

  return <Text size={18}>{parts.length ? parts.flatMap(part => {
    if (part.href) return [<Text key={contentKey("link", part.href, part.text)} href={part.href}>{part.text}</Text>];
    const content = [];
    let offset = 0;
    for (const match of part.text.matchAll(/(?<![\w:])(?:(\d{1,3}):)?(\d{1,3}):([0-5]\d)(?![\w:])/g)) {
      const hours = Number(match[1] ?? 0);
      const minutes = Number(match[2]);
      const position = (hours * 3600 + minutes * 60 + Number(match[3])) * 1000;
      if ((match[1] !== undefined && minutes >= 60) || (duration > 0 && position >= duration)) continue;
      content.push(part.text.slice(offset, match.index));
      content.push(<Text key={contentKey("timestamp", part.text, match[0])} onPress={() => onTimestamp(position)}>{match[0]}</Text>);
      offset = match.index + match[0].length;
    }
    content.push(part.text.slice(offset));
    return content;
  }) : "No description available"}</Text>;
}
