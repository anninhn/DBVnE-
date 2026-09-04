/**
 * Ba năng lực tra cứu, độc lập với mặt tiền.
 *
 * Hợp đồng: `specs/005-discovery-chat-scale/contracts/`.
 * Thư mục này đặt NGANG CẤP `src/lib/chat/`, không nằm trong — vì đây không phải
 * việc của luồng chat (FR-058).
 */

export type * from "./types";
export { RetrievalIndexUnavailableError } from "./types";
export { normalize, tokenize } from "./normalize";
