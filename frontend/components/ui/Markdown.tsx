"use client";

import ReactMarkdown from "react-markdown";

interface Props {
  children: string;
  className?: string;
}

export function Markdown({ children, className }: Props) {
  return (
    <div className={className}>
      <ReactMarkdown
        components={{
          p: ({ children }: any) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }: any) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
          ol: ({ children }: any) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
          li: ({ children }: any) => <li className="leading-snug">{children}</li>,
          strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }: any) => <em className="italic">{children}</em>,
          code: ({ children, className: cls }: any) => {
            const isBlock = cls?.includes("language-");
            return isBlock ? (
              <pre className="bg-black/10 dark:bg-white/10 rounded p-2 my-2 overflow-x-auto text-xs">
                <code>{children}</code>
              </pre>
            ) : (
              <code className="bg-black/10 dark:bg-white/10 rounded px-1 py-0.5 text-xs font-mono">
                {children}
              </code>
            );
          },
          h1: ({ children }: any) => <h1 className="text-base font-bold mb-1">{children}</h1>,
          h2: ({ children }: any) => <h2 className="text-sm font-bold mb-1">{children}</h2>,
          h3: ({ children }: any) => <h3 className="text-sm font-semibold mb-1">{children}</h3>,
          blockquote: ({ children }: any) => (
            <blockquote className="border-l-2 border-current pl-3 opacity-70 my-1">{children}</blockquote>
          ),
          a: ({ href, children }: any) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="underline opacity-80 hover:opacity-100">
              {children}
            </a>
          ),
        } as object}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
