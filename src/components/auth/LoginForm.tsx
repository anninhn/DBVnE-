"use client";

/**
 * LoginForm — client component gọi signIn credentials.
 *
 * Spec plan task 9. Tiếng Việt UI, redirect `next` param sau login OK.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

interface Props {
  next: string;
}

export default function LoginForm({ next }: Props) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Sai tên đăng nhập hoặc mật khẩu");
      return;
    }

    if (!result?.ok) {
      setError("Đăng nhập thất bại. Vui lòng thử lại.");
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-hf-bg-subtle border border-hf-border rounded-lg p-6 space-y-4"
    >
      <div>
        <label
          htmlFor="username"
          className="block text-xs font-semibold text-hf-text-faint mb-1"
        >
          Tên đăng nhập
        </label>
        <input
          id="username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoFocus
          className="w-full px-3 py-2 text-sm border border-hf-border rounded-md bg-hf-bg text-hf-text focus:outline-none focus:ring-2 focus:ring-hf-yellow/50"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-xs font-semibold text-hf-text-faint mb-1"
        >
          Mật khẩu
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full px-3 py-2 text-sm border border-hf-border rounded-md bg-hf-bg text-hf-text focus:outline-none focus:ring-2 focus:ring-hf-yellow/50"
        />
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !username || !password}
        className="w-full bg-hf-yellow text-hf-text py-2 rounded-md text-sm font-semibold hover:bg-hf-yellow/80 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Đang đăng nhập…" : "Đăng nhập"}
      </button>

      <p className="text-xs text-hf-text-faint text-center">
        Session lưu vĩnh viễn — không cần đăng nhập lại sau lần đầu.
      </p>
    </form>
  );
}
