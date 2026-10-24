import { WorkspaceSelect } from "./WorkspaceSelect";
const names: Record<string, string> = {
  "Asia/Hong_Kong": "香港",
  "Asia/Shanghai": "上海／北京",
  "Asia/Taipei": "台北",
  "Asia/Tokyo": "东京",
  "Asia/Singapore": "新加坡",
  "Europe/London": "伦敦",
  "Europe/Paris": "巴黎",
  "America/New_York": "纽约",
  "America/Los_Angeles": "洛杉矶",
  "Australia/Sydney": "悉尼",
  UTC: "UTC",
};
const zones = [
  ...new Set([...Object.keys(names), ...Intl.supportedValuesOf("timeZone")]),
];
export function CalendarZoneField({
  value,
  onChange,
  label = "日程时区",
}: {
  value: string;
  onChange(value: string): void;
  label?: string;
}) {
  return (
    <WorkspaceSelect
      label={label}
      value={value}
      onChange={onChange}
      options={[...new Set([value, ...zones])].map((zone) => ({
        value: zone,
        label: names[zone]
          ? `${names[zone]} · ${zone}`
          : zone.replaceAll("_", " "),
      }))}
    />
  );
}
