"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Dock, GlassSystemProvider, SegmentedControl } from "open-glass-ui";

function MaterialScope({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<"light" | "dark">("dark");
  useEffect(() => {
    const sync = () =>
      setAppearance(
        document.documentElement.dataset.theme === "light" ? "light" : "dark",
      );
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);
  return (
    <GlassSystemProvider
      renderer="css"
      design="liquid"
      toasts={false}
      theme={{ appearance, className: "hive-material-scope" }}
    >
      {children}
    </GlassSystemProvider>
  );
}
export function WorkspaceGlassDock({ children }: { children: ReactNode }) {
  return (
    <MaterialScope>
      <Dock
        className="hive-mobile-nav hive-library-dock"
        label="Mobile Navigation"
        material="frosted"
      >
        {children}
      </Dock>
    </MaterialScope>
  );
}
type View = "list" | "board" | "calendar";
const views = [
  { value: "list" as const, label: "Liste" },
  { value: "board" as const, label: "Board" },
  { value: "calendar" as const, label: "Kalender" },
];
export function WorkspaceViewSwitch({
  value,
  onChange,
}: {
  value: View;
  onChange: (view: View) => void;
}) {
  return (
    <MaterialScope>
      <SegmentedControl
        className="hive-library-views"
        aria-label="Projektansicht"
        items={views}
        value={value}
        onValueChange={onChange}
      />
    </MaterialScope>
  );
}
