from yido_automation import ConversationPlanner


def test_build_plan_extracts_tasks() -> None:
    planner = ConversationPlanner()
    text = "이 대화를 분석해서 자동화 워크플로우를 만들어줘. API 연동도 해줘."

    plan = planner.build_plan(goal="자동화", conversation_text=text)

    assert plan["goal"] == "자동화"
    assert len(plan["tasks"]) >= 2
    assert any(task["category"] == "integration" for task in plan["tasks"])


def test_build_plan_fallback_when_no_action() -> None:
    planner = ConversationPlanner()
    plan = planner.build_plan(goal="정리", conversation_text="안녕하세요")

    assert len(plan["tasks"]) == 1
    assert plan["tasks"][0]["title"] == "요구사항 구체화"
