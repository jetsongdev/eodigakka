import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'eodigakka — 임장 후보 색칠지도',
  description:
    'RTMS 실거래가 기반 강북 14구 매매·전세 임장 후보 동 색칠지도. 자금 범위·평형으로 통과 동을 한눈에. 단정문 금지 — 후보 제시일 뿐 매매 권유 아님.',
  openGraph: {
    title: 'eodigakka — 임장 후보 색칠지도',
    description:
      'RTMS 실거래가 기반 강북 14구 매매·전세 임장 후보 동 색칠지도',
    type: 'website',
    locale: 'ko_KR',
    siteName: 'eodigakka',
  },
  twitter: {
    card: 'summary',
    title: 'eodigakka — 임장 후보 색칠지도',
    description:
      'RTMS 실거래가 기반 강북 14구 매매·전세 임장 후보 동 색칠지도',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
