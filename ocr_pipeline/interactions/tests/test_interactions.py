from document_ai.interactions.checker import check_interactions
from document_ai.interactions.providers.base import InteractionProviderError, PairInteractionResult
from document_ai.interactions.schemas import InteractionStatus
from document_ai.medicine.schemas import NormalizedMedicine, PacketVerification, PacketVerificationStatus


def _confirmed(name: str) -> NormalizedMedicine:
    return NormalizedMedicine(raw_name=name, vocabulary_normalized=name, needs_verification=False)


def _unconfirmed(name: str) -> NormalizedMedicine:
    return NormalizedMedicine(raw_name=name, vocabulary_normalized=None, needs_verification=True,
                               reasons=["no_candidate"])


def _packet_verified(raw_name: str, verified_name: str) -> NormalizedMedicine:
    """An originally-uncertain medicine that packet evidence later resolved."""
    return NormalizedMedicine(
        raw_name=raw_name, vocabulary_normalized=None, needs_verification=True, reasons=["ambiguous_match"],
        packet_verification=PacketVerification(status=PacketVerificationStatus.PATIENT_VERIFIED,
                                                verified_name=verified_name),
    )


def _packet_conflict(name: str) -> NormalizedMedicine:
    """A medicine that originally looked confident but packet evidence contradicted."""
    return NormalizedMedicine(
        raw_name=name, vocabulary_normalized=name, needs_verification=False,
        packet_verification=PacketVerification(status=PacketVerificationStatus.CONFLICT,
                                                reason="prescription_packet_mismatch"),
    )


class FakeProvider:
    name = "FakeInteractionDB"

    def __init__(self, interacting_pairs):
        self.interacting_pairs = {frozenset(p) for p in interacting_pairs}

    def check_pair(self, drug_a, drug_b):
        if frozenset((drug_a, drug_b)) in self.interacting_pairs:
            return PairInteractionResult(found=True, evidence=f"{drug_a} and {drug_b} interact")
        return PairInteractionResult(found=False)


class FailingProvider:
    name = "FailingDB"

    def check_pair(self, drug_a, drug_b):
        raise InteractionProviderError("simulated outage")


def test_potential_interaction_detected():
    provider = FakeProvider([("Warfarin", "Aspirin")])
    report = check_interactions([_confirmed("Warfarin"), _confirmed("Aspirin")], provider)
    assert len(report.interactions) == 1
    interaction = report.interactions[0]
    assert interaction.status == InteractionStatus.POTENTIAL_INTERACTION
    assert interaction.needs_clinician_review is True
    assert interaction.source == "FakeInteractionDB"


def test_no_interaction_information_is_never_treated_as_safe():
    provider = FakeProvider([])
    report = check_interactions([_confirmed("Paracetamol"), _confirmed("Ibuprofen")], provider)
    interaction = report.interactions[0]
    assert interaction.status == InteractionStatus.NO_INTERACTION_INFORMATION
    assert interaction.needs_clinician_review is True  # never downgraded to "safe"


def test_provider_unavailable_does_not_crash():
    report = check_interactions([_confirmed("A"), _confirmed("B")], FailingProvider())
    assert report.interactions[0].status == InteractionStatus.PROVIDER_UNAVAILABLE


def test_no_provider_configured():
    report = check_interactions([_confirmed("A"), _confirmed("B")], None)
    assert report.interactions[0].status == InteractionStatus.PROVIDER_UNAVAILABLE
    assert report.interactions[0].reason == "no_provider_configured"


def test_unconfirmed_medicine_never_silently_checked():
    provider = FakeProvider([("Ranitidine", "Warfarin")])
    report = check_interactions([_unconfirmed("Rantidine"), _confirmed("Warfarin")], provider)
    assert len(report.interactions) == 1
    interaction = report.interactions[0]
    assert interaction.status == InteractionStatus.NOT_CHECKED
    assert interaction.reason == "unconfirmed_identity"
    assert interaction.drug_a == "Rantidine"


