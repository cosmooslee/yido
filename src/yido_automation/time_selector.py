from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, Any


class MouseLike(Protocol):
    def click(self, x: float, y: float) -> Any: ...


class LocatorLike(Protocol):
    def first(self) -> "LocatorLike": ...

    def click(self) -> Any: ...

    def count(self) -> int: ...

    def scroll_into_view_if_needed(self) -> Any: ...

    def bounding_box(self) -> dict[str, float] | None: ...

    def locator(self, selector: str) -> "LocatorLike": ...


class PageLike(Protocol):
    mouse: MouseLike

    def locator(self, selector: str) -> LocatorLike: ...

    def get_by_role(self, role: str, name: str) -> LocatorLike: ...

    def wait_for_timeout(self, timeout: int) -> Any: ...

    def route(self, pattern: str, handler: Any) -> Any: ...


@dataclass
class TimeSelectionConfig:
    pickup_trigger_selector: str
    dropoff_trigger_selector: str
    pickup_time: str
    dropoff_time: str
    menu_option_selector: str = '[role="option"]'


class FastTimeSelector:
    """Fast and layout-shift-safe selector for pickup/dropoff time UIs."""

    def __init__(self, page: PageLike) -> None:
        self.page = page

    def enable_high_speed_mode(self) -> None:
        """Abort heavy assets to keep UI automation as fast as possible."""

        def _handler(route: Any) -> None:
            req = route.request
            if req.resource_type in {"image", "media", "font"}:
                route.abort()
            else:
                route.continue_()

        self.page.route("**/*", _handler)

    def select_pickup_and_dropoff(self, config: TimeSelectionConfig) -> None:
        self._click_trigger(config.pickup_trigger_selector)
        self._select_time(config.pickup_time, config.menu_option_selector)

        # Selecting pickup can auto-scroll/reflow the page. Reacquire and click
        # dropoff based on current viewport coordinates to prevent misclicks.
        self._stable_mouse_click(config.dropoff_trigger_selector)
        self._select_time(config.dropoff_time, config.menu_option_selector)

    def _click_trigger(self, selector: str) -> None:
        trigger = self.page.locator(selector).first()
        trigger.scroll_into_view_if_needed()
        trigger.click()

    def _stable_mouse_click(self, selector: str) -> None:
        target = self.page.locator(selector).first()
        target.scroll_into_view_if_needed()

        # Small wait allows browser to settle after potential auto-scroll.
        self.page.wait_for_timeout(30)

        bbox = target.bounding_box()
        if not bbox:
            target.click()
            return

        x = bbox["x"] + bbox["width"] / 2
        y = bbox["y"] + bbox["height"] / 2
        self.page.mouse.click(x, y)

    def _select_time(self, target_time: str, option_selector: str) -> None:
        by_role = self.page.get_by_role("option", name=target_time)
        if by_role.count() > 0:
            by_role.first().click()
            return

        by_css = self.page.locator(option_selector).locator(f":text-is('{target_time}')")
        if by_css.count() == 0:
            raise ValueError(f"시간 옵션을 찾지 못했습니다: {target_time}")

        by_css.first().click()
