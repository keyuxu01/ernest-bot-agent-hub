'use client';

import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  type ReactNode,
} from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AnswerMarkdownProps, CiteItem } from '../_types/knowledge-hub';
import { focusCite } from '../_utils/citations';

type CiteChipsProps = {
  text: string;
  byIndex: Map<number, CiteItem>;
  onCite: (index: number) => void;
};

const CiteChips = (props: CiteChipsProps) => {
  const { byIndex, onCite, text } = props;
  const parts = text.split(/(\[\d+\])/);
  if (parts.length === 1) return text;

  return (
    <>
      {parts.map((part, index) => {
        const match = part.match(/^\[(\d+)\]$/);
        if (!match) return <span key={index}>{part}</span>;
        const sourceIndex = Number(match[1]);
        if (!byIndex.has(sourceIndex)) return <span key={index}>{part}</span>;
        return (
          <button
            key={index}
            type="button"
            className="kh-cite-inline"
            title="查看本条用到的资料块"
            onClick={() => onCite(sourceIndex)}
          >
            {part}
          </button>
        );
      })}
    </>
  );
};

const injectCites = (
  children: ReactNode,
  byIndex: Map<number, CiteItem>,
  onCite: (index: number) => void,
): ReactNode =>
  Children.map(children, (child, index) => {
    if (typeof child === 'string' || typeof child === 'number') {
      return (
        <CiteChips key={index} text={String(child)} byIndex={byIndex} onCite={onCite} />
      );
    }
    if (isValidElement<{ children?: ReactNode }>(child) && child.props.children != null) {
      return cloneElement(child, {
        children: injectCites(child.props.children, byIndex, onCite),
      });
    }
    return child;
  });

/**
 * @description Render an assistant answer as GFM Markdown with interactive `[n]` citations.
 */
const AnswerMarkdown = (props: AnswerMarkdownProps) => {
  const { onCite, scope, sources, text } = props;
  const byIndex = new Map(
    (sources ?? [])
      .filter(source => source.index != null)
      .map(source => [source.index as number, source]),
  );
  const handleCite = useCallback(
    (index: number) => {
      onCite?.(index);
      focusCite(scope, index);
    },
    [onCite, scope],
  );
  const wrap = (children: ReactNode) => injectCites(children, byIndex, handleCite);

  return (
    <div className="kh-md">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p>{wrap(children)}</p>,
          li: ({ children }) => <li>{wrap(children)}</li>,
          strong: ({ children }) => <strong>{wrap(children)}</strong>,
          em: ({ children }) => <em>{wrap(children)}</em>,
          h1: ({ children }) => <h3>{wrap(children)}</h3>,
          h2: ({ children }) => <h3>{wrap(children)}</h3>,
          h3: ({ children }) => <h4>{wrap(children)}</h4>,
          h4: ({ children }) => <h4>{wrap(children)}</h4>,
          td: ({ children }) => <td>{wrap(children)}</td>,
          th: ({ children }) => <th>{wrap(children)}</th>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {wrap(children)}
            </a>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
};

export { AnswerMarkdown };
