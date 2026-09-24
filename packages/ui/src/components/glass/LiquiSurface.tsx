// Adapted from Liqui registry toolbar/dialog/tab-bar. See THIRD_PARTY_NOTICES.md.
import { useState } from "react";
import { LiquiGlass } from "@liqui-design/glass";

export default function LiquiSurface({
  kind,
}: {
  kind: "toolbar" | "dialog" | "nav";
}) {
  const [material] = useState<"auto" | "frost">(() => {
    try {
      return document.createElement("canvas").getContext("2d") &&
        typeof ResizeObserver !== "undefined"
        ? "auto"
        : "frost";
    } catch {
      return "frost";
    }
  });
  const optics =
    kind === "nav"
      ? { radius: 29, blur: 0.2, frost: 0.16, refraction: 64, bezel: 17 }
      : kind === "dialog"
        ? { radius: 22, blur: 1, frost: 0.6, refraction: 130, bezel: 30 }
        : { radius: 16, blur: 1, frost: 0.55, refraction: 70, bezel: 15 };
  return (
    <LiquiGlass
      aria-hidden="true"
      className="web-glass-optics"
      material={material}
      {...optics}
    />
  );
}
