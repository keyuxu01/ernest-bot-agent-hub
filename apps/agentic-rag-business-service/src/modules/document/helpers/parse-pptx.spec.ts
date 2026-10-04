import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parsePptx } from './parse-pptx';

const slideXml = `
<p:sld>
  <p:sp>
    <p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
    <a:p><a:t>封面标题</a:t></a:p>
  </p:sp>
  <a:tbl>
    <a:tr>
      <a:tc><a:p><a:t>列A</a:t></a:p></a:tc>
      <a:tc><a:p><a:t>列B</a:t></a:p></a:tc>
    </a:tr>
    <a:tr>
      <a:tc><a:p><a:t>1</a:t></a:p></a:tc>
      <a:tc><a:p><a:t>2</a:t></a:p></a:tc>
    </a:tr>
  </a:tbl>
  <a:p><a:t>封面标题</a:t></a:p>
  <a:p><a:t>正文&#x4E2D;文</a:t></a:p>
</p:sld>
`;

describe('parsePptx', () => {
  it('extracts titles, tables and decodes numeric entities', () => {
    const zip = zipSync({
      'ppt/slides/slide2.xml': strToU8(
        '<p:sld><a:p><a:t>第二页</a:t></a:p></p:sld>',
      ),
      'ppt/slides/slide1.xml': strToU8(slideXml),
      '../escape.xml': strToU8('nope'),
    });

    const { markdown } = parsePptx(Buffer.from(zip));

    expect(markdown).toMatch(/^## 幻灯片 1/m);
    expect(markdown).toContain('### 封面标题');
    expect(markdown).toContain('| 列A | 列B |');
    expect(markdown).toContain('正文中文');
    expect(markdown).toContain('## 幻灯片 2');
    expect(markdown).toContain('第二页');
    expect(markdown).toContain('### 封面标题');
  });

  it('rejects archives without slides', () => {
    expect(() =>
      parsePptx(Buffer.from(zipSync({ 'ppt/media/image1.png': strToU8('x') }))),
    ).toThrow('没有幻灯片');
  });
});
