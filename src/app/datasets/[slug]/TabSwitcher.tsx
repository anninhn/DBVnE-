"use client";

import { useState } from "react";

export interface TabDef {
  key: string;
  label: string;
}

interface TabSwitcherProps {
  tabs: TabDef[];
  children: React.ReactNode[];
}

/** Thanh tab HF-style: underline vàng trên tab active. Lazy render. */
export default function TabSwitcher({ tabs, children }: TabSwitcherProps) {
  const [active, setActive] = useState(0);

  return (
    <>
      <div className="flex gap-0 px-6 border-b border-hf-border">
        {tabs.map((tab, i) => (
          <button
            key={tab.key}
            onClick={() => setActive(i)}
            className={`py-3 px-4 text-sm font-medium border-b-2 -mb-px transition-colors ${
              i === active
                ? "text-hf-text font-semibold border-[var(--color-hf-yellow)]"
                : "text-hf-text-muted border-transparent hover:text-hf-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="mt-6">{children[active]}</div>
    </>
  );
}
