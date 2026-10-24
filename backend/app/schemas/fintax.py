from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class LoginIn(BaseModel):
    identifier: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=256)


class ChangePasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=12, max_length=256)


class AccountCreateIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    role: Literal["staff", "client"]
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")
    initial_password: str | None = Field(default=None, min_length=12, max_length=256)
    email: str | None = Field(default=None, max_length=254)
    company_name: str | None = Field(default=None, max_length=200)
    client_number: str | None = Field(default=None, min_length=2, max_length=32, pattern=r"^[A-Za-z0-9-]+$")

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str | None) -> str | None:
        return value.lower() if value else None
