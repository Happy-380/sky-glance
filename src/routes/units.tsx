import { createFileRoute } from "@tanstack/react-router";
import { UnitSettingsPage } from "@/components/UnitSettings";

export const Route = createFileRoute("/units")({
  head: () => ({
    meta: [
      { title: "单位设置 · Vertex Weather" },
      {
        name: "description",
        content: "设置温度、风速、降水、气压和距离的显示单位。",
      },
    ],
  }),
  component: UnitSettingsPage,
});
