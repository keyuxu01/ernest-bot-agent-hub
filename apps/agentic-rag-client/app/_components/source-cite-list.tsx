'use client';

import { Link } from '../_lib/navigation';
import type { SourceCiteListProps } from '../_types/knowledge-hub';
import { citeAnchorId } from '../_utils/citations';
import { FileTypeIcon } from './file-type-icon';

/**
 * @description Render horizontal citation cards for sources used by one assistant answer.
 */
const SourceCiteList = (props: SourceCiteListProps) => {
  const { activeIndex, items, onSelect, scope } = props;
  if (!items.length) return null;

  return (
    <div className="kh-cite-list">
      <div className="kh-cite-list-title">引用文档 ({items.length})</div>
      <div className="kh-cite-rail">
        {items.map((source, itemIndex) => {
          const index = source.index ?? itemIndex + 1;
          return (
            <div
              key={`${source.documentId}-${index}`}
              id={citeAnchorId(scope, index)}
              className={`kh-cite${activeIndex === index ? ' active' : ''}`}
              onClick={() => onSelect?.(index)}
            >
              <FileTypeIcon name={source.documentTitle} size={28} />
              <div className="kh-cite-body">
                <div className="kh-cite-title" title={source.documentTitle}>
                  [{index}] {source.documentTitle}
                </div>
                {source.heading ? (
                  <div className="kh-cite-heading" title={source.heading}>
                    {source.heading}
                  </div>
                ) : null}
                {source.excerpt ? (
                  <div className="kh-cite-meta" title={source.excerpt}>
                    {source.excerpt}
                  </div>
                ) : null}
                <Link
                  className="kh-cite-open"
                  to={`/documents/${source.documentId}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={event => event.stopPropagation()}
                >
                  查看原文
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export { SourceCiteList };
