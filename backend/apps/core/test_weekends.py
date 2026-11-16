from apps.common.testing import ApiTestCase


class WeekendPreferenceTests(ApiTestCase):
    def test_multiple_weekends_persist_and_do_not_change_week_start(self):
        client = self.register()
        before = client.get('/api/v1/me/settings').json()
        response = client.patch('/api/v1/me/settings', {
            'version': before['version'],
            'preferences': {'weekend_thursday': True, 'weekend_friday': True},
        }, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        after = client.get('/api/v1/me/settings').json()
        self.assertTrue(after['preferences']['weekend_thursday'])
        self.assertTrue(after['preferences']['weekend_friday'])
        self.assertFalse(after['preferences']['weekend_saturday'])
        self.assertEqual(after['week_start'], before['week_start'])
        response = client.patch('/api/v1/me/settings', {
            'version': after['version'], 'preferences': {'weekend_friday': False},
        }, format='json')
        self.assertTrue(response.json()['preferences']['weekend_thursday'])
        self.assertFalse(response.json()['preferences']['weekend_friday'])

    def test_weekend_preferences_are_boolean(self):
        client = self.register()
        before = client.get('/api/v1/me/settings').json()
        response = client.patch('/api/v1/me/settings', {
            'version': before['version'], 'preferences': {'weekend_friday': 'yes'},
        }, format='json')
        self.assertEqual(response.status_code, 400)
