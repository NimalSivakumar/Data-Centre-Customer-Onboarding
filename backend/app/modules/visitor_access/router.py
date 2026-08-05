from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db
from app.modules.requests.schemas import RequestResponse
from app.modules.requests.service import create_visitor_access_request
from app.modules.users.models import User
from app.modules.visitor_access.schemas import VisitorAccessCreate
from app.shared.exceptions import not_found

router = APIRouter(prefix="/visitor-access-requests", tags=["visitor access"])


@router.post("", response_model=RequestResponse)
def post_visitor_access_request(
    payload: VisitorAccessCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RequestResponse:
    try:
        request = create_visitor_access_request(db, payload, current_user)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        if str(exc) == "Company not found":
            raise not_found("Company not found") from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return RequestResponse.model_validate(request)
