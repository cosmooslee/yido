export const runtime = "nodejs";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

type BlockRequestBody = {
  urls: string[];
};

function normalizeEnvValue(value: string) {
  // 1) BOM 제거 2) trim 3) 양끝 따옴표 제거 4) 토큰에 섞인 비가시 문자 제거
  const noBom = value.replace(/^\uFEFF/, "");
  const trimmed = noBom.trim();
  const unquoted = trimmed.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  return unquoted.replace(/[^\x21-\x7E]/g, "");
}

function loadCloudflareEnv() {
  const apiTokenRaw = process.env.CLOUDFLARE_API_TOKEN ?? "";
  const accountIdRaw = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";

  const apiToken = normalizeEnvValue(apiTokenRaw);
  const accountId = normalizeEnvValue(accountIdRaw);

  return { apiToken, accountId };
}

function escapeRegexLiteral(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeCfStringLiteral(input: string) {
  return input.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildTrafficExpression(urls: string[]): string {
  const parts = urls
    .map((raw) => raw.trim())
    .filter((raw) => raw.length > 0)
    .map((raw) => {
      let hostname = raw;
      let pathAndQuery = "";
      try {
        const u = new URL(raw);
        hostname = u.hostname;
        pathAndQuery = `${u.pathname}${u.search}`;
      } catch {
        // 원래 문자열을 그대로 사용
      }

      const safeHost = escapeCfStringLiteral(hostname);

      // Cloudflare Gateway HTTP 표현식에서 "contains"는 지원되지 않아 "matches" / "in"을 사용
      // host는 정확히 매칭하고, path(있다면)는 부분 매칭(정규식)으로 처리
      if (pathAndQuery && pathAndQuery !== "/") {
        const safePathRegex = escapeCfStringLiteral(
          `.*${escapeRegexLiteral(pathAndQuery)}.*`,
        );
        return `(http.request.host in {"${safeHost}"} and http.request.uri matches "${safePathRegex}")`;
      }

      return `(http.request.host in {"${safeHost}"})`;
    });

  if (parts.length === 0) {
    return "";
  }

  // 여러 URL을 하나의 HTTP Gateway 규칙에서 OR 조건으로 묶기
  return parts.join(" or ");
}

export async function POST(request: Request) {
  const { apiToken, accountId } = loadCloudflareEnv();

  if (!apiToken || !accountId) {
    return NextResponse.json(
      {
        error:
          "Cloudflare 환경변수가 설정되어 있지 않습니다. CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID 를 .env.local 에 설정해 주세요.",
      },
      { status: 500 },
    );
  }

  if (!/^[a-f0-9]{32}$/i.test(accountId)) {
    return NextResponse.json(
      {
        error:
          "CLOUDFLARE_ACCOUNT_ID 형식이 올바르지 않습니다. (32자리 hex 문자열이어야 합니다)",
        debug: {
          accountIdLength: accountId.length,
          accountIdPreview: `${accountId.slice(0, 6)}...${accountId.slice(-4)}`,
        },
      },
      { status: 500 },
    );
  }

  // 실제 규칙 생성 전에 토큰 자체 유효성부터 확인해서 원인을 빠르게 노출
  const verifyRes = await fetch(
    "https://api.cloudflare.com/client/v4/user/tokens/verify",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    },
  );
  const verifyData = await verifyRes.json().catch(() => null);
  if (!verifyRes.ok || verifyData?.success === false) {
    return NextResponse.json(
      {
        error:
          "Cloudflare API 토큰 검증에 실패했습니다. 토큰 값이 잘못되었거나 만료/폐기되었을 가능성이 큽니다.",
        details: verifyData,
        debug: {
          endpoint: "https://api.cloudflare.com/client/v4/user/tokens/verify",
          status: verifyRes.status,
          statusText: verifyRes.statusText,
        },
      },
      { status: 500 },
    );
  }

  let body: BlockRequestBody;
  try {
    body = (await request.json()) as BlockRequestBody;
  } catch {
    return NextResponse.json(
      { error: "유효한 JSON 본문이 필요합니다." },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.urls) || body.urls.length === 0) {
    return NextResponse.json(
      { error: "차단할 URL 목록(urls)이 필요합니다." },
      { status: 400 },
    );
  }

  const traffic = buildTrafficExpression(body.urls);

  if (!traffic) {
    return NextResponse.json(
      { error: "유효한 URL이 없어 Gateway 규칙을 만들 수 없습니다." },
      { status: 400 },
    );
  }

  const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/gateway/rules`;

  const payload = {
    action: "block",
    name: "Focus Block - HTTP URL & VPN/Proxy",
    description:
      "Focus Block 앱에서 생성한 4시간 집중 모드용 차단 규칙입니다.",
    enabled: true,
    filters: ["http"],
    traffic,
  };

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || (data && data.success === false)) {
    if (res.status === 401) {
      return NextResponse.json(
        {
          error:
            "Cloudflare API 토큰이 유효하지 않거나 만료되었습니다. (401 Unauthorized)",
          details: data,
          debug: {
            endpoint: apiUrl,
            status: res.status,
            statusText: res.statusText,
          },
        },
        { status: 500 },
      );
    }

    if (res.status === 403) {
      return NextResponse.json(
        {
          error:
            "Cloudflare API 토큰 권한이 부족합니다. Gateway 규칙 생성(EDIT) 권한이 필요합니다. (403 Forbidden)",
          details: data,
          debug: {
            endpoint: apiUrl,
            status: res.status,
            statusText: res.statusText,
          },
        },
        { status: 500 },
      );
    }

    const message =
      (data && data.errors && data.errors[0]?.message) ||
      "Cloudflare Gateway 규칙 생성에 실패했습니다.";
    return NextResponse.json(
      {
        error: message,
        details: data,
        debug: {
          endpoint: apiUrl,
          accountIdPreview: `${accountId.slice(0, 6)}...${accountId.slice(-4)}`,
          status: res.status,
          statusText: res.statusText,
        },
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      result: data?.result ?? null,
    },
    { status: 200 },
  );
}

