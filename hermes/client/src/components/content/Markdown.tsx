import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

const components: Components = {
  a: ({ node: _node, ...props }) => <a target="_blank" rel="noreferrer noopener" {...props} />,
  img: ({ node: _node, ...props }) => <img loading="lazy" {...props} />,
};

export function Markdown({ children }: { children: string }): JSX.Element {
  return (
    <div className="prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
