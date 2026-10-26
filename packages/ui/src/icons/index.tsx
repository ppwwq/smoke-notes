import type { ReactNode, SVGProps } from "react";

/** Jotday UI glyphs: a 24-unit grid, 1.8-unit strokes and round terminals.
 * Icons are decorative; the owning control supplies its existing accessible name.
 * Keep geometry in this module so shared web/native controls use the same language.
 */
type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };
function Icon({
  name,
  size = 20,
  className = "",
  children,
  ...props
}: IconProps & { name: string; children: ReactNode }) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`smoke-icon ${className}`.trim()}
      data-smoke-icon={name}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const paper = (
  <path d="M14 3.5H6.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-9L14 3.5Zm0 0v4a2 2 0 0 0 2 2h3.5" />
);
export function StickyNote(props: IconProps) {
  return (
    <Icon {...props} name={"note"}>
      <>
        {paper}
        <path d="M8 13h8M8 16.5h5" />
      </>
    </Icon>
  );
}
export function NotebookPen(props: IconProps) {
  return <StickyNote {...props} />;
}
export function Notebook(props: IconProps) {
  return (
    <Icon {...props} name={"notebook"}>
      <>
        <rect x="5" y="3.5" width="14.5" height="17" rx="2.5" />
        <path d="M8.5 3.5v17M3.5 7h3M3.5 12h3M3.5 17h3M12 8h4" />
      </>
    </Icon>
  );
}
export function Library(props: IconProps) {
  return (
    <Icon {...props} name={"notebooks"}>
      <>
        <rect x="3.5" y="5" width="4.5" height="15" rx="1.5" />
        <path d="M11.5 5v15M15.5 4.5l4.5 14.5M4 8.5h3.5" />
      </>
    </Icon>
  );
}
export function CheckCircle2(props: IconProps) {
  return (
    <Icon {...props} name={"tasks"}>
      <>
        <rect x="3.5" y="3.5" width="17" height="17" rx="6" />
        <path d="m7.5 12 3 3 6-6" />
      </>
    </Icon>
  );
}
export function CheckSquare2(props: IconProps) {
  return (
    <Icon {...props} name={"checklist"}>
      <>
        {paper}
        <path d="m7.5 13 1.2 1.2 2-2.4M13 13h3M8 17h8" />
      </>
    </Icon>
  );
}
export function FilePlus2(props: IconProps) {
  return (
    <Icon {...props} name={"new-note"}>
      <>
        <path d="M12.5 3.5h-6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-6M8 13h5M8 17h8M18 2.5v7M14.5 6h7" />
      </>
    </Icon>
  );
}
export function Settings2(props: IconProps) {
  return (
    <Icon {...props} name={"settings"}>
      <>
        <path d="M4 6.5h7M16 6.5h4M4 17.5h4M13 17.5h7" />
        <circle cx="13.5" cy="6.5" r="2.5" />
        <circle cx="10.5" cy="17.5" r="2.5" />
      </>
    </Icon>
  );
}
export function SlidersHorizontal(props: IconProps) {
  return <Settings2 {...props} />;
}
export function NoteAppearance(props: IconProps) {
  return (
    <Icon {...props} name={"note-appearance"}>
      <>
        {paper}
        <circle cx="10" cy="14.5" r="2.5" />
        <path d="M15.5 13v4" />
      </>
    </Icon>
  );
}
export function Appearance(props: IconProps) {
  return (
    <Icon {...props} name={"appearance"}>
      <>
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <path d="M12 4v16" />
        <path d="M15.5 7.5h1M15.5 11.5h1M15.5 15.5h1" />
      </>
    </Icon>
  );
}
export function TextColor(props: IconProps) {
  return (
    <Icon {...props} name={"text-color"}>
      <>
        <path d="m6.5 16 5-12 5 12M8.5 12h6M5 20h14" />
        <circle cx="12" cy="20" r="1.4" fill="currentColor" stroke="none" />
      </>
    </Icon>
  );
}
export function Highlighter(props: IconProps) {
  return (
    <Icon {...props} name={"highlight"}>
      <>
        <path d="m7 14 8.5-10 4 3.5L11 17l-4-3Zm0 0-2 4 3.5.5L11 17M4 21h15M13.5 6.5l4 3.5" />
      </>
    </Icon>
  );
}
export function Bold(props: IconProps) {
  return (
    <Icon {...props} name={"bold"}>
      <path d="M7 4.5h6a3.5 3.5 0 0 1 0 7H7m0-7v15h6.5a4 4 0 0 0 0-8H7" />
    </Icon>
  );
}
export function Italic(props: IconProps) {
  return (
    <Icon {...props} name={"italic"}>
      <path d="M10 4.5h8M6 19.5h8M14 4.5l-4 15" />
    </Icon>
  );
}
export function Underline(props: IconProps) {
  return (
    <Icon {...props} name={"underline"}>
      <>
        <path d="M7 4v8a5 5 0 0 0 10 0V4M5 21h14" />
      </>
    </Icon>
  );
}
export function Strikethrough(props: IconProps) {
  return (
    <Icon {...props} name={"strike"}>
      <>
        <path d="M17 5.5c-1-1-2.5-1.5-5-1.5-3 0-5 1.5-5 4 0 1.5 1 2.5 3 3M14 13c2 .5 3.5 1.5 3.5 3.5 0 2.5-2.5 3.5-5.5 3.5-2.5 0-4.5-.5-6-2M3 12h18" />
      </>
    </Icon>
  );
}
export function Type(props: IconProps) {
  return (
    <Icon {...props} name={"type"}>
      <path d="M4 6V4.5h16V6M12 4.5v15M8.5 19.5h7" />
    </Icon>
  );
}
export function List(props: IconProps) {
  return (
    <Icon {...props} name={"task-list"}>
      <>
        <path d="m3.5 6 1.3 1.3 2.5-3M10 6h10m-16.5 7 1.3 1.3 2.5-3M10 13h10M10 20h10" />
        <circle cx="5" cy="20" r=".9" fill="currentColor" stroke="none" />
      </>
    </Icon>
  );
}
export function Check(props: IconProps) {
  return (
    <Icon {...props} name={"check"}>
      <path d="m5 12 4.5 4.5L19 7" />
    </Icon>
  );
}
export function Plus(props: IconProps) {
  return (
    <Icon {...props} name={"add"}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}
export function Minus(props: IconProps) {
  return (
    <Icon {...props} name={"minimize"}>
      <path d="M5 12h14" />
    </Icon>
  );
}
export function X(props: IconProps) {
  return (
    <Icon {...props} name={"close"}>
      <path d="m6.5 6.5 11 11m0-11-11 11" />
    </Icon>
  );
}
export function Menu(props: IconProps) {
  return (
    <Icon {...props} name={"menu"}>
      <path d="M4 6.5h16M4 12h16M4 17.5h11" />
    </Icon>
  );
}
export function MoreHorizontal(props: IconProps) {
  return (
    <Icon {...props} name={"more"}>
      <>
        {[5, 12, 19].map((cx) => (
          <circle
            key={cx}
            cx={cx}
            cy="12"
            r="1.5"
            fill="currentColor"
            stroke="none"
          />
        ))}
      </>
    </Icon>
  );
}
export function ArrowLeft(props: IconProps) {
  return (
    <Icon {...props} name={"back"}>
      <path d="m10 5-7 7 7 7M3 12h18" />
    </Icon>
  );
}
export function ArrowUpRight(props: IconProps) {
  return (
    <Icon {...props} name={"open"}>
      <path d="M6.5 17.5 18 6M7 6h11v11" />
    </Icon>
  );
}
export function ExternalLink(props: IconProps) {
  return (
    <Icon {...props} name={"open-note"}>
      <>
        <path d="M10 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4M13 4h7v7M11 13l9-9" />
      </>
    </Icon>
  );
}
export function ChevronDown(props: IconProps) {
  return (
    <Icon {...props} name={"expand"}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}
export function ChevronRight(props: IconProps) {
  return (
    <Icon {...props} name={"next"}>
      <path d="m9 6 6 6-6 6" />
    </Icon>
  );
}
export function Layers(props: IconProps) {
  return (
    <Icon {...props} name={"stack"}>
      <>
        <rect x="4" y="3" width="16" height="12" rx="3" />
        <path d="M5 18h14M7 21h10" />
      </>
    </Icon>
  );
}
export function Pencil(props: IconProps) {
  return (
    <Icon {...props} name={"rename"}>
      <>
        <path d="m5 14 10-10 5 5-10 10-6 1 1-6Zm8-8 5 5M5 14l5 5" />
      </>
    </Icon>
  );
}
export function Trash2(props: IconProps) {
  return (
    <Icon {...props} name={"trash"}>
      <>
        <path d="M3.5 6.5h17M8.5 6.5v-2a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v2M6 7l.8 12a2 2 0 0 0 2 1.5h6.4a2 2 0 0 0 2-1.5L18 7M10 10.5v6M14 10.5v6" />
      </>
    </Icon>
  );
}
export function ArchiveRestore(props: IconProps) {
  return (
    <Icon {...props} name={"restore"}>
      <>
        <rect x="3.5" y="4" width="17" height="4" rx="1" />
        <path d="M5.5 8v11a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V8M12 18v-7m-3 3 3-3 3 3" />
      </>
    </Icon>
  );
}
export function Link2(props: IconProps) {
  return (
    <Icon {...props} name={"pair"}>
      <>
        <rect x="3.5" y="5" width="7" height="14" rx="2" />
        <rect x="13.5" y="3" width="7" height="14" rx="2" />
        <path d="M8 12h8M6.5 16h1M16.5 6h1" />
      </>
    </Icon>
  );
}
export function RefreshCw(props: IconProps) {
  return (
    <Icon {...props} name={"refresh"}>
      <>
        <path d="M19.5 9A8 8 0 1 0 20 14M15 9h5V4" />
      </>
    </Icon>
  );
}
export function Wifi(props: IconProps) {
  return (
    <Icon {...props} name={"online"}>
      <>
        <path d="M3.5 9a13 13 0 0 1 17 0M6.5 12.5a8.5 8.5 0 0 1 11 0M9.5 16a4 4 0 0 1 5 0" />
        <circle cx="12" cy="19.5" r="1" fill="currentColor" stroke="none" />
      </>
    </Icon>
  );
}
export function WifiOff(props: IconProps) {
  return (
    <Icon {...props} name={"offline"}>
      <>
        <path d="m3 3 18 18M9 6.5A13 13 0 0 1 20.5 9M3.5 9l1-.7M6.5 12.5a8.5 8.5 0 0 1 3.5-1.7M9.5 16a4 4 0 0 1 5 0" />
        <circle cx="12" cy="19.5" r="1" fill="currentColor" stroke="none" />
      </>
    </Icon>
  );
}
export function Pin(props: IconProps) {
  return (
    <Icon {...props} name={"pin"}>
      <path d="M8 3.5h8M9 3.5v6L5.5 13v2h13v-2L15 9.5v-6M12 15v6" />
    </Icon>
  );
}
export function PinOff(props: IconProps) {
  return (
    <Icon {...props} name={"unpin"}>
      <>
        <path d="m3 3 18 18M11 3.5h5M15 3.5v6l3.5 3.5v2M8 10.5 5.5 13v2H15M12 15v6" />
      </>
    </Icon>
  );
}
export function Power(props: IconProps) {
  return (
    <Icon {...props} name={"startup"}>
      <>
        <path d="M12 3v9M7 5.5a8 8 0 1 0 10 0" />
      </>
    </Icon>
  );
}
export function GripVertical(props: IconProps) {
  return (
    <Icon {...props} name={"reorder"}>
      <>
        {[6, 12, 18].flatMap((cy) =>
          [9, 15].map((cx) => (
            <circle
              key={`${cx}-${cy}`}
              cx={cx}
              cy={cy}
              r="1.1"
              fill="currentColor"
              stroke="none"
            />
          )),
        )}
      </>
    </Icon>
  );
}