def test_medicines_deduplicated_before_checking():
    provider = FakeProvider([])
    meds = [_confirmed("Paracetamol"), _confirmed("paracetamol"), _confirmed("Ibuprofen")]
    report = check_interactions(meds, provider)
    # Only one pair should be checked: Paracetamol x Ibuprofen (deduped case-insensitively)
    assert len(report.interactions) == 1


def test_only_confirmed_medicines_are_paired_with_each_other():
    provider = FakeProvider([("A", "B")])
    meds = [_confirmed("A"), _confirmed("B"), _unconfirmed("C")]
    report = check_interactions(meds, provider)
    statuses = {(i.drug_a, i.drug_b): i.status for i in report.interactions}
    assert statuses[("A", "B")] == InteractionStatus.POTENTIAL_INTERACTION
    assert any(i.status == InteractionStatus.NOT_CHECKED for i in report.interactions)


def test_single_medicine_produces_no_pairs():
    report = check_interactions([_confirmed("A")], FakeProvider([]))
    assert report.interactions == []


def test_empty_medicine_list():
    report = check_interactions([], FakeProvider([]))
    assert report.interactions == []


def test_two_unconfirmed_medicines_are_also_reported_not_checked():
    """Previously two uncertain medicine names taken together were never
    reported at all — this is the fix: they must still surface as
    NOT_CHECKED against each other, not silently dropped."""
    provider = FakeProvider([])
    report = check_interactions([_unconfirmed("Rantidine"), _unconfirmed("Amoxicilin")], provider)
    assert len(report.interactions) == 1
    interaction = report.interactions[0]
    assert interaction.status == InteractionStatus.NOT_CHECKED
    assert interaction.reason == "unconfirmed_identity"
    assert {interaction.drug_a, interaction.drug_b} == {"Rantidine", "Amoxicilin"}
    assert interaction.needs_clinician_review is True


def test_packet_verified_medicine_becomes_eligible_for_interaction_checking():
    """Regression test for the Section 10 gap: an originally-uncertain
    medicine resolved via patient packet verification must actually reach
    the interaction checker under its verified name, not stay excluded
    forever just because the initial vocabulary match was weak."""
    provider = FakeProvider([("Ranitidine 150 MG", "Warfarin")])
    medicines = [
        _packet_verified("Rantidine", "Ranitidine 150 MG"),
        _confirmed("Warfarin"),
    ]
    report = check_interactions(medicines, provider)
    checked_pairs = [i for i in report.interactions if i.status == InteractionStatus.POTENTIAL_INTERACTION]
    assert len(checked_pairs) == 1
    assert {checked_pairs[0].drug_a, checked_pairs[0].drug_b} == {"Ranitidine 150 MG", "Warfarin"}


def test_packet_conflict_excludes_medicine_even_if_originally_confident():
    """The reverse direction: a medicine that looked confidently matched
    before packet verification must NOT be silently checked under that
    identity once packet evidence contradicts it."""
    provider = FakeProvider([("Dolo 650", "Warfarin")])
    medicines = [
        _packet_conflict("Dolo 650"),  # packet said something else entirely
        _confirmed("Warfarin"),
    ]
    report = check_interactions(medicines, provider)
    assert all(i.status != InteractionStatus.POTENTIAL_INTERACTION for i in report.interactions)
    not_checked = [i for i in report.interactions if i.status == InteractionStatus.NOT_CHECKED]
    assert len(not_checked) == 1
    assert {not_checked[0].drug_a, not_checked[0].drug_b} == {"Dolo 650", "Warfarin"}


def test_never_reports_a_confirmed_safe_status():
    """There is no status meaning 'safe' — assert the enum itself doesn't
    define one, guarding against a future regression."""
    values = {s.value for s in InteractionStatus}
    assert not any("SAFE" in v or v == "NO_INTERACTION" for v in values)
