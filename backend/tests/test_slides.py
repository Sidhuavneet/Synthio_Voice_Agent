import pytest

from synthio_backend.agent.slides import SlideController, SlideIndexError


class Recorder:
    def __init__(self) -> None:
        self.changes: list[int] = []

    async def __call__(self, index: int) -> None:
        self.changes.append(index)


async def test_go_to_and_next_notify_changes() -> None:
    recorder = Recorder()
    controller = SlideController(3, on_change=recorder)
    assert controller.index == 0
    assert await controller.next() == 1
    assert await controller.go_to(2) == 2
    assert controller.is_last
    assert recorder.changes == [1, 2]


async def test_go_to_same_index_does_not_notify() -> None:
    recorder = Recorder()
    controller = SlideController(3, on_change=recorder)
    await controller.go_to(0)
    assert recorder.changes == []


@pytest.mark.parametrize("index", [-1, 3])
async def test_go_to_out_of_range(index: int) -> None:
    controller = SlideController(3)
    with pytest.raises(SlideIndexError):
        await controller.go_to(index)
    assert controller.index == 0


async def test_next_at_end_raises() -> None:
    controller = SlideController(2)
    await controller.next()
    with pytest.raises(SlideIndexError, match="last slide"):
        await controller.next()


def test_requires_at_least_one_slide() -> None:
    with pytest.raises(ValueError, match="at least 1"):
        SlideController(0)
