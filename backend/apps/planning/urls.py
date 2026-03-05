from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import TimeBlockViewSet, ToBuyItemViewSet, TodoItemViewSet, ToBuyReservationViewSet

router = DefaultRouter()
router.register(r"to-buy-items", ToBuyItemViewSet, basename="to-buy-item")
router.register(r"todos", TodoItemViewSet, basename="todo-item")
router.register(r"reservations", ToBuyReservationViewSet, basename="reservation")
router.register(r"time-blocks", TimeBlockViewSet, basename="time-block")

urlpatterns = [
    path("", include(router.urls)),
]
