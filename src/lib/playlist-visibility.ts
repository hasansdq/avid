/** مخاطب نمایش لیست پخش — مشترک بین سایت و پنل مدیریت */
export type PlaylistVisibility = "guest" | "user" | "both";

export const PLAYLIST_VISIBILITIES: {
  value: PlaylistVisibility;
  label: string;
  description: string;
}[] = [
  {
    value: "both",
    label: "همه (مهمان و کاربر)",
    description: "لیست پخش برای عموم نمایش داده می‌شود.",
  },
  {
    value: "user",
    label: "فقط کاربران",
    description: "تنها کاربرانی که وارد حساب خود شده‌اند می‌بینند.",
  },
  {
    value: "guest",
    label: "فقط مهمان‌ها",
    description: "تنها بازدیدکنندگانِ وارد‌نشده می‌بینند.",
  },
];

export function isPlaylistVisibility(v: string): v is PlaylistVisibility {
  return v === "guest" || v === "user" || v === "both";
}

/** برچسب فارسی مخاطب */
export function playlistVisibilityLabel(v: string): string {
  return PLAYLIST_VISIBILITIES.find((o) => o.value === v)?.label ?? "همه (مهمان و کاربر)";
}
