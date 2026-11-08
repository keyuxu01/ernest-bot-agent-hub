import type { ThinkBlockProps } from '../_types/knowledge-hub';

/**
 * @description Render collapsible model reasoning emitted by the streaming endpoint.
 */
const ChatThinkBlock = (props: ThinkBlockProps) => {
  const { streaming, text } = props;

  return (
    <details className="kh-think" open>
      <summary>{streaming ? '思考中…' : '思考过程'}</summary>
      <div className="kh-think-body">{text}</div>
    </details>
  );
};

export { ChatThinkBlock };
