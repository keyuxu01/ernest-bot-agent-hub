import { SearchOutlined } from '@ant-design/icons';
import type { WebSearchCardProps } from '../_types/knowledge-hub';
import { asRecord, asWebSearchResult } from '../_utils/chat-message';

/**
 * @description Render web-search tool progress, errors, and result links.
 */
const ChatWebSearchCard = (props: WebSearchCardProps) => {
  const { part } = props;
  const input = asRecord(part.input);
  const query = typeof input.query === 'string' ? input.query : '';
  const pending = part.state === 'input-streaming' || part.state === 'input-available';
  const output = asWebSearchResult(part.output);
  const failed = part.state === 'output-error' || Boolean(output?.error);
  const count = output?.items?.length ?? 0;
  const label = pending ? '正在搜索' : failed ? '搜索失败' : '已搜索';

  return (
    <details className={`kh-web${pending ? ' pending' : ''}${failed ? ' failed' : ''}`}>
      <summary>
        <SearchOutlined />
        <span className="kh-web-label">{label}</span>
        {query ? <span className="kh-web-q">{query}</span> : null}
        {!pending && count ? <span className="kh-web-n">{count}</span> : null}
      </summary>
      {failed ? (
        <div className="kh-web-err">{output?.error || part.errorText}</div>
      ) : count ? (
        <ul className="kh-web-list">
          {output?.items.map(item => (
            <li key={item.url}>
              <a href={item.url} target="_blank" rel="noreferrer">
                {item.title}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
};

export { ChatWebSearchCard };
