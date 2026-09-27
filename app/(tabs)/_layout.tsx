import { Tabs } from "ink";
import { downloadDone, podcastsFilled, search, settingsFilled } from "ink/icons";
export default function Layout() {
  return <Tabs>
    <Tabs.Screen name="index" icon={podcastsFilled} />
    <Tabs.Screen name="downloaded" icon={downloadDone} />
    <Tabs.Screen name="search" icon={search} />
    <Tabs.Screen name="settings" icon={settingsFilled} />
  </Tabs>;
}
