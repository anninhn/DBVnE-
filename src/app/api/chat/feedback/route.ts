/**
 * Discovery Chat feedback — update thumbs + optional text cho 1 chat entry.
 *
 * POST /api/chat/feedback
 *   body: { chat_id: string, thumbs: "up"|"down", feedback_text?: string }
 *   response: { ok: true } | { ok: false, error: string }
 *
 * Spec 2026-07-24-discovery-chat.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUserOr401 } from "@/lib/auth";
import { updateChatThumbs } from "@/lib/r2/chat-log";

interface FeedbackRequest {
  chat_id: string;
  thumbs: "up" | "down";
  feedback_text?: string;
}

export async function POST(req: NextRequest) {
  const authCheck = await requireUserOr401();
  if (!authCheck.ok) return authCheck.response;

  let body: FeedbackRequest;
  try {
    body = (await req.json()) as FeedbackRequest;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Body phải là JSON hợp lệ" },
      { status: 400 },
    );
  }

  if (!body.chat_id || (body.thumbs !== "up" && body.thumbs !== "down")) {
    return NextResponse.json(
      { ok: false, error: "Thiếu chat_id hoặc thumbs không hợp lệ" },
      { status: 400 },
    );
  }

  if (body.feedback_text && body.feedback_text.length > 1000) {
    return NextResponse.json(
      { ok: false, error: "Feedback quá dài (tối đa 1000 ký tự)" },
      { status: 400 },
    );
  }

  const updated = await updateChatThumbs(
    body.chat_id,
    body.thumbs,
    body.feedback_text?.trim() || undefined,
  );

  if (!updated) {
    return NextResponse.json(
      { ok: false, error: "Không tìm thấy entry — có thể đã quá 24h" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}
