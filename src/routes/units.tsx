import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { UnitSettingsSheet } from "@/components/UnitSettings";

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
  component: UnitsPage,
});

function UnitsPage() {
  const navigate = useNavigate();
  return (
    <div
      className="page-enter min-h-screen w-full"
      style={{ background: "linear-gradient(160deg, #14324f 0%, #0a1b2e 100%)" }}
    >
      <UnitSettingsSheet onClose={() => navigate({ to: "/" })} />
    </div>
  );
}