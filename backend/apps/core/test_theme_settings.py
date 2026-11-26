from django.test import SimpleTestCase

from apps.core.models import UserSettings
from apps.core.serializers import SettingsSerializer


class ThemeSettingsTests(SimpleTestCase):
    def test_all_six_palettes_accept_every_appearance(self):
        self.assertEqual(len(UserSettings.Palette.values), 6)
        for palette in UserSettings.Palette.values:
            for theme in UserSettings.Theme.values:
                with self.subTest(palette=palette, theme=theme):
                    serializer = SettingsSerializer(data={"palette": palette, "theme": theme}, partial=True)
                    self.assertTrue(serializer.is_valid(), serializer.errors)
                    self.assertEqual(serializer.validated_data["palette"], palette)
                    self.assertEqual(serializer.validated_data["theme"], theme)

    def test_retired_and_unknown_palettes_are_rejected(self):
        for palette in ("toojibee", "classic", "unknown"):
            serializer = SettingsSerializer(data={"palette": palette}, partial=True)
            self.assertFalse(serializer.is_valid())
            self.assertIn("palette", serializer.errors)

    def test_default_is_tangerine_with_system_appearance(self):
        settings = UserSettings()
        self.assertEqual(settings.palette, "sustainable-tangerine")
        self.assertEqual(settings.theme, "system")
