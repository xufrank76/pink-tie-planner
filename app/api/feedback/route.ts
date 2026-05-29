import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const { message, context } = await req.json();
  if (!message?.trim()) {
    return NextResponse.json({ error: 'empty message' }, { status: 400 });
  }

  const { error } = await resend.emails.send({
    from: 'Pink Tie Planner <onboarding@resend.dev>',
    to: 'frank.xu.hi@gmail.com',
    subject: context?.program
      ? `[pink tie] feedback — ${context.program}`
      : '[pink tie] feedback',
    text: [
      message.trim(),
      '',
      '---',
      context?.program ? `Program: ${context.program}` : null,
      context?.page ? `Page: ${context.page}` : null,
    ].filter(Boolean).join('\n'),
  });

  if (error) {
    console.error('Resend error:', JSON.stringify(error));
    return NextResponse.json({ error: error.message ?? 'failed to send' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
