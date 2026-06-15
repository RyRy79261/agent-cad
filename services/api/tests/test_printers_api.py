"""Tests for the printer + filament HTTP CRUD (API-14)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from api.main import app


def test_printer_and_filament_crud_over_http():
    """Full registry CRUD in one session (controls the shared module store state)."""
    with TestClient(app) as c:
        # seeded default printer is present
        assert "ender5s1" in [p["id"] for p in c.get("/printers").json()]

        # create a second printer (registry-only scaffolding for v1)
        prusa = {"id": "prusa-mini", "name": "Prusa MINI+", "build_volume": {"x": 180, "y": 180, "z": 180}}
        assert c.post("/printers", json=prusa).status_code == 200
        assert c.get("/printers/prusa-mini").status_code == 200

        # a filament value outside SliceSettings bounds is rejected (422)
        bad = {"id": "x", "name": "Bad", "material": "PLA", "settings": {"flow": 5}}
        assert c.post("/printers/prusa-mini/filaments", json=bad).status_code == 422

        # add a valid filament, then delete it
        petg = {"id": "petg", "name": "PETG", "material": "PETG",
                "settings": {"flow": 0.98, "nozzle_temp": 240, "bed_temp": 80}}
        r = c.post("/printers/prusa-mini/filaments", json=petg)
        assert r.status_code == 200 and any(f["id"] == "petg" for f in r.json()["filaments"])
        assert c.delete("/printers/prusa-mini/filaments/petg").status_code == 200

        # set prusa as the sole default
        c.put("/printers/prusa-mini", json={**prusa, "default": True})
        assert [p["id"] for p in c.get("/printers").json() if p["default"]] == ["prusa-mini"]

        # delete prusa (not the last) -> ok; ender5s1 promoted back to default
        assert c.delete("/printers/prusa-mini").status_code == 200
        ids = [p["id"] for p in c.get("/printers").json()]
        assert "prusa-mini" not in ids and "ender5s1" in ids

        # ender5s1 is now the only printer -> deleting it is refused (409)
        assert c.delete("/printers/ender5s1").status_code == 409

        # unknown printer -> 404
        assert c.get("/printers/nope").status_code == 404
