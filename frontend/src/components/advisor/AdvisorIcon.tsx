import type { ReactNode } from "react";

const icons = {
  mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/></>,
  shield: <><path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Z"/><path d="m8 12 3 3 5-6"/></>,
  lock: <><rect x="4" y="10" width="16" height="12" rx="2"/><path d="M7 10V7a5 5 0 0 1 10 0v3"/><circle cx="12" cy="16" r="1"/></>,
  eye: <><path d="M2 12S6 5 12 5s10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />,
  target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="m12 12 9-9m-5 0h5v5"/></>,
  trend: <><path d="m3 17 6-7 5 4 7-10m-6 0h6v6"/><circle cx="3" cy="17" r="1"/><circle cx="9" cy="10" r="1"/><circle cx="14" cy="14" r="1"/></>,
  home: <><path d="m3 10 9-7 9 7v10H3V10Z" /><path d="M9 20v-8h6v8" /></>,
  user: <><circle cx="12" cy="7" r="4" /><path d="M4 21v-3a8 8 0 0 1 16 0v3H4Z" /></>,
  users: <><circle cx="9" cy="7" r="4" /><path d="M2 21v-3a7 7 0 0 1 14 0v3H2ZM17 4a4 4 0 0 1 0 8m1 3a6 6 0 0 1 4 6" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18M7 15h4m-4 3h7" /></>,
  appointment: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18m-14 5 3 2 5-5" /></>,
  hourglass: <><path d="M5 3h14M5 21h14M6 3v4c0 3 6 5 6 5s6-2 6-5V3M6 21v-4c0-3 6-5 6-5s6 2 6 5v4" /><path d="m9 6 3 3 3-3M9 18l3-3 3 3" /></>,
  star: <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2-6.2 3.2L7 14.2 2 9.3l6.9-1L12 2Z" />,
  quiz: <><path d="M5 3h10l4 4v14H5V3Z" /><path d="M14 3v5h5M8 12h8m-8 4h6" /></>,
  layers: <><path d="m12 2 10 6-10 6L2 8l10-6Zm-10 10 10 6 10-6M2 16l10 6 10-6" /></>,
  chart: <><path d="M3 21V11h4v10M10 21V4h4v17M17 21V8h4v13" /></>,
  message: <><path d="M4 4h16v13h-9l-5 4v-4H4V4Z" /><path d="M8 8h8m-8 4h5" /></>,
  settings: <><path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3H9Z" /><circle cx="12" cy="12" r="3" /></>,
  search: <><circle cx="10.5" cy="10.5" r="7" /><path d="m16 16 5 5" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM9 21h6" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
  down: <path d="m6 9 6 6 6-6" />,
  bolt: <path d="m13 2-9 12h7l-1 8L21 9h-8l1-7Z" />,
  play: <><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4V8Z" /></>,
  graduation: <><path d="m2 8 10-5 10 5-10 5L2 8Zm4 3v7s6 4 12 0v-7M22 8v8" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1" /></>,
  logout: <><path d="M9 3H4v18h5m5-14 5 5-5 5M9 12h11" /></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/></>,
  break: <><path d="M4 8h12v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8ZM16 9h2a3 3 0 0 1 0 6h-2M3 22h16M7 5V2m4 3V1m4 4V2"/></>,
  flag: <path d="M5 22V3s4-3 8 0 8 0 8 0v11s-4 3-8 0-8 0-8 0"/>,
  filter: <path d="M3 4h18l-7 8v8l-4-2v-6L3 4Z"/>,
  send: <><path d="m22 2-7 20-4-9-9-4L22 2ZM11 13 22 2"/></>,
  trophy: <><path d="M7 3h10v7a5 5 0 0 1-10 0V3ZM7 5H3v3a5 5 0 0 0 5 5M17 5h4v3a5 5 0 0 1-5 5M12 15v6M7 21h10"/></>,
  close: <path d="m6 6 12 12M6 18 18 6" />,
} satisfies Record<string, ReactNode>;

export type AdvisorIconName = keyof typeof icons;
function AdvisorIcon({ name }: { name: AdvisorIconName }) {
  return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg>;
}
export default AdvisorIcon;
