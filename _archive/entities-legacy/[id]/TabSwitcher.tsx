"use client";

import { useState } from "react";

interface TabSwitcherProps {
  wardCount: number;
  resourceCount: number;
  children: [React.ReactNode, React.ReactNode, React.ReactNode]; // 3 tabs
}

export default function TabSwitcher({ wardCount, resourceCount, children }: TabSwitcherProps) {
  const [active, setActive] = useState(0);
  const tabs = [
    { label: "Hồ sơ", count: null },
    { label: "Dữ liệu", count: wardCount > 0 ? wardCount : null },
    { label: "Tài nguyên", count: resourceCount > 0 ? resourceCount : null },
  ];

  return (
    <>
      {/* Tab bar */}
      <div className="bg-white border-b" style={{ borderColor: "var(--hf-border)" }}>
        <div className="max-w-[1400px] mx-auto px-6">
          <nav className="flex gap-6 -mb-px">
            {tabs.map((tab, i) => (
              <button
                key={tab.label}
                onClick={() => setActive(i)}
                className="py-3 text-sm font-medium border-b-2 transition-colors"
                style={{
                  borderColor: i === active ? "var(--hf-yellow)" : "transparent",
                  color: i === active ? "var(--hf-text)" : "var(--hf-muted)",
                }}
              >
                {tab.label}
                {tab.count != null && (
                  <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100" style={{ color: "var(--hf-muted)" }}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab content */}
      <div>{children[active]}</div>
    </>
  );
}
