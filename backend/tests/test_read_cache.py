from types import SimpleNamespace

import redis

from app.utils import read_cache


class _Lock:
    def acquire(self):
        return True

    def release(self):
        return None


class _Pipeline:
    def __init__(self, client):
        self.client = client
        self.commands = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def incr(self, key):
        self.commands.append(("incr", key))
        return self

    def execute(self):
        results = []
        for command, key in self.commands:
            if command == "incr":
                current = int(self.client.values.get(key, "0")) + 1
                self.client.values[key] = str(current)
                results.append(current)
        return results


class _Redis:
    def __init__(self):
        self.values = {}

    def get(self, key):
        return self.values.get(key)

    def setex(self, key, _ttl, value):
        self.values[key] = value

    def lock(self, *_args, **_kwargs):
        return _Lock()

    def pipeline(self, **_kwargs):
        return _Pipeline(self)


def _user(user_id):
    return SimpleNamespace(id=user_id, role="admin", updated_at="2026-08-21T00:00:00Z")


def test_cached_read_reuses_result_within_user_scope(monkeypatch):
    client = _Redis()
    monkeypatch.setattr(read_cache, "_redis_client", lambda: client)
    calls = []

    @read_cache.cached_read("facilities", ttl_seconds=30)
    def endpoint(value, db=None, current_user=None):
        calls.append((value, current_user.id))
        return {"value": value, "user": current_user.id}

    assert endpoint("x", current_user=_user(1)) == {"value": "x", "user": 1}
    assert endpoint("x", current_user=_user(1)) == {"value": "x", "user": 1}
    assert calls == [("x", 1)]


def test_cached_read_never_crosses_user_scope(monkeypatch):
    client = _Redis()
    monkeypatch.setattr(read_cache, "_redis_client", lambda: client)
    calls = []

    @read_cache.cached_read("users")
    def endpoint(current_user=None):
        calls.append(current_user.id)
        return {"user": current_user.id}

    endpoint(current_user=_user(1))
    endpoint(current_user=_user(2))
    assert calls == [1, 2]


def test_namespace_invalidation_makes_old_entry_unreachable(monkeypatch):
    client = _Redis()
    monkeypatch.setattr(read_cache, "_redis_client", lambda: client)
    calls = []

    @read_cache.cached_read("equipment")
    def endpoint(current_user=None):
        calls.append(len(calls) + 1)
        return {"load": calls[-1]}

    assert endpoint(current_user=_user(1)) == {"load": 1}
    read_cache.invalidate_read_cache("equipment")
    assert endpoint(current_user=_user(1)) == {"load": 2}


def test_redis_outage_falls_through_to_loader(monkeypatch):
    class BrokenRedis:
        def get(self, _key):
            raise redis.ConnectionError("offline")

    monkeypatch.setattr(read_cache, "_redis_client", lambda: BrokenRedis())
    calls = []

    @read_cache.cached_read("dashboard")
    def endpoint(current_user=None):
        calls.append(1)
        return {"live": True}

    assert endpoint(current_user=_user(1)) == {"live": True}
    assert calls == [1]


def test_mutation_namespace_mapping_is_targeted():
    assert read_cache.mutation_cache_namespaces("/api/v1/facilities/10") == (
        "facilities",
        "users",
        "equipment",
        "dashboard",
    )
    assert read_cache.mutation_cache_namespaces("/api/v1/billing/invoices/10/pay") == ("dashboard",)
    assert read_cache.mutation_cache_namespaces("/api/v1/chat/messages") == ()
