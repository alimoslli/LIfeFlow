import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renders model output as Markdown. Raw HTML is not rendered (react-markdown default). */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="prose-bf text-[14.5px] text-text">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const internal = href?.startsWith("/");
            return (
              <a href={href} {...(!internal && { target: "_blank", rel: "noopener noreferrer nofollow" })}>
                {children}
              </a>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
