from __future__ import annotations

import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
SRC = ROOT / 'src'
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from yido_automation import ConversationPlanner, WorkflowEngine


def _read_text(path: str | None) -> str:
    if not path:
        return ""
    return Path(path).read_text(encoding="utf-8")


def cmd_plan(args: argparse.Namespace) -> None:
    planner = ConversationPlanner()

    conversation_text = _read_text(args.conversation_file)
    if args.shared_url:
        try:
            fetched = planner.fetch_shared_conversation(args.shared_url)
            conversation_text = f"{conversation_text}\n{fetched}".strip()
        except RuntimeError as exc:
            print(f"[경고] {exc}")

    plan = planner.build_plan(goal=args.goal, conversation_text=conversation_text)
    planner.save_plan(plan, args.out)
    print(f"계획 생성 완료: {args.out} (tasks={len(plan['tasks'])})")


def cmd_run(args: argparse.Namespace) -> None:
    engine = WorkflowEngine(dry_run=args.dry_run)
    plan = engine.load_plan(args.plan)
    results = engine.run(plan)
    engine.save_results(results, args.out)
    print(f"실행 결과 저장: {args.out} (steps={len(results)})")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Conversation-to-automation CLI")
    sub = parser.add_subparsers(required=True)

    plan_parser = sub.add_parser("plan", help="대화/목표를 기반으로 자동화 계획 생성")
    plan_parser.add_argument("--goal", required=True, help="달성하려는 목표")
    plan_parser.add_argument("--conversation-file", help="대화 내용 텍스트 파일")
    plan_parser.add_argument("--shared-url", help="Gemini 공유 링크")
    plan_parser.add_argument("--out", default="artifacts/plan.json")
    plan_parser.set_defaults(func=cmd_plan)

    run_parser = sub.add_parser("run", help="생성된 계획 실행")
    run_parser.add_argument("--plan", required=True)
    run_parser.add_argument("--out", default="artifacts/run-results.json")
    run_parser.add_argument("--dry-run", action="store_true", help="실제 실행 없이 시뮬레이션")
    run_parser.set_defaults(func=cmd_run)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
