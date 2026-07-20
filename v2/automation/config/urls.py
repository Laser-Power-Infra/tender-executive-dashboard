from django.urls import path
from tender_search.views import search_tender_view

urlpatterns = [
    path("api/search-tender/", search_tender_view),
]
