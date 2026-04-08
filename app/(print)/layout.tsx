// app/(print)/layout.tsx
// Bare layout for printable pages — no sidebar, no topbar, no chrome.
// Pages under (print)/ render directly inside the root layout only.
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}