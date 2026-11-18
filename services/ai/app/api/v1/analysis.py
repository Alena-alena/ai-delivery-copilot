from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.analysis.requirements import extract_requirements
from app.analysis.schemas import RequirementsIn, RequirementsOut
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
