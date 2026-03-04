from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase


class ProjectSectionsApiTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username="project_sections_user",
            email="project_sections_user@example.com",
            password="StrongPass123!",
        )
        self.client.force_authenticate(user=self.user)

    def test_create_project_with_sections(self):
        response = self.client.post(
            "/api/v1/projects/",
            {
                "name": "Apartment Setup",
                "sections": [
                    {
                        "id": "living-room",
                        "name": "Living Room",
                        "checklist": [
                            {"id": "s1", "title": "Buy sofa", "status": "NOT_STARTED"},
                        ],
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("sections", response.data)
        self.assertEqual(len(response.data["sections"]), 1)
        self.assertEqual(response.data["sections"][0]["name"], "Living Room")

    def test_patch_project_sections(self):
        create_response = self.client.post("/api/v1/projects/", {"name": "Kid Room"}, format="json")
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        project_id = create_response.data["id"]

        patch_response = self.client.patch(
            f"/api/v1/projects/{project_id}/",
            {
                "sections": [
                    {
                        "id": "nursery",
                        "name": "Nursery",
                        "checklist": [
                            {"id": "n1", "title": "Install crib", "status": "IN_PROGRESS"},
                            {"id": "n2", "title": "Setup monitor", "status": "NOT_STARTED"},
                        ],
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(patch_response.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_response.data["sections"][0]["name"], "Nursery")
        self.assertEqual(len(patch_response.data["sections"][0]["checklist"]), 2)

    def test_archived_list_and_restore_project(self):
        create_response = self.client.post("/api/v1/projects/", {"name": "Archive Project"}, format="json")
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        project_id = create_response.data["id"]

        delete_response = self.client.delete(f"/api/v1/projects/{project_id}/")
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)

        active_list = self.client.get("/api/v1/projects/")
        self.assertEqual(active_list.status_code, status.HTTP_200_OK)
        self.assertEqual(active_list.data["count"], 0)

        archived_list = self.client.get("/api/v1/projects/?archived=true")
        self.assertEqual(archived_list.status_code, status.HTTP_200_OK)
        self.assertEqual(archived_list.data["count"], 1)

        restore_response = self.client.post(f"/api/v1/projects/{project_id}/restore/")
        self.assertEqual(restore_response.status_code, status.HTTP_200_OK)

        active_list_after = self.client.get("/api/v1/projects/")
        self.assertEqual(active_list_after.status_code, status.HTTP_200_OK)
        self.assertEqual(active_list_after.data["count"], 1)
