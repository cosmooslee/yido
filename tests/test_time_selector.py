from __future__ import annotations

from dataclasses import dataclass

from yido_automation.time_selector import FastTimeSelector, TimeSelectionConfig


class FakeMouse:
    def __init__(self) -> None:
        self.clicks: list[tuple[float, float]] = []

    def click(self, x: float, y: float) -> None:
        self.clicks.append((x, y))


@dataclass
class FakeLocator:
    page: "FakePage"
    selector: str

    def first(self) -> "FakeLocator":
        return self

    def click(self) -> None:
        self.page.clicked.append(self.selector)

    def count(self) -> int:
        return self.page.counts.get(self.selector, 0)

    def scroll_into_view_if_needed(self) -> None:
        self.page.scrolled.append(self.selector)

    def bounding_box(self) -> dict[str, float] | None:
        return self.page.bounding_boxes.get(self.selector)

    def locator(self, selector: str) -> "FakeLocator":
        return FakeLocator(self.page, f"{self.selector}>>{selector}")


class FakePage:
    def __init__(self) -> None:
        self.mouse = FakeMouse()
        self.clicked: list[str] = []
        self.scrolled: list[str] = []
        self.waits: list[int] = []
        self.routes: list[str] = []
        self.counts: dict[str, int] = {}
        self.bounding_boxes: dict[str, dict[str, float]] = {}

    def locator(self, selector: str) -> FakeLocator:
        return FakeLocator(self, selector)

    def get_by_role(self, role: str, name: str) -> FakeLocator:
        return FakeLocator(self, f"role={role}[name={name}]")

    def wait_for_timeout(self, timeout: int) -> None:
        self.waits.append(timeout)

    def route(self, pattern: str, handler):
        self.routes.append(pattern)


def test_select_pickup_and_dropoff_uses_stable_mouse_click() -> None:
    page = FakePage()
    page.counts["role=option[name=09:00]"] = 1
    page.counts["role=option[name=10:00]"] = 1
    page.bounding_boxes["#dropoff"] = {"x": 100, "y": 220, "width": 80, "height": 40}

    selector = FastTimeSelector(page)
    selector.select_pickup_and_dropoff(
        TimeSelectionConfig(
            pickup_trigger_selector="#pickup",
            dropoff_trigger_selector="#dropoff",
            pickup_time="09:00",
            dropoff_time="10:00",
        )
    )

    assert "#pickup" in page.clicked
    assert "role=option[name=09:00]" in page.clicked
    assert page.waits == [30]
    assert page.mouse.clicks == [(140.0, 240.0)]
    assert "role=option[name=10:00]" in page.clicked


def test_enable_high_speed_mode_registers_route() -> None:
    page = FakePage()
    selector = FastTimeSelector(page)
    selector.enable_high_speed_mode()

    assert page.routes == ["**/*"]
