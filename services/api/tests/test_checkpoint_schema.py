"""Checkpoint anchor validation: needs an anchor, and from_layer canonicalizes over from_pct."""

from __future__ import annotations

import pytest
from api.schemas import Checkpoint
from pydantic import ValidationError


def test_checkpoint_requires_an_anchor():
    with pytest.raises(ValidationError):
        Checkpoint(nozzle_temp=200)  # neither from_pct nor from_layer


def test_from_layer_canonicalizes_over_from_pct():
    c = Checkpoint(from_layer=5, from_pct=80, nozzle_temp=200)
    assert c.from_layer == 5
    assert c.from_pct is None  # from_layer wins; the two anchors can't disagree downstream


def test_either_anchor_alone_is_accepted():
    assert Checkpoint(from_pct=80, fan_percent=100).from_pct == 80
    assert Checkpoint(from_layer=40, fan_percent=100).from_layer == 40
