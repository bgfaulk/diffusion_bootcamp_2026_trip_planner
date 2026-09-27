// Stroke icons for the primary nav (shown alone when the sidebar is collapsed).
const paths: Record<string, React.ReactNode> = {
  overview: <path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  prechecks: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.8 2.8L16 9.5" /></>,
  packing: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" /></>,
  departure: <path d="M2 20h20M3.2 13.2l15.6-4.4a2 2 0 0 0-1.1-3.8l-4.3 1.2L8.8 3.6l-2.3.6 2.7 4.3-3.9 1.1-2.2-1.7-1.9.5z" />,
  explore: <><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></>,
  tripInfo: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>,
  gallery: <><path d="M4 8h3.5l1.8-3h5.4l1.8 3H20v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  return: <path d="M2 20h20M3 8.6l15.9 4.5a2 2 0 0 0 1.1-3.8l-4.3-1.2-4.6-5.3-2.3-.6 1.7 4.9-3.9-1.1-1.3-2.4-1.9-.5z" />
};

export function PageIcon({ page }: { page: string }) {
  return <svg className="page-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[page] || paths.overview}</svg>;
}
