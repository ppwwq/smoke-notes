import { useRef, useState, type CSSProperties } from "react";
import { Select } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import "./workspace-select.css";

/** Shared choice menu; Base UI owns keyboard, touch, dismissal and focus return. */
export function WorkspaceSelect<Value extends string | number>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: Value;
  options: {
    value: Value;
    label: string;
    swatch?: string;
    swatchInk?: string;
  }[];
  disabled?: boolean;
  onChange(value: Value): void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const selectedColor = options.find(
    (option) => option.value === value,
  )?.swatch;
  return (
    <Select.Root
      value={value}
      items={options}
      disabled={disabled}
      onOpenChangeComplete={(open) => {
        if (!open) return;
        const selected =
          list.current?.querySelector<HTMLElement>("[data-selected]");
        if (selected && list.current)
          list.current.scrollTop =
            selected.offsetTop -
            list.current.clientHeight / 2 +
            selected.clientHeight / 2;
      }}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
      onOpenChange={() =>
        setContainer(
          trigger.current?.closest<HTMLElement>(".workspace-app") ?? null,
        )
      }
    >
      <Select.Trigger
        ref={trigger}
        className="workspace-select-trigger"
        aria-label={label}
      >
        {selectedColor && (
          <span
            className="workspace-select-swatch"
            aria-hidden="true"
            style={{ background: selectedColor }}
          />
        )}
        <Select.Value className="workspace-select-value" />
        <Select.Icon className="workspace-select-chevron">
          <ChevronDown size={17} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal container={container ?? undefined}>
        <Select.Positioner
          className="workspace-select-positioner"
          sideOffset={6}
          align="start"
          collisionPadding={12}
          alignItemWithTrigger={false}
        >
          <Select.Popup className="workspace-select-popup" aria-label={label}>
            <Select.List ref={list} className="workspace-select-list">
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  className="workspace-select-option"
                  data-color={option.swatch ? "" : undefined}
                  style={
                    option.swatch
                      ? ({
                          "--option-color": option.swatch,
                          "--option-ink": option.swatchInk ?? "#211a35",
                        } as CSSProperties)
                      : undefined
                  }
                >
                  {option.swatch && (
                    <span
                      className="workspace-select-swatch"
                      aria-hidden="true"
                      style={{ background: option.swatch }}
                    />
                  )}
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator className="workspace-select-check">
                    <Check size={17} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
