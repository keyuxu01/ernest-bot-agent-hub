import { HEADING_LINE } from '../constants/chunking.constants';

/** 取块内第一个 ATX 标题文案（不含 #） */
function extractHeading(text: string): string | null {
  const match = text.match(HEADING_LINE);
  return match?.[2]?.trim() || null;
}

export { extractHeading };
