from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.analysis.gaps import find_gaps
from app.analysis.requirements import extract_requirements
from app.analysis.schemas import GapsIn, GapsOut, RequirementsIn, RequirementsOut
from app.llm.client import LLMClient

router = APIRouter(prefix="/analysis")


def get_llm(request: Request) -> LLMClient:
    return request.app.state.llm


@router.post("/requirements")
async def requirements(
    body: RequirementsIn, request: Request, llm: Annotated[LLMClient, Depends(get_llm)]
) -> RequirementsOut:
    """Requirements from the given documents. Stateless: NestJS sends the segments and stores the result."""
    return await extract_requirements(llm, body.documents, request_id=request.state.request_id)


@router.post("/gaps")
async def gaps(
    body: GapsIn, request: Request, llm: Annotated[LLMClient, Depends(get_llm)]
) -> GapsOut:
    """Gaps in the given documents, given the requirements already found. Stateless, like /requirements."""
    return await find_gaps(llm, body.documents, body.requirements, request_id=request.state.request_id)
