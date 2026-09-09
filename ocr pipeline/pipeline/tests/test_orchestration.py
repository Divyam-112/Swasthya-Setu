"""
No existing test file covered pipeline/orchestration.py's provider-wiring
functions before this — they're pure construction logic (env vars in,
provider objects out), so these tests just verify the wiring decision
itself, never anything that would make a live network call.
"""

from document_ai.medicine.providers.abdm import ABDMDrugRegistryProvider
from document_ai.medicine.providers.indian_medicine import LocalBenchmarkProvider
from document_ai.medicine.providers.router import ABDMWithLocalFallbackProvider
from document_ai.pipeline.orchestration import _build_medicine_provider


def test_default_wiring_is_abdm_live_only(monkeypatch):
    monkeypatch.delenv("MEDICINE_PROVIDER", raising=False)
    provider = _build_medicine_provider()
    assert isinstance(provider, ABDMDrugRegistryProvider)
    # The default production configuration MUST NOT use the synthetic fallback
    assert not hasattr(provider, "_local")


def test_medicine_provider_env_var_forces_local_only(monkeypatch):
    monkeypatch.setenv("MEDICINE_PROVIDER", "local")
    provider = _build_medicine_provider()
    assert isinstance(provider, LocalBenchmarkProvider)
    assert not isinstance(provider, ABDMWithLocalFallbackProvider)


def test_medicine_provider_env_var_forces_demo_dataset(monkeypatch):
    monkeypatch.setenv("MEDICINE_PROVIDER", "demo_dataset")
    monkeypatch.setenv("MEDICINE_DATASET_PATH", "dummy.json")
    # Will fail if it tries to load dummy.json inside DemoIndianMedicineDatasetProvider.__init__
    # but we just want to verify the type returned, so we mock _load.
    from document_ai.medicine.providers.demo_indian_dataset import DemoIndianMedicineDatasetProvider
    with monkeypatch.context() as m:
        m.setattr(DemoIndianMedicineDatasetProvider, "_load", lambda self, path: [])
        provider = _build_medicine_provider()
        assert isinstance(provider, DemoIndianMedicineDatasetProvider)


def test_medicine_provider_env_var_abdm_explicit(monkeypatch):
    monkeypatch.setenv("MEDICINE_PROVIDER", "abdm")
    provider = _build_medicine_provider()
    assert isinstance(provider, ABDMDrugRegistryProvider)
