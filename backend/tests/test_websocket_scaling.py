from unittest.mock import AsyncMock

import pytest

from app.api.v1.endpoints.websocket import ConnectionManager


class FakeWebSocket:
    def __init__(self):
        self.accepted = False
        self.messages = []

    async def accept(self):
        self.accepted = True

    async def send_json(self, message):
        self.messages.append(message)


@pytest.mark.asyncio
async def test_multiple_connections_for_one_user_are_preserved():
    manager = ConnectionManager()
    manager.start = AsyncMock(return_value=False)
    first = FakeWebSocket()
    second = FakeWebSocket()

    await manager.connect(7, first)
    await manager.connect(7, second)
    await manager.send_to_user(7, {"type": "test"})

    assert first.accepted and second.accepted
    assert first.messages[-1] == {"type": "test"}
    assert second.messages[-1] == {"type": "test"}

    await manager.disconnect(7, first)
    assert await manager.is_online(7)
    await manager.send_to_user(7, {"type": "still-online"})
    assert second.messages[-1] == {"type": "still-online"}


@pytest.mark.asyncio
async def test_targeted_delivery_does_not_leak_to_other_users():
    manager = ConnectionManager()
    manager.start = AsyncMock(return_value=False)
    target = FakeWebSocket()
    other = FakeWebSocket()
    await manager.connect(3, target)
    await manager.connect(4, other)
    target.messages.clear()
    other.messages.clear()

    await manager.send_to_user(3, {"type": "private"})

    assert target.messages == [{"type": "private"}]
    assert other.messages == []
