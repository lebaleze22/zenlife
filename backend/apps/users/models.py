from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    email = models.EmailField(unique=True)
    display_name = models.CharField(max_length=120, blank=True)
    locale = models.CharField(max_length=8, default="en")
    base_currency = models.CharField(max_length=3, default="XAF")

    REQUIRED_FIELDS = ["email"]
