from synthio_backend.agent.session_log import SessionLog


class FakeClock:
    def __init__(self, now: float = 100.0) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now


def test_slide_seconds_accumulate_including_current_slide() -> None:
    clock = FakeClock()
    log = SessionLog(clock=clock)
    clock.now += 10
    log.record_slide(1)
    clock.now += 5
    log.record_slide(0)
    clock.now += 3
    assert log.slide_seconds() == {0: 13.0, 1: 5.0}
    assert log.duration_seconds() == 18.0


def test_route_latest_turn_updates_only_the_last_turn() -> None:
    log = SessionLog()
    log.route_latest_turn(4)  # no turns yet: ignored
    log.record_user_turn("first", 0)
    log.record_user_turn("second", 1)
    log.route_latest_turn(4)
    assert [(t.text, t.slide_index) for t in log.turns] == [("first", 0), ("second", 4)]


def test_add_flag_builds_contract_event() -> None:
    log = SessionLog(wall_clock=lambda: 1_700_000_000.1234)
    flag = log.add_flag("off_label", "can I double the dose?", 2)
    assert log.flags == (flag,)
    assert flag.id.startswith("flag_")
    assert flag.model_dump(by_alias=True) == {
        "type": "compliance_flag",
        "id": flag.id,
        "category": "off_label",
        "question": "can I double the dose?",
        "slideIndex": 2,
        "timestamp": 1_700_000_000_123,
    }
