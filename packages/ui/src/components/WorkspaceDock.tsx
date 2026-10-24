import { CheckCircle2, Library, NotebookPen, Settings2 } from "../icons";
import RubberSegment from "./rubber-segment/RubberSegment";

const destinations = [
  { label: "便签", text: "便签", Icon: NotebookPen },
  { label: "待办", text: "待办", Icon: CheckCircle2 },
  { label: "浏览便签本", text: "便签本", Icon: Library },
  { label: "打开设置", text: "设置", Icon: Settings2 },
];

export function WorkspaceDock({
  selected,
  onSelect,
}: {
  selected: number;
  onSelect(index: number): void;
}) {
  return (
    <RubberSegment
      navigation
      aria-label="主导航"
      className="web-dock"
      value={String(selected)}
      onChange={(_, index) => onSelect(index)}
      items={destinations.map(({ label, text, Icon }, index) => ({
        value: String(index),
        ariaLabel: label,
        label: <span>{text}</span>,
        icon: <Icon size={20} />,
      }))}
      trackColor="var(--navigation-track)"
      thumbColor="var(--navigation-thumb)"
      textColor="var(--navigation-text)"
      activeTextColor="var(--navigation-track)"
      size="lg"
      radius={40}
      inset={8}
      stretch={26}
    />
  );
}
