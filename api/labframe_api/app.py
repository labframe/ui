"""FastAPI application exposing LabFrame core services."""

from __future__ import annotations

import sys
from datetime import date
from functools import lru_cache
from pathlib import Path
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .config import resolve_db_path

CORE_SRC = Path(__file__).resolve().parents[3] / "core" / "src"
if str(CORE_SRC) not in sys.path:
    sys.path.insert(0, str(CORE_SRC))

from labframe_core.app.bootstrap import Services, bootstrap  # noqa: E402
from labframe_core.app.dto import (  # noqa: E402
    ParameterDefinitionItem,
    SampleParameterValueItem,
    SampleParameterValuePayload,
)
from labframe_core.domain.exceptions import DomainError, UnknownSampleError  # noqa: E402


class CreateSamplePayload(BaseModel):
    """Request body for creating a sample."""

    prepared_on: date = Field(description="Date the sample was prepared.")
    author_name: str | None = Field(default=None, description="Full name of the preparer.")
    template_sample_id: int | None = Field(
        default=None,
        description="Optional sample to copy parameters from.",
    )
    copy_parameters: bool = Field(
        default=False,
        description="Whether to copy parameters from the template sample.",
    )


class RecordParametersPayload(BaseModel):
    """Request body for recording parameter values for a sample."""

    parameters: tuple[SampleParameterValuePayload, ...] = Field(default_factory=tuple)


def create_app() -> FastAPI:
    """Instantiate and configure the FastAPI application."""
    app = FastAPI(title="LabFrame API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @lru_cache(maxsize=1)
    def _services() -> Services:
        return bootstrap(resolve_db_path())

    def get_services() -> Services:
        return _services()

    @app.get("/health", tags=["system"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/samples", tags=["samples"])
    def list_samples(
        include_deleted: bool = Query(False, description="Include soft-deleted samples."),
        services: Services = Depends(get_services),
    ) -> list[dict[str, object]]:
        summaries = services.samples.list_samples(include_deleted=include_deleted)
        return [summary.model_dump() for summary in summaries]

    @app.get("/samples/{sample_id}", tags=["samples"])
    def get_sample(
        sample_id: int,
        services: Services = Depends(get_services),
    ) -> dict[str, object]:
        summaries = services.samples.list_samples(include_deleted=True)
        for summary in summaries:
            if summary.sample_id == sample_id:
                return summary.model_dump()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")

    @app.post("/samples", tags=["samples"], status_code=status.HTTP_201_CREATED)
    def create_sample(
        payload: CreateSamplePayload,
        services: Services = Depends(get_services),
    ) -> dict[str, object]:
        try:
            created = services.samples.create_sample(
                prepared_on=payload.prepared_on,
                author_name=payload.author_name,
            )
        except DomainError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

        warnings: list[str] = []
        copied = 0
        if payload.copy_parameters and payload.template_sample_id is not None:
            try:
                result = services.samples.copy_parameters_from_sample(
                    source_sample_id=payload.template_sample_id,
                    target_sample_id=created.sample_id,
                )
            except DomainError as exc:
                warnings.append(str(exc))
            else:
                copied = result.applied
                created = result.sample
                warnings.extend(result.warnings)

        return {
            "sample": created.model_dump(),
            "copied_parameters": copied,
            "warnings": warnings,
        }

    @app.post("/samples/{sample_id}/parameters", tags=["samples"])
    def record_parameters(
        sample_id: int,
        payload: RecordParametersPayload,
        services: Services = Depends(get_services),
    ) -> dict[str, object]:
        assignments: tuple[SampleParameterValuePayload | dict[str, object], ...] = (
            payload.parameters
        )
        try:
            updated = services.samples.record_parameters(
                sample_id=sample_id,
                parameters=assignments,
            )
        except UnknownSampleError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        except DomainError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        return {"sample": updated.model_dump()}

    @app.get("/samples/{sample_id}/parameters", tags=["samples"])
    def list_sample_parameters(
        sample_id: int,
        services: Services = Depends(get_services),
    ) -> list[dict[str, object]]:
        try:
            values = services.samples.get_sample_parameter_values(sample_id)
        except UnknownSampleError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        return [value.model_dump() for value in values]

    @app.get("/parameters/definitions", tags=["parameters"])
    def list_parameter_definitions(
        services: Services = Depends(get_services),
    ) -> list[dict[str, object]]:
        definitions: tuple[ParameterDefinitionItem, ...] = (
            services.samples.list_parameter_definitions()
        )
        return [definition.model_dump() for definition in definitions]

    @app.get("/parameters/{parameter_name}/history", tags=["parameters"])
    def get_parameter_history(
        parameter_name: str,
        limit: int = Query(25, ge=1, le=200, description="Number of history entries to return."),
        services: Services = Depends(get_services),
    ) -> list[dict[str, object]]:
        values: tuple[SampleParameterValueItem, ...] = (
            services.samples.list_parameter_value_history(
                parameter_name,
                limit=limit,
            )
        )
        return [value.model_dump() for value in values]

    return app


app = create_app()
