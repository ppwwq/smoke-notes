import { DiamondGrid } from "./diamond-grid/DiamondGrid";

/** Accessible status text around the decorative, prop-free Amicro animation. */
export function LoadingStatus({ label }: { label: string }) {
  return (
    <div className="loading-status" role="status" aria-live="polite">
      <DiamondGrid />
      <span>{label}</span>
    </div>
  );
}
