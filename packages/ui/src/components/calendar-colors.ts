import type { PlannerType } from "@smoke-notes/core";

export const calendarColorOptions: {
  value: PlannerType["color"];
  label: string;
  swatch: string;
  swatchInk: string;
}[] = [
  { value: "amber", label: "纸白", swatch: "#ffffff", swatchInk: "#111111" },
  { value: "rose", label: "浅玫", swatch: "#e9c3de", swatchInk: "#111111" },
  { value: "sage", label: "青柠", swatch: "#d4e73e", swatchInk: "#111111" },
  { value: "sky", label: "晴空", swatch: "#c5cff8", swatchInk: "#111111" },
  { value: "violet", label: "鸢尾紫", swatch: "#c4bbfe", swatchInk: "#111111" },
  { value: "graphite", label: "墨黑", swatch: "#111111", swatchInk: "#fbfaf8" },
  {
    value: "lavender",
    label: "薰衣草",
    swatch: "#ded8ff",
    swatchInk: "#111111",
  },
  { value: "mauve", label: "藕粉", swatch: "#eee5f4", swatchInk: "#111111" },
  { value: "mist", label: "雾蓝", swatch: "#e6eafa", swatchInk: "#111111" },
  {
    value: "dustyrose",
    label: "灰玫瑰",
    swatch: "#efdde5",
    swatchInk: "#111111",
  },
  { value: "peach", label: "杏桃", swatch: "#f4e8c8", swatchInk: "#111111" },
  { value: "clay", label: "陶土灰", swatch: "#e7e3dd", swatchInk: "#111111" },
  {
    value: "purple",
    label: "经典紫",
    swatch: "var(--paper-violet, #c4bbfe)",
    swatchInk: "#382757",
  },
  {
    value: "green",
    label: "经典绿",
    swatch: "var(--paper-lime, #d4e73e)",
    swatchInk: "#35411b",
  },
  { value: "blue", label: "天空", swatch: "#d5e7f4", swatchInk: "#24445d" },
  { value: "orange", label: "杏色", swatch: "#f5dcc5", swatchInk: "#623b1c" },
];
