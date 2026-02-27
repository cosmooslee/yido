import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeEnvValue(value: string) {
  const noBom = value.replace(/^\uFEFF/, "");
  const trimmed = noBom.trim();
  const unquoted = trimmed.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  return unquoted.replace(/[^\x21-\x7E]/g, "");
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function unauthorized() {
  return new NextResponse(null, { status: 404 });
}

export async function GET(request: Request) {
  // 운영환경에서는 디버그 엔드포인트를 숨깁니다.
  if (process.env.NODE_ENV !== "development") {
    return unauthorized();
  }

  // 개발환경에서도 비밀키 없이는 접근 불가
  const expected = normalizeEnvValue(
    process.env.CLOUDFLARE_DEBUG_SECRET ?? "",
  );
  const provided = normalizeEnvValue(
    request.headers.get("x-debug-secret") ?? "",
  );
  if (!expected || !provided || expected !== provided) {
    return unauthorized();
  }

  const apiToken = normalizeEnvValue(process.env.CLOUDFLARE_API_TOKEN ?? "");
  const accountId = normalizeEnvValue(process.env.CLOUDFLARE_ACCOUNT_ID ?? "");

  const env = {
    hasApiToken: Boolean(apiToken),
    hasAccountId: Boolean(accountId),
    accountIdLooksValidHex32: /^[a-f0-9]{32}$/i.test(accountId),
  };

  if (!env.hasApiToken || !env.hasAccountId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Cloudflare 환경변수가 비어 있습니다. CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID 를 확인해 주세요.",
        env,
      },
      { status: 500 },
    );
  }

  const results: Record<string, unknown> = {};

  // 0) 토큰 유효성/정책 확인 (권한 스코프 확인용)
  {
    const url = "https://api.cloudflare.com/client/v4/user/tokens/verify";
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    const json = await safeJson(res);
    results.tokenVerify = {
      url,
      status: res.status,
      statusText: res.statusText,
      success: json?.success ?? null,
      errors: json?.errors ?? null,
      messages: json?.messages ?? null,
      result: json?.result ?? null,
    };
  }

  // 1) 계정 존재/권한 확인 (권한이 없으면 403/401이 나올 수 있음)
  {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    const json = await safeJson(res);
    results.accountCheck = {
      url,
      status: res.status,
      statusText: res.statusText,
      success: json?.success ?? null,
      errors: json?.errors ?? null,
      messages: json?.messages ?? null,
    };
  }

  // 2) 실제로 사용 중인 엔드포인트 확인 (Gateway rules)
  {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/gateway/rules`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    const json = await safeJson(res);
    results.gatewayRulesList = {
      url,
      status: res.status,
      statusText: res.statusText,
      success: json?.success ?? null,
      errors: json?.errors ?? null,
      messages: json?.messages ?? null,
    };
  }

  return NextResponse.json(
    {
      ok: true,
      env,
      results,
      next:
        "이 JSON을 그대로 복사해서 보내주면, 토큰 권한 스코프(verify), 계정 접근 권한, Gateway 규칙 접근/생성 권한을 한 번에 진단할 수 있어요.",
    },
    { status: 200 },
  );
}

