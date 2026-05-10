import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';

export async function POST(request: NextRequest) {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected) {
    // 운영 환경 누락은 별도 log로 단서 남기고 응답은 401 (e2e 일관성 + 외부 정보 누설 방지)
    console.error('[revalidate] REVALIDATE_SECRET not configured');
  }

  const auth = request.headers.get('authorization');
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json(
      { error: 'unauthorized', evidence: 'Authorization 헤더 불일치 또는 env 누락' },
      { status: 401 },
    );
  }

  const tag = request.nextUrl.searchParams.get('tag');
  if (!tag) {
    return NextResponse.json(
      { error: 'tag query param required', evidence: '?tag=... 누락' },
      { status: 400 },
    );
  }

  // Next.js 16 cacheComponents 모드: profile 인자 필수.
  // webhook(외부 트리거)은 { expire: 0 }로 즉시 만료 — 다음 요청이 stale 응답 받지 않게.
  revalidateTag(tag, { expire: 0 });

  return NextResponse.json({
    revalidated: true,
    tag,
    now: new Date().toISOString(),
  });
}
