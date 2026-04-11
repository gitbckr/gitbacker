import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, require_admin
from app.db import get_db
from app.services import destination_service
from shared.models import User
from shared.schemas import DestinationCreate, DestinationRead, DestinationUpdate

router = APIRouter()


@router.post("", response_model=DestinationRead, status_code=status.HTTP_201_CREATED)
async def create_destination(
    body: DestinationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
) -> DestinationRead:
    return await destination_service.create_destination(db, user, body)


@router.get("", response_model=list[DestinationRead])
async def list_destinations(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[DestinationRead]:
    return await destination_service.list_destinations(db)


@router.get("/{destination_id}", response_model=DestinationRead)
async def get_destination(
    destination_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DestinationRead:
    return await destination_service.get_destination(db, str(destination_id))


@router.patch("/{destination_id}", response_model=DestinationRead)
async def update_destination(
    destination_id: uuid.UUID,
    body: DestinationUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
) -> DestinationRead:
    return await destination_service.update_destination(db, str(destination_id), body)


@router.delete("/{destination_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_destination(
    destination_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
) -> None:
    await destination_service.delete_destination(db, str(destination_id))
