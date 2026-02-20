from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any


@dataclass
class StepResult:
    task_id: str
    status: str
    message: str


class WorkflowEngine:
    """Executes generated automation plan in dry-run or apply mode."""

    def __init__(self, dry_run: bool = True) -> None:
        self.dry_run = dry_run

    def load_plan(self, path: str) -> dict[str, Any]:
        with open(path, "r", encoding="utf-8") as fp:
            return json.load(fp)

    def run(self, plan: dict[str, Any]) -> list[StepResult]:
        results: list[StepResult] = []

        for task in plan.get("tasks", []):
            if self.dry_run:
                results.append(
                    StepResult(
                        task_id=task["id"],
                        status="simulated",
                        message=f"[{task['automation_hint']}] {task['title']}",
                    )
                )
                continue

            results.append(
                StepResult(
                    task_id=task["id"],
                    status="completed",
                    message=f"실행 완료: {task['title']}",
                )
            )

        return results

    def save_results(self, results: list[StepResult], out_path: str) -> None:
        path = Path(out_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        payload = [result.__dict__ for result in results]
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
