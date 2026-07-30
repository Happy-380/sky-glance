import { createFileRoute } from "@tanstack/react-router";
import { CityList } from "@/components/CityList";

export const Route = createFileRoute("/cities")({
  head: () => ({
    meta: [
      { title: "城市列表 · Vertex Weather" },
      {
        name: "description",
        content: "管理你保存的城市，查看每个城市的实时温度、最高最低温与天气状况。",
      },
      { property: "og:title", content: "City List — Vertex Weather" },
      { property: "og:description", content: "Manage saved cities and see live temperatures at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CityList,
});
