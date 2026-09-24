import { Component, lazy, Suspense, type ReactNode } from "react";
import { useGlass } from "./GlassContext";

// Only the web glass theme downloads the kernel (which imports its own CSS).
const Optics = lazy(() => import("./LiquiSurface"));
class OpticalFallback extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function GlassSurface({
  kind = "toolbar",
}: {
  kind?: "toolbar" | "dialog" | "nav";
}) {
  const { enabled, reduced } = useGlass();
  if (!enabled || reduced) return null;
  return (
    <OpticalFallback>
      <Suspense fallback={null}>
        <Optics kind={kind} />
      </Suspense>
    </OpticalFallback>
  );
}
