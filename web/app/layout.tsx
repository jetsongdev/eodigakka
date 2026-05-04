import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'eodigakka — 임장 후보 색칠지도',
  description:
    'RTMS 실거래가 기반 자금 4~8억 강북 14구 매매·전세 임장 후보 동 색칠지도',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
