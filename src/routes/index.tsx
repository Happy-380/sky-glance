import { createFileRoute } from "@tanstack/react-router";
import { WeatherApp } from "@/components/WeatherApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vertex Weather — Real-time forecasts" },
      {
        name: "description",
        content:
          "Apple Weather inspired app: current conditions, hourly and 7-day forecasts, air quality, sunrise, wind, and saved cities.",
      },
      { property: "og:title", content: "Vertex Weather" },
      {
        property: "og:description",
        content: "Beautiful real-time weather for any city in the world.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <WeatherApp />;
}
