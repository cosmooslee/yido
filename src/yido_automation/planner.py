from __future__ import annotations

from dataclasses import dataclass, asdict
import json
import re
from typing import Iterable
from urllib import request, error


ACTION_KEYWORDS = [
    "자동화",
    "만들",
    "구현",
    "정리",
    "분석",
    "연동",
    "배포",
    "테스트",
    "알림",
    "스케줄",
    "workflow",
    "automation",
]


@dataclass
class PlannedTask:
    id: str
    title: str
    detail: str
    category: str
    automation_hint: str


class ConversationPlanner:
    """Builds executable automation plans from conversation context and goals."""

    def __init__(self) -> None:
        self._request_pattern = re.compile(r"[^.!?\n]+")

    def fetch_shared_conversation(self, url: str, timeout: float = 10.0) -> str:
        """Try to fetch a shared chat URL.

        Returns a plain text body when possible. If the URL is blocked or inaccessible,
        an informative RuntimeError is raised so callers can fall back to pasted text.
        """
        try:
            with request.urlopen(url, timeout=timeout) as res:
                payload = res.read().decode("utf-8", errors="replace")
        except (error.HTTPError, error.URLError, TimeoutError) as exc:
            raise RuntimeError(
                f"공유 링크를 직접 읽지 못했습니다: {exc}. 대화 텍스트를 파일로 붙여 넣어 주세요."
            ) from exc

        stripped = re.sub(r"<[^>]+>", " ", payload)
        return re.sub(r"\s+", " ", stripped).strip()

    def build_plan(self, goal: str, conversation_text: str) -> dict:
        tasks = list(self._extract_tasks(conversation_text))

        if not tasks:
            tasks = [
                PlannedTask(
                    id="task-1",
                    title="요구사항 구체화",
                    detail="대화에서 자동화 대상과 성공 기준을 명시적으로 추출",
                    category="analysis",
                    automation_hint="manual-review",
                )
            ]

        return {
            "goal": goal.strip(),
            "summary": self._summarize(goal, conversation_text),
            "tasks": [asdict(task) for task in tasks],
        }

    def save_plan(self, plan: dict, out_path: str) -> None:
        with open(out_path, "w", encoding="utf-8") as fp:
            json.dump(plan, fp, ensure_ascii=False, indent=2)

    def _extract_tasks(self, text: str) -> Iterable[PlannedTask]:
        sentences = [s.strip() for s in self._request_pattern.findall(text) if s.strip()]
        matched = [s for s in sentences if self._contains_action_keyword(s)]

        for i, sentence in enumerate(matched, start=1):
            category = self._category(sentence)
            yield PlannedTask(
                id=f"task-{i}",
                title=self._to_title(sentence),
                detail=sentence,
                category=category,
                automation_hint=self._hint(category, sentence),
            )

    @staticmethod
    def _contains_action_keyword(sentence: str) -> bool:
        lower = sentence.lower()
        return any(k in lower for k in ACTION_KEYWORDS)

    @staticmethod
    def _to_title(sentence: str, max_length: int = 42) -> str:
        compact = re.sub(r"\s+", " ", sentence)
        return compact if len(compact) <= max_length else compact[: max_length - 1] + "…"

    @staticmethod
    def _category(sentence: str) -> str:
        s = sentence.lower()
        if any(k in s for k in ["분석", "정리", "요약"]):
            return "analysis"
        if any(k in s for k in ["연동", "api", "통합"]):
            return "integration"
        if any(k in s for k in ["테스트", "검증"]):
            return "testing"
        if any(k in s for k in ["배포", "릴리즈"]):
            return "release"
        return "implementation"

    @staticmethod
    def _hint(category: str, sentence: str) -> str:
        if "알림" in sentence:
            return "webhook-notification"
        if "매일" in sentence or "스케줄" in sentence:
            return "cron-schedule"
        return {
            "analysis": "llm-summarize",
            "integration": "api-connector",
            "testing": "test-runner",
            "release": "deploy-pipeline",
            "implementation": "script-or-agent",
        }[category]

    @staticmethod
    def _summarize(goal: str, conversation_text: str) -> str:
        first_line = conversation_text.strip().splitlines()[0] if conversation_text.strip() else ""
        return f"목표: {goal.strip()} | 대화 핵심: {first_line[:100]}"
