from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    full_name: str
    email: str | None
    role_name: str
    permissions: list[str]
    branch_id: int | None
    branch_name: str | None = None
    is_active: bool
    last_login_at: datetime | None


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_.-]+$")
    full_name: str = Field(min_length=2, max_length=100)
    email: str | None = Field(default=None, max_length=200)
    password: str = Field(min_length=8, max_length=128)
    role_id: int
    branch_id: int | None = None


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=100)
    email: str | None = Field(default=None, max_length=200)
    password: str | None = Field(default=None, min_length=8, max_length=128)
    role_id: int | None = None
    branch_id: int | None = None
    is_active: bool | None = None
