import type { Metadata } from 'next';
import { App as AntdApp } from 'antd';
import { QueryProvider } from '../components/providers';
import 'antd/dist/reset.css';
import './globals.css';

const metadata: Metadata = {
  title: 'Knowledge Hub',
  description: '文档、检索、问答与知识图谱平台',
};

const RootLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => {
  return (
    <html lang="zh-CN">
      <body>
        <AntdApp>
          <QueryProvider>{children}</QueryProvider>
        </AntdApp>
      </body>
    </html>
  );
};

export { metadata };
export default RootLayout;
