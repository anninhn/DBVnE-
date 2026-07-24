"use client";

/**
 * UserMenu — dropdown hiển thị tên user + nút đăng xuất.
 *
 * Render trong CatalogNav khi session tồn tại.
 * Spec plan task 10.
 */

import { useState, useRef, useEffect } from "react";
import { signOut } from "next-auth/react";
import { ChevronDown, LogOut, User } from "lucide-react";

interface Props {
  displayName: string;
  username: string;
}

export default function UserMenu({ displayName, username }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click outside để close dropdown
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm text-hf-text hover:text-hf-text-muted transition px-2 py-1 rounded-md hover:bg-hf-bg-subtle"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <User className="w-3.5 h-3.5" aria-hidden />
        <span className="font-medium">{displayName}</span>
        <ChevronDown className="w-3 h-3" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 min-w-[180px] bg-hf-bg border border-hf-border rounded-md shadow-lg py-1 z-50"
        >
          <div className="px-3 py-2 text-xs text-hf-text-faint border-b border-hf-border">
            <div className="font-medium text-hf-text">{displayName}</div>
            <div>@{username}</div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="w-full text-left px-3 py-2 text-sm text-hf-text hover:bg-hf-bg-subtle flex items-center gap-2"
            role="menuitem"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden />
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}
