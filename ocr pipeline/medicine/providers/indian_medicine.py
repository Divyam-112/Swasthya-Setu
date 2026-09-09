import re
from typing import Optional
from difflib import SequenceMatcher

from .base import VocabularyCandidate

# Synthetic / Benchmark Data for Indian Medicines
_INDIAN_MEDICINES = [
    {'brand_name': 'Sizodon Plus', 'generic_name': 'Risperidone and Trihexyphenidyl', 'salt': 'Risperidone, Trihexyphenidyl', 'aliases': [], 'language_variants': []},
    {'brand_name': 'Qutipin', 'generic_name': 'Quetiapine', 'salt': 'Quetiapine', 'aliases': ['Quetipin'], 'language_variants': []},
    {'brand_name': 'Ativan', 'generic_name': 'Lorazepam', 'salt': 'Lorazepam', 'aliases': [], 'language_variants': []},
    {'brand_name': 'Rivotril', 'generic_name': 'Clonazepam', 'salt': 'Clonazepam', 'aliases': [], 'language_variants': []},
    {'brand_name': 'Serta', 'generic_name': 'Sertraline', 'salt': 'Sertraline', 'aliases': [], 'language_variants': []},
    {
        "brand_name": "Feropenem ER",
        "generic_name": "Faropenem Sodium",
        "salt": "Faropenem",
        "strength": "300mg",
        "dosage_form": "Tablet",
        "aliases": ["Ferenem", "Farobact"],
        "language_variants": ["फेरोपेनम", "फेरेनम"]
    },
    {
        "brand_name": "Calcium and Vitamin D3",
        "generic_name": "Calcium Carbonate + Cholecalciferol",
        "salt": "Calcium + Vitamin D3",
        "strength": "500mg/250IU",
        "dosage_form": "Tablet",
        "aliases": ["Calcirol", "Shelcal"],
        "language_variants": ["कल्सियम + डी3", "कैलशियम", "कैल्शियम"]
    },
    {
        "brand_name": "Multivitamin",
        "generic_name": "Multivitamins and Minerals",
        "salt": "Multivitamins",
        "strength": None,
        "dosage_form": "Tablet",
        "aliases": ["Supradyn", "Zincovit", "A to Z"],
        "language_variants": ["मल्टीविटामिन", "विटामिन"]
    },
    {
        "brand_name": "Amlong",
        "generic_name": "Amlodipine",
        "salt": "Amlodipine Besilate",
        "strength": "5mg",
        "dosage_form": "Tablet",
        "aliases": ["Amlodac", "Amlo", "Amlodipine 5mg"],
        "language_variants": ["अमलोंग", "एमलोडिपिन"]
    },
    {
        "brand_name": "Dolo 650",
        "generic_name": "Paracetamol",
        "salt": "Paracetamol",
        "strength": "650mg",
        "dosage_form": "Tablet",
        "aliases": ["Calpol", "Crocin", "Dolo"],
        "language_variants": ["डोलो", "पैरासिटामोल"]
    },
    {
        "brand_name": "Amoxicillin 500mg",
        "generic_name": "Amoxicillin",
        "salt": "Amoxicillin Trihydrate",
        "strength": "500mg",
        "dosage_form": "Capsule",
        "aliases": ["Amox", "Novamox"],
        "language_variants": ["अमोक्सिसिलिन"]
    },
    {
        "brand_name": "Rexin G",
        "generic_name": "Rexin G",
        "salt": None,
        "strength": None,
        "dosage_form": None,
        "aliases": ["nexin"],
        "language_variants": []
    }
]

def _sim(a: str, b: str) -> float:
    if not a or not b: return 0.0
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()

class IndianMedicineProvider:
    name = "IndianMedicineProvider"

    def __init__(self, data=None):
        self._data = data or _INDIAN_MEDICINES

    def exact_lookup(self, cleaned_name: str) -> Optional[VocabularyCandidate]:
        c_lower = cleaned_name.lower().strip()
        for i, med in enumerate(self._data):
            names = [med["brand_name"].lower()]
            if med["generic_name"]: names.append(med["generic_name"].lower())
            if med["salt"]: names.append(med["salt"].lower())
            names.extend([a.lower() for a in med["aliases"]])
            names.extend([l.lower() for l in med["language_variants"]])
            
            if c_lower in names:
                return VocabularyCandidate(
                    name=med["brand_name"],
                    code=f"IND-{i}",
                    score=1.0,
                    match_type="exact",
                    record=med
                )
        return None

    def approximate_lookup(self, cleaned_name: str, max_candidates: int = 5) -> list[VocabularyCandidate]:
        candidates = []
        c_lower = cleaned_name.lower().strip()
        for i, med in enumerate(self._data):
            best_score = 0.0
            
            names_to_check = [med["brand_name"]]
            if med["generic_name"]: names_to_check.append(med["generic_name"])
            if med["salt"]: names_to_check.append(med["salt"])
            names_to_check.extend(med["aliases"])
            names_to_check.extend(med["language_variants"])
            
            for name in names_to_check:
                s = _sim(c_lower, name.lower())
                if s > best_score:
                    best_score = s
                    
            if best_score > 0.4:  # Lowered threshold to let Candidate Ranking decide
                candidates.append(VocabularyCandidate(
                    name=med["brand_name"],
                    code=f"IND-{i}",
                    score=best_score,
                    match_type="approximate",
                    record=med
                ))
        
        candidates.sort(key=lambda c: c.score, reverse=True)
        return candidates[:max_candidates]


# Public alias matching the naming used for the offline/test fallback role
# in the wider provider architecture (IndianMedicineProvider ->
# ABDMDrugRegistryProvider / LocalBenchmarkProvider). Same class, same
# behavior, same 12 synthetic entries above - not renamed in place because
# IndianMedicineProvider is already the name referenced by existing tests
# and pipeline wiring; this is an additive alias, not a rename.
LocalBenchmarkProvider = IndianMedicineProvider
