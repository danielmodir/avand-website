import uuid

from apps.common.testing import ApiTestCase


class ReminderWindowTests(ApiTestCase):
    def setUp(self):
        self.client = self.register()

    def create(self, kind, **extra):
        return self.client.put(f'/api/v1/planning/{kind}/{uuid.uuid4()}', {
            'title': 'Window', 'start_date': '2026-11-16',
            'reminder_type': 'repeating', 'reminder_time': '08:00',
            'reminder_window_end': '18:00', 'reminder_every_minutes': 30,
            **extra,
        }, format='json')

    def test_windows_round_trip_for_all_activity_types(self):
        for kind in ['tasks', 'habits', 'events']:
            response = self.create(kind)
            self.assertEqual(response.status_code, 201, response.content)
            self.assertEqual(response.json()['reminder_every_minutes'], 30)
            self.assertTrue(response.json()['reminder_window_end'].startswith('18:00'))

    def test_invalid_intervals_and_equal_window_are_rejected(self):
        for extra in [{'reminder_every_minutes': 0}, {'reminder_every_minutes': -1},
                      {'reminder_every_minutes': 1441}, {'reminder_every_minutes': 1.5},
                      {'reminder_window_end': '08:00'}, {'reminder_window_end': '18:00:30'}]:
            self.assertEqual(self.create('events', **extra).status_code, 400)

    def test_overnight_and_legacy_repeating_reminders_remain_valid(self):
        self.assertEqual(self.create('events', reminder_time='22:00', reminder_window_end='02:00').status_code, 201)
        legacy = self.create('events', reminder_window_end=None, reminder_every_minutes=None, reminder_every_hours=2)
        self.assertEqual(legacy.status_code, 201, legacy.content)

    def test_removal_clears_window_and_update_preserves_single_activity(self):
        response = self.create('events')
        self.assertEqual(response.status_code, 201, response.content)
        row = response.json()
        changed = self.client.put(f"/api/v1/planning/events/{row['id']}", {
            'version': row['version'], 'reminder_type': 'none',
        }, format='json')
        self.assertEqual(changed.status_code, 200, changed.content)
        self.assertIsNone(changed.json()['reminder_window_end'])
        self.assertEqual(len(self.client.get('/api/v1/planning/sync').json()['events']), 1)
