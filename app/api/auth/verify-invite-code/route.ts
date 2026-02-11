import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    if (!supabaseServer) {
      return NextResponse.json(
        { valid: false, error: '서버 설정 오류' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { code } = body as { code?: string };

    if (!code || code.trim().length === 0) {
      return NextResponse.json(
        { valid: false, error: '초대코드를 입력해주세요.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseServer
      .from('invite_codes')
      .select('id, code, is_active')
      .eq('code', code.trim())
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { valid: false, error: '유효하지 않은 초대코드입니다.' },
        { status: 200 }
      );
    }

    return NextResponse.json({ valid: true }, { status: 200 });
  } catch {
    return NextResponse.json(
      { valid: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
