from rest_framework.decorators import api_view
from rest_framework.response import Response
from .nic_handler import search_tender


@api_view(["POST"])
def search_tender_view(request):
    website = request.data.get("website")
    reference_no = request.data.get("reference_no")
    if not website or not reference_no:
        return Response(
            {"error": "website and reference_no are required"},
            status=400,
        )
    result = search_tender(website, reference_no)
    return Response(result)
