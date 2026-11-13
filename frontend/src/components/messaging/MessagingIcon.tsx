import type { ReactNode } from "react";

const paths = {
  message: <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5ZM8 11h.01M12 11h.01M16 11h.01" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7M3 18l6-6m12 6-6-6" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18M8 15h2m4 0h2m-8 3h2" /></>,
  search: <><circle cx="10.5" cy="10.5" r="7" /><path d="m16 16 5 5" /></>,
  send: <><path d="m3 3 18 9-18 9 4-9-4-9ZM7 12h14" /></>,
  smile: <><circle cx="12" cy="12" r="9" /><path d="M8 9h.01M16 9h.01M8 14s1 3 4 3 4-3 4-3" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10h.01" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 7A7 7 0 0 1 18 6l2 3M4 15l2 3a7 7 0 0 0 11.9-1" /></>,
  graduation: <><path d="m2 8 10-5 10 5-10 5L2 8Zm4 3v7s6 4 12 0v-7M22 8v8" /></>,
  award: <><circle cx="12" cy="9" r="6" /><path d="m8 14-2 8 6-3 6 3-2-8M10 9l1 1 3-3" /></>,
  book: <><path d="M12 5C8 2 3 4 3 4v16s5-2 9 1c4-3 9-1 9-1V4s-5-2-9 1Zm0 0v16" /></>,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  check: <path d="m4 12 5 5L20 6m-7 11 8-8" />,
  plus: <path d="M12 5v14M5 12h14" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
} satisfies Record<string, ReactNode>;

function MessagingIcon({ name }: { name: keyof typeof paths }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
export default MessagingIcon;
