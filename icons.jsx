// Lightweight SVG icon set
const Icon = ({ name, size = 16, ...props }) => {
  const icons = {
    search: <path d="M21 21l-4.3-4.3M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16z" />,
    plus: <path d="M12 5v14M5 12h14" />,
    star: <path d="M12 2l2.95 6.7 7.05.6-5.3 4.6 1.6 7.1L12 17.5 5.7 21l1.6-7.1-5.3-4.6 7.05-.6L12 2z" />,
    starFill: <path d="M12 2l2.95 6.7 7.05.6-5.3 4.6 1.6 7.1L12 17.5 5.7 21l1.6-7.1-5.3-4.6 7.05-.6L12 2z" fill="currentColor" />,
    folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />,
    folderFill: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" fill="currentColor" fillOpacity="0.2" />,
    image: <g><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></g>,
    video: <g><rect x="3" y="5" width="14" height="14" rx="2" /><path d="M17 9l5-3v12l-5-3z" /></g>,
    type: <g><path d="M4 7V5h16v2M9 19h6M12 5v14" /></g>,
    calendar: <g><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></g>,
    link: <g><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 1 0-7.07-7.07l-1 1" /><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 1 0 7.07 7.07l1-1" /></g>,
    close: <path d="M18 6L6 18M6 6l12 12" />,
    check: <path d="M20 6L9 17l-5-5" />,
    upload: <g><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5M12 3v12" /></g>,
    message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z" />,
    history: <g><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></g>,
    layers: <g><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" /></g>,
    settings: <g><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></g>,
    moreH: <g><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></g>,
    trash: <g><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></g>,
    edit: <g><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></g>,
    arrowRight: <path d="M5 12h14M12 5l7 7-7 7" />,
    arrowLeft: <path d="M19 12H5M12 19l-7-7 7-7" />,
    target: <g><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></g>,
    box: <g><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" /></g>,
    sparkle: <g><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z" /></g>,
    play: <path d="M5 3l14 9-14 9V3z" fill="currentColor" />,
    rocket: <g><path d="M4.5 16.5c-1.5 1-2 5-2 5s4-.5 5-2c.6-.8.5-2-.2-2.7-.7-.7-2-.7-2.8-.3z" /><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4s.55-3 2-4c1.62-1.12 5 0 5 0M12 15v5s3-.55 4-2c1.12-1.62 0-5 0-5" /></g>,
    flame: <path d="M8.5 14.5A2.5 2.5 0 0 0 11 17c1.5 0 3-1.5 3-3 0-2-1.5-3-2-4.5C11 7 11.5 5 13 3c0 0 6 4 6 11a7 7 0 0 1-14 0c0-2 .5-3 2-5 .5 1.5 1.5 2.5 1.5 5z" />,
    skull: <g><circle cx="12" cy="11" r="9" /><path d="M9 11h.01M15 11h.01M9 17v3M12 17v3M15 17v3" /></g>,
    inbox: <g><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></g>,
    text: <g><path d="M4 7h16M4 12h16M4 17h10" /></g>,
    eye: <g><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></g>,
    drag: <g><circle cx="9" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="19" r="1" /></g>,
    filter: <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {icons[name]}
    </svg>
  );
};

window.Icon = Icon;
