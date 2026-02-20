from yido_automation import WorkflowEngine


def test_run_dry_run() -> None:
    plan = {
        "tasks": [
            {
                "id": "task-1",
                "title": "자동화 설계",
                "automation_hint": "script-or-agent",
            }
        ]
    }

    engine = WorkflowEngine(dry_run=True)
    results = engine.run(plan)

    assert len(results) == 1
    assert results[0].status == "simulated"
