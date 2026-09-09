const paths = {
  dashboard: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm9 0h7v-9h-7v9Zm0-16v5h7V4h-7Z",
  history: "M13 3a9 9 0 1 0 8.94 10H19.9A7 7 0 1 1 13 5a6.9 6.9 0 0 1 4.9 2.1L15 10h7V3l-2.6 2.6A8.95 8.95 0 0 0 13 3Zm-1 5v5.4l4.3 2.5 1-1.7-3.3-1.9V8h-2Z",
  chat: "M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4V6a2 2 0 0 1 2-2Zm3 5h10V7H7v2Zm0 4h7v-2H7v2Z",
  tracker: "M3 12h3.6l2-5 3.4 9 2.6-6 1.6 2H21v2h-6l-1-1.3-3 7.1-3.3-8.8-1 2H3v-1Z",
  exercise: "M6 8h2v8H6V8Zm-3 3h2v2H3v-2Zm13-3h2v8h-2V8Zm3 3h2v2h-2v-2ZM9 11h6v2H9v-2Z",
  leaf: "M20 4c-9 0-14 4-14 10a7.6 7.6 0 0 0 .9 3.6L4 20.5 5.5 22l2.9-2.9A7.7 7.7 0 0 0 12 20c6 0 8-5 8-16Zm-9.7 12.6C11.7 12 14.3 9 18 7.5c-1.7 3.2-4.5 6.6-7.7 9.1Z",
  bell: "M12 22a2.2 2.2 0 0 0 2.2-2.2H9.8A2.2 2.2 0 0 0 12 22Zm7-6v-5a7 7 0 0 0-5.3-6.8V3.5a1.7 1.7 0 1 0-3.4 0v.7A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z",
  document: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-1 7V3.5L18.5 9H13ZM8 13h8v2H8v-2Zm0 4h8v2H8v-2Z",
  calendar: "M7 2h2v2h6V2h2v2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V2ZM5 10v10h14V10H5Zm2 3h4v4H7v-4Z",
  pill: "M8.5 2a6.5 6.5 0 0 0-4.6 11.1l9.2 9.2A6.5 6.5 0 1 0 22.3 13L13 3.9A6.5 6.5 0 0 0 8.5 2Zm-.1 2.6 4.7 4.6-4.2 4.2-4.6-4.7a3.9 3.9 0 0 1 4.1-4.1Z",
  user: "M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4 0-8 2-8 5v3h16v-3c0-3-4-5-8-5Z",
  logout: "M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5v-2H5V5h5V3Zm6.2 4.8-1.4 1.4L16.6 11H9v2h7.6l-1.8 1.8 1.4 1.4L21 12l-4.8-4.2Z",
  menu: "M3 6h18v2H3V6Zm0 5h18v2H3v-2Zm0 5h18v2H3v-2Z",
  close: "M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3 1.4 1.4Z",
  plus: "M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z",
  check: "M9.5 17.6 4 12.1l1.4-1.4 4.1 4.1L18.6 5.3 20 6.7 9.5 17.6Z",
  alert: "M12 2 1 21h22L12 2Zm1 14h-2v2h2v-2Zm0-7h-2v5h2V9Z",
  heart: "M12 21S3 14.7 3 8.9A5 5 0 0 1 12 6a5 5 0 0 1 9 2.9C21 14.7 12 21 12 21Z",
  upload: "M12 3 6.5 8.5 8 10l3-3v10h2V7l3 3 1.5-1.5L12 3ZM4 19h16v2H4v-2Z",
  shield: "M12 2 4 5.5v6c0 5 3.4 9.4 8 10.5 4.6-1.1 8-5.5 8-10.5v-6L12 2Zm-1 13.5-3.5-3.5 1.4-1.4L11 12.7l4.1-4.1 1.4 1.4L11 15.5Z",
  mic: "M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Zm6-3a6 6 0 0 1-5 5.9V21h-2v-4.1A6 6 0 0 1 6 11h2a4 4 0 0 0 8 0h2Z",
  stethoscope: "M6 3v6a4 4 0 0 0 3 3.9V15a4 4 0 0 0 8 0v-1.2a3 3 0 1 0-2-.1V15a2 2 0 0 1-4 0v-2.1A4 4 0 0 0 14 9V3h-2v6a2 2 0 0 1-4 0V3H6Zm12 8.5a1 1 0 1 1-1 1 1 1 0 0 1 1-1Z",
  language: "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm6.9 9h-3a15 15 0 0 0-1.2-5.3A8 8 0 0 1 18.9 11ZM12 4.2A13 13 0 0 1 13.8 11h-3.6A13 13 0 0 1 12 4.2ZM5.1 11a8 8 0 0 1 4.2-5.3A15 15 0 0 0 8.1 11Zm0 2h3a15 15 0 0 0 1.2 5.3A8 8 0 0 1 5.1 13ZM12 19.8A13 13 0 0 1 10.2 13h3.6A13 13 0 0 1 12 19.8Zm2.7-1.5a15 15 0 0 0 1.2-5.3h3a8 8 0 0 1-4.2 5.3Z",
  refresh: "M12 5V2L7.5 6.5 12 11V8a5 5 0 1 1-5 5H5a7 7 0 1 0 7-8Z",
  chart: "M4 20h16v2H4v-2Zm2-6h3v5H6v-5Zm5-6h3v11h-3V8Zm5-4h3v15h-3V4Z",
  info: "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z",
};

export default function Icon({ name, size = 20, className = "", title }) {
  const d = paths[name];
  if (!d) return null;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : "true"}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <path d={d} />
    </svg>
  );
}
