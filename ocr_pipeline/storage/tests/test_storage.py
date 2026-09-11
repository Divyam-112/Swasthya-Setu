import pytest

from document_ai.medicine.schemas import NormalizedMedicine
from document_ai.storage.memory import InMemoryStateStore
from document_ai.storage.schemas import StoredDocument, StoredMedicine


def _make_medicine(medicine_id: str = "med-1", document_id: str = "doc-1") -> StoredMedicine:
    return StoredMedicine(
        medicine_id=medicine_id,
        document_id=document_id,
        normalized_medicine=NormalizedMedicine(raw_name="Paracetamol"),
    )


def _make_document(document_id: str = "doc-1") -> StoredDocument:
    return StoredDocument(document_id=document_id, file_name="rx.png", document_type="prescription")


def test_save_and_get_document():
    store = InMemoryStateStore()
    doc = _make_document()
    store.save_document(doc)
    retrieved = store.get_document("doc-1")
    assert retrieved is not None
    assert retrieved.document_id == "doc-1"
    assert retrieved.file_name == "rx.png"


def test_get_nonexistent_document_returns_none():
    store = InMemoryStateStore()
    assert store.get_document("nonexistent") is None


def test_save_and_get_medicine():
    store = InMemoryStateStore()
    med = _make_medicine()
    store.save_medicine(med)
    retrieved = store.get_medicine("med-1")
    assert retrieved is not None
    assert retrieved.medicine_id == "med-1"
    assert retrieved.normalized_medicine.raw_name == "Paracetamol"


def test_get_nonexistent_medicine_returns_none():
    store = InMemoryStateStore()
    assert store.get_medicine("nonexistent") is None


def test_update_medicine():
    store = InMemoryStateStore()
    med = _make_medicine()
    store.save_medicine(med)

    updated = _make_medicine()
    updated.normalized_medicine = NormalizedMedicine(raw_name="Paracetamol", vocabulary_normalized="Paracetamol")
    store.update_medicine("med-1", updated)

    retrieved = store.get_medicine("med-1")
    assert retrieved.normalized_medicine.vocabulary_normalized == "Paracetamol"


def test_update_nonexistent_medicine_raises_key_error():
    store = InMemoryStateStore()
    med = _make_medicine(medicine_id="nonexistent")
    with pytest.raises(KeyError):
        store.update_medicine("nonexistent", med)


def test_save_document_with_medicine_ids():
    store = InMemoryStateStore()
    doc = StoredDocument(document_id="doc-1", medicine_ids=["med-1", "med-2"])
    store.save_document(doc)
    retrieved = store.get_document("doc-1")
    assert retrieved.medicine_ids == ["med-1", "med-2"]


def test_stored_medicine_has_timestamps():
    med = _make_medicine()
    assert med.created_at is not None
    assert med.updated_at is not None
