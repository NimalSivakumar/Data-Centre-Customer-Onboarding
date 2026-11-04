from threading import Event
from unittest import TestCase
from unittest.mock import MagicMock, patch

from app.modules.session_events import service


class FakeThread:
    instances = []

    def __init__(self, **kwargs):
        self.target = kwargs["target"]
        self.alive = False
        self.joined = False
        self.instances.append(self)

    def start(self):
        self.alive = True

    def is_alive(self):
        return self.alive

    def join(self, timeout=None):
        self.joined = True
        self.alive = False


class SessionWorkerLifecycleTests(TestCase):
    def test_start_stop_start_restarts_once_without_real_threads_or_database(self):
        FakeThread.instances = []
        with patch.object(service, "Thread", FakeThread), patch.object(service, "SessionLocal") as database, patch.object(service, "_timeout_worker_stop", Event()):
            # Restore any new worker-handle global as well, without requiring it pre-fix.
            with patch.object(service, "_timeout_worker", None, create=True):
                service.start_session_timeout_worker()
                service.start_session_timeout_worker()
                self.assertEqual(len(FakeThread.instances), 1)
                service.stop_session_timeout_worker()
                self.assertTrue(service._timeout_worker_stop.is_set())
                service.start_session_timeout_worker()
                self.assertEqual(len(FakeThread.instances), 2)
                self.assertFalse(service._timeout_worker_stop.is_set())
                self.assertTrue(FakeThread.instances[0].joined)
                service.stop_session_timeout_worker()
                service.stop_session_timeout_worker()
                self.assertTrue(FakeThread.instances[1].joined)
                database.assert_not_called()

    def test_failed_thread_start_can_be_stopped_and_retried(self):
        unstarted = MagicMock()
        unstarted.start.side_effect = RuntimeError("Synthetic thread start failure")
        unstarted.join.side_effect = RuntimeError("cannot join thread before it is started")
        with patch.object(service, "Thread", return_value=unstarted), patch.object(service, "_timeout_worker", None), patch.object(service, "_timeout_worker_stop", Event()), patch.object(service, "SessionLocal") as database:
            with self.assertRaisesRegex(RuntimeError, "Synthetic thread start failure"):
                service.start_session_timeout_worker()
            service.stop_session_timeout_worker()
            unstarted.join.assert_not_called()
            unstarted.start.side_effect = None
            service.start_session_timeout_worker()
            self.assertEqual(unstarted.start.call_count, 2)
            database.assert_not_called()

    def test_stopping_worker_cannot_overlap_with_replacement(self):
        previous = MagicMock()
        previous.is_alive.return_value = True
        stop = Event()
        with patch.object(service, "_timeout_worker", previous), patch.object(service, "_timeout_worker_stop", stop), patch.object(service, "Thread") as thread, patch.object(service, "SessionLocal") as database:
            service.stop_session_timeout_worker()
            previous.join.assert_called_once_with(timeout=5)
            with self.assertRaisesRegex(RuntimeError, "still stopping"):
                service.start_session_timeout_worker()
            self.assertTrue(stop.is_set())
            thread.assert_not_called()
            previous.is_alive.return_value = False
            service.start_session_timeout_worker()
            self.assertFalse(stop.is_set())
            thread.assert_called_once()
            database.assert_not_called()
