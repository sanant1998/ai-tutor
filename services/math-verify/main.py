"""Symbolic verification for the tutor.

lib/math/verify.ts is exact on rational arithmetic and deliberately silent on
everything else — it returns null for anything with a variable, a root or a
trig function rather than guessing. That is the right behaviour for Class 8
material, where almost every claim is arithmetic.

It stops being enough at Class 9 and 10, where the tutor writes things like
"x^2 - 5x + 6 = (x-2)(x-3)" and "the roots are 2 and 3". Those are exactly the
claims a model gets confidently wrong, and neither can be checked by evaluating
numbers.

So: a small service, one dependency that matters, three endpoints.

    uvicorn main:app --port 8000
    docker build -t paperpath-math-verify . && docker run -p 8000:8000 ...

WHY A SEPARATE SERVICE

SymPy is Python and the app is TypeScript. The alternatives are a JavaScript CAS
(none is close to SymPy for this) or shelling out to Python from Node (a process
spawn per tutor turn, and a sandbox problem). A service is the honest shape, and
it means the app degrades cleanly when it is down: lib/math/symbolic.ts falls
back to the exact-fraction checker, which still covers most of the material.

WHY THE TIMEOUT AND THE LENGTH LIMIT ARE NOT OPTIONAL

sympify on hostile input is a denial-of-service primitive. `9**9**9` is a
one-line request that pins a core for the rest of the day. Every endpoint below
caps the input length and runs under an alarm, and expressions are parsed with
evaluate=False so nothing is computed during parsing.

The input reaching this service originates from a model, not directly from a
student — but a model repeating what a student typed is the same thing wearing a
hat, which is why the limits are here rather than upstream.
"""

from __future__ import annotations

import os
import signal
from contextlib import contextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from sympy import Eq, S, simplify, solve, symbols
from sympy.parsing.sympy_parser import (
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)

app = FastAPI(title="PaperPath math verification")

# Long enough for any school expression, short enough that the parser cannot be
# handed a megabyte of nested powers.
MAX_LENGTH = 500
TIMEOUT_SECONDS = int(os.environ.get("MATH_VERIFY_TIMEOUT", "3"))

TRANSFORMATIONS = standard_transformations + (implicit_multiplication_application,)


class Timeout(Exception):
    pass


@contextmanager
def time_limit(seconds: int):
    """SIGALRM, which is POSIX-only — this service is expected to run in a Linux
    container. On a platform without it the guard degrades to no guard, which is
    why the length cap exists as well and is checked first."""

    if not hasattr(signal, "SIGALRM"):
        yield
        return

    def handler(signum, frame):  # noqa: ANN001, ARG001
        raise Timeout()

    previous = signal.signal(signal.SIGALRM, handler)
    signal.alarm(seconds)
    try:
        yield
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, previous)


def parse(expression: str):
    if len(expression) > MAX_LENGTH:
        raise HTTPException(status_code=413, detail="expression too long")

    # evaluate=False so parsing does no arithmetic. Without it, parsing
    # "9**9**9" computes it, and the timeout below never gets a chance to fire
    # because the work happens inside the parser.
    return parse_expr(
        expression,
        transformations=TRANSFORMATIONS,
        evaluate=False,
    )


class EqualRequest(BaseModel):
    a: str = Field(..., max_length=MAX_LENGTH)
    b: str = Field(..., max_length=MAX_LENGTH)


class EqualResponse(BaseModel):
    equal: bool | None
    reason: str | None = None


@app.post("/equal", response_model=EqualResponse)
def equal(request: EqualRequest) -> EqualResponse:
    """Are these two expressions the same thing?

    Returns null rather than false when it cannot tell. That distinction is the
    whole contract: the caller shows a correction on false and stays quiet on
    null, and conflating the two would have the tutor apologise for correct
    algebra."""

    try:
        with time_limit(TIMEOUT_SECONDS):
            difference = simplify(parse(request.a) - parse(request.b))
            return EqualResponse(equal=bool(difference == 0))
    except Timeout:
        return EqualResponse(equal=None, reason="timeout")
    except HTTPException:
        raise
    except Exception as error:  # noqa: BLE001
        return EqualResponse(equal=None, reason=str(error)[:200])


class SolveRequest(BaseModel):
    equation: str = Field(..., max_length=MAX_LENGTH)
    variable: str = Field("x", max_length=10)


class SolveResponse(BaseModel):
    roots: list[str] | None
    reason: str | None = None


@app.post("/solve", response_model=SolveResponse)
def solve_equation(request: SolveRequest) -> SolveResponse:
    try:
        with time_limit(TIMEOUT_SECONDS):
            variable = symbols(request.variable)

            if "=" in request.equation:
                left, right = request.equation.split("=", 1)
                equation = Eq(parse(left), parse(right))
            else:
                equation = Eq(parse(request.equation), S.Zero)

            roots = solve(equation, variable)
            return SolveResponse(roots=[str(root) for root in roots])
    except Timeout:
        return SolveResponse(roots=None, reason="timeout")
    except HTTPException:
        raise
    except Exception as error:  # noqa: BLE001
        return SolveResponse(roots=None, reason=str(error)[:200])


class CheckRequest(BaseModel):
    """One claimed equality, as the tutor wrote it."""

    claim: str = Field(..., max_length=MAX_LENGTH)


@app.post("/check", response_model=EqualResponse)
def check(request: CheckRequest) -> EqualResponse:
    """Convenience for the common case: hand over "a = b" and get a verdict.

    This is what the tutor pipeline actually calls, one claim at a time, so the
    caller does not have to split on '=' and get chained equalities wrong."""

    if "=" not in request.claim:
        return EqualResponse(equal=None, reason="not an equality")

    parts = [part.strip() for part in request.claim.split("=") if part.strip()]

    if len(parts) < 2:
        return EqualResponse(equal=None, reason="not an equality")

    try:
        with time_limit(TIMEOUT_SECONDS):
            # "a = b = c" is checked as a=b and b=c, matching auditEquations in
            # lib/math/verify.ts so the two never disagree about what a chain
            # means.
            for left, right in zip(parts, parts[1:]):
                if simplify(parse(left) - parse(right)) != 0:
                    return EqualResponse(equal=False)
            return EqualResponse(equal=True)
    except Timeout:
        return EqualResponse(equal=None, reason="timeout")
    except Exception as error:  # noqa: BLE001
        return EqualResponse(equal=None, reason=str(error)[:200])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
