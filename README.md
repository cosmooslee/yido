# yido

상차/하차 시간 선택 자동화에서 발생하던 **스크롤 후 클릭 위치 오차**를 줄이고,
전체 실행 속도를 높이기 위한 Python 유틸리티를 제공합니다.

## 핵심 기능

- `FastTimeSelector`
  - 상차 시간 선택 후 페이지가 자동 스크롤되어도,
    하차 시간 입력을 **현재 좌표 재계산 후 마우스 클릭**으로 안정적으로 선택
  - 옵션은 역할 기반(`role=option`) 우선 선택, 실패 시 CSS 텍스트 fallback
- `enable_high_speed_mode()`
  - 이미지/미디어/폰트 요청을 차단해 자동화 속도 최적화

## 예시

```python
from yido_automation.time_selector import FastTimeSelector, TimeSelectionConfig

selector = FastTimeSelector(page)
selector.enable_high_speed_mode()
selector.select_pickup_and_dropoff(
    TimeSelectionConfig(
        pickup_trigger_selector="#pickup-time",
        dropoff_trigger_selector="#dropoff-time",
        pickup_time="09:00",
        dropoff_time="10:00",
    )
)
```

## 테스트

```bash
python -m pytest -q
```
