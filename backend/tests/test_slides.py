import pytest

from synthio_backend.agent.slides import SlideController, SlideIndexError


class Recorder:
    def __init__(self) -> None:
        self.changes: list[int] = []

    async def __call__(self, index: int) -> None:
        self.changes.append(index)


async def test_go_to_notifies_changes() -> None:
    recorder = Recorder()
    controller = SlideController(3, on_change=recorder)
    assert controller.index == 0
    assert await controller.go_to(1) == 1
    assert await controller.go_to(2) == 2
    assert recorder.changes == [1, 2]


async def test_go_to_same_index_does_not_notify() -> None:
    recorder = Recorder()
    controller = SlideController(3, on_change=recorder, start=2)
    assert controller.index == 2
    await controller.go_to(2)
    assert recorder.changes == []


@pytest.mark.parametrize("index", [-1, 3])
async def test_go_to_out_of_range(index: int) -> None:
    controller = SlideController(3)
    with pytest.raises(SlideIndexError):
        await controller.go_to(index)
    assert controller.index == 0


def test_rejects_invalid_start() -> None:
    with pytest.raises(SlideIndexError):
        SlideController(3, start=3)


def test_requires_at_least_one_slide() -> None:
    with pytest.raises(ValueError, match="at least 1"):
        SlideController(0)
