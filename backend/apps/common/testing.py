"""Test helpers: every test touches several module databases."""
from rest_framework.test import APIClient, APITestCase

PASSWORD = "Zxcv-1234-strong"


class ApiTestCase(APITestCase):
    databases = "__all__"

    def register(self, email="user@example.com", first_name="Sara", **extra):
        client = APIClient()
        body = {
            "email": email, "password": PASSWORD, "first_name": first_name,
            "username": ("u_" + email.split("@")[0].replace("-", "_"))[:30], "gender": "male", "birth_date": "1995-05-20", **extra,
        }
        response = client.post("/api/v1/auth/register", body, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        tokens = response.json()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access_token']}")
        client.tokens = tokens
        return client

    def set_gender(self, client, gender):
        version = client.get("/api/v1/me/profile").json()["version"]
        response = client.patch("/api/v1/me/profile", {"gender": gender, "version": version}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
