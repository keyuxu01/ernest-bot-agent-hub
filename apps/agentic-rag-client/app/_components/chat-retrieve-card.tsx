import { FileSearchOutlined } from '@ant-design/icons';
import type { RetrieveCardProps } from '../_types/knowledge-hub';

/**
 * @description Render knowledge-base retrieval status and matched document headings.
 */
const ChatRetrieveCard = (props: RetrieveCardProps) => {
  const { items, query } = props;
  const count = items.length;
  const label = count ? '已检索知识库' : '未检索到相关资料';

  return (
    <details className="kh-web">
      <summary>
        <FileSearchOutlined />
        <span className="kh-web-label">{label}</span>
        {query ? <span className="kh-web-q">{query}</span> : null}
        {count ? <span className="kh-web-n">{count}</span> : null}
      </summary>
      {count ? (
        <ul className="kh-web-list">
          {items.map(item => (
            <li key={`${item.documentId}-${item.index}`}>
              [{item.index}] {item.documentTitle}
              {item.heading ? ` / ${item.heading}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
};

export { ChatRetrieveCard };
