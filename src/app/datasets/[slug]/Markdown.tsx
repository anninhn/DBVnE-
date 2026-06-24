"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Render Markdown an toàn (no raw HTML) với styling khớp HF tokens.
 * Dùng cho dataset description (README) trên Dataset card tab.
 * spec: specs/2026-06-24-markdown-description/
 */
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="text-hf-text">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-xl font-bold text-hf-text mt-6 mb-3">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-semibold text-hf-text mt-5 mb-2 pb-1.5 border-b border-hf-border">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-hf-text mt-4 mb-2">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="mb-2.5 text-hf-text leading-relaxed">{children}</p>
          ),
          ul: ({ children }) => <ul className="list-disc ml-5 mb-2.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal ml-5 mb-2.5">{children}</ol>,
          li: ({ children }) => <li className="mb-1">{children}</li>,
          code: ({ children }) => (
            <code className="font-mono text-sm bg-hf-bg-muted px-1.5 py-0.5 rounded">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="bg-hf-bg-muted p-3 rounded-md overflow-x-auto mb-2.5 font-mono text-sm">
              {children}
            </pre>
          ),
          a: ({ children, href }) => (
            <a href={href} className="text-hf-link hover:underline">
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-hf-text">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          table: ({ children }) => (
            <div className="overflow-x-auto mb-2.5">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead>{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          th: ({ children }) => (
            <th className="text-left px-3 py-2 bg-hf-bg-subtle border border-hf-border font-medium text-hf-text">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-1.5 border border-hf-border text-hf-text">{children}</td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-hf-border pl-3 text-hf-text-muted italic mb-2.5">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-hf-border my-4" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
