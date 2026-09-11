# SwasthyaSetu — Edge-Assisted Bilingual Clinical Intelligence and Kiosk Platform

This repository contains the complete implementation of **SwasthyaSetu**, developed for Smart India Hackathon (SIH) 2026.

---

## 1. Project Information

- **Project Title:** SwasthyaSetu – Edge-Assisted Bilingual Clinical Intelligence and Kiosk Platform
- **PS ID:** SIH2026-MED-042
- **PS Title:** AI-assisted outpatient triage, clinical transcription, and vernacular health kiosk system
- **Category:** Software
- **Theme:** Healthcare & Biomedical Technology / MedTech

---

## 2. Problem Statement

Public healthcare facilities and Primary Health Centers (PHCs) across India handle overwhelming patient volumes, with physicians routinely examining 80 to 100 Outpatient Department (OPD) patients during three-hour shifts. Over 60% of clinical consultation time is consumed by repetitive manual documentation, physical history-taking, and handwriting paper prescriptions rather than direct patient examination. Concurrently, rural and semi-urban patients encounter steep literacy and linguistic barriers, lack digital consolidation of past diagnostic reports, and receive minimal real-time guidance for doctor-prescribed physical therapy and rehabilitation.

---

## 3. Proposed Solution

SwasthyaSetu ("Health Bridge") is an edge-assisted, bilingual clinical intelligence platform that links rural patient kiosks with hospital OPD doctor workstations. Prior to seeing the doctor, patients complete a structured, voice-guided clinical intake in their native language at the kiosk. The system stratifies clinical risks, extracts data from physical prescriptions via a resilient dual-tier OCR pipeline, synthesizes interview transcripts into standardized SOAP clinical summaries for the physician, and delivers client-side edge computer vision pose estimation for prescribed rehabilitation without streaming video over the network.

---

## 4. Key Features

- **Multilingual Vernacular Kiosk Intake:** Conversational voice and touch-driven medical history collection supporting 10 Indian languages (English, Hindi, Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam, Punjabi) with real-time red-flag symptom detection.
- **Ambient Scribe & Automated SOAP Notes:** Converts patient intake dialogues into structured Subjective, Objective, Assessment, Plan (SOAP) records and suggested ICD-10 diagnoses, reducing doctor intake documentation time by up to 75%.
- **Edge-AI Computer Vision Pose Coaching:** MediaPipe WebAssembly engine executing entirely inside the browser to evaluate physical therapy and yoga postures with real-time joint-angle metrics, requiring zero cloud video bandwidth and preserving patient privacy.
- **Dual-Tier Resilient Medical OCR:** Extracts medications, dosages, administration timings, and lab markers from paper prescriptions and diagnostic sheets using Google Gemini Flash Vision with automatic OpenRouter failover.
- **Doctor Clinical Workstation:** Real-time OPD queue management, intake transcript inspection, and an official ABDM-compliant Digital Prescription Composer with print/PDF export.
- **Biometric Health & Nutrition Engine:** Automated calculation of Body Mass Index (BMI), personalized caloric requirements, macronutrient distributions, and biometric trend charting (BP, blood sugar, heart rate).

---

## 5. Technology Stack

- **Frontend / Client Tier:** React 19, Vite, Vanilla CSS, Web Speech API
- **Edge Computer Vision:** MediaPipe Pose (WebAssembly / WebGL), HTML5 Canvas
- **Backend API Gateway:** Node.js, Express.js, REST API, JSON Web Tokens (JWT)
- **Database & Persistence:** MongoDB, Mongoose ODM
- **Machine Learning & OCR:** Google Gemini Flash Vision, OpenRouter Multimodal API, OpenCV, NumPy
- **Python Auxiliary Pipelines:** FastAPI, Pydantic, MediaPipe Python SDK, Uvicorn
- **Deployment & Hosting:** Vercel (Frontend Client), Render (Backend Node API), MongoDB Atlas

---

## 6. Architecture

See [docs/architecture.md](docs/architecture.md) for detailed technical specifications and component interactions.

```text
[Patient Kiosk / App]                [Doctor Workstation]
        |                                     |
        | (Voice / Touch / Edge Pose)         | (Queue & Prescription)
        +------------------+------------------+
                           |
                           v
              [Express.js REST Gateway]
              [JWT Auth & ABDM Consent]
                           |
            +--------------+--------------+
            |                             |
            v                             v
   [MongoDB Database]           [Intelligence Tier]
   - Patient Profiles           - Dual-Tier OCR Pipeline
   - Clinical Sessions          - Gemini / OpenRouter Vision
   - OPD Queue Records          - Clinical SOAP Synthesizer
   - Health Vitals Timeseries
```

---

## 7. Repository Structure

```text
SwasthyaSetu/
├── README.md
├── LICENSE
├── requirements.txt
├── render.yaml
├── docs/
│   └── architecture.md
├── submission/
│   ├── PRSENTATION.md
│   └── DEMO.md
├── screenshots/
│   ├── 01_landing_kiosk_home.png
│   ├── 02_patient_registration_consent.png
│   ├── 03_patient_dashboard_overview.png
│   ├── 04_patient_medical_records.png
│   ├── 05_ai_health_assistant_chat.png
│   ├── 06_appointment_multilingual_intake.png
│   ├── 07_patient_health_tracker_vitals.png
│   ├── 08_exercise_yoga_matrix.png
│   ├── 09_patient_medicine_lifestyle_reminders.png
│   ├── 10_doctor_digital_prescription_composer.png
│   ├── 11_doctor_official_rx_print_preview.png
│   ├── 12_doctor_patient_report_interview_transcript.png
│   └── 13_doctor_patient_report_medical_history.png
├── client/
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── components/
│       ├── context/
│       ├── pages/
│       ├── services/
│       └── utils/
├── server/
│   ├── package.json
│   ├── server.js
│   ├── seed.js
│   ├── controllers/
│   ├── models/
│   ├── routes/
│   └── services/
├── ocr pipeline/
│   ├── requirements.txt
│   └── pipeline/
└── yoga_pose/
    └── pipeline/
        └── yoga_engine.py
```

### What goes where?

| Item | Location |
|---|---|
| Frontend single-page application | `client/` |
| Backend Express REST API server | `server/` |
| Technical architecture documentation | `docs/architecture.md` |
| Python OCR & document extraction pipeline | `ocr pipeline/` |
| Python kinematic reference pose engine | `yoga_pose/pipeline/` |
| Application UI screenshots | `screenshots/` |
| Final presentation slides link | `submission/PRSENTATION.md` |
| Video demonstration link | `submission/DEMO.md` |
| Python dependencies | `requirements.txt` |
| Open-source license terms | `LICENSE` |

---

## 8. Final Presentation

The complete SIH presentation deck detailing problem framing, architecture, clinical workflows, and social impact is documented in:

See [submission/PRSENTATION.md](submission/PRSENTATION.md) for the presentation details.

- **Presentation Link:** [View Presentation on Google Drive](https://drive.google.com/drive/u/5/folders/1vYV-grpc7Lmv8FgcRcNa6Dp0YSrvpHEW)

---

## 9. Demo Video

A complete walkthrough video demonstrating the live patient intake, OPD queue management, Edge AI pose correction, and digital prescription generation is documented in:

See [submission/DEMO.md](submission/DEMO.md) for the video description.

- **Demo Video Link:** [Watch Demo Video on Google Drive](https://drive.google.com/drive/folders/1G-lIdTcfq7XXqMAXFx1vHOEMSWPr33Fd?usp=sharing)

---

## 10. Screenshots / Prototype Photos

Application UI screenshots illustrating the end-to-end user workflows are available in the [screenshots/](screenshots/) directory:

| File | Feature / Screen Description |
|---|---|
| [01_landing_kiosk_home.png](screenshots/01_landing_kiosk_home.png) | Patient Kiosk entry portal with quick-start symptom intake |
| [02_patient_registration_consent.png](screenshots/02_patient_registration_consent.png) | Patient registration modal with ABHA ID and informed consent |
| [03_patient_dashboard_overview.png](screenshots/03_patient_dashboard_overview.png) | Patient workspace with daily routines, reminders, and nutrition |
| [04_patient_medical_records.png](screenshots/04_patient_medical_records.png) | Medical records timeline with digital prescriptions and PDF downloads |
| [05_ai_health_assistant_chat.png](screenshots/05_ai_health_assistant_chat.png) | Multilingual AI conversational health companion |
| [06_appointment_multilingual_intake.png](screenshots/06_appointment_multilingual_intake.png) | Kiosk symptom intake with 10 Indian languages selector |
| [07_patient_health_tracker_vitals.png](screenshots/07_patient_health_tracker_vitals.png) | Longitudinal vitals tracker with trend lines (BP, sugar, heart rate) |
| [08_exercise_yoga_matrix.png](screenshots/08_exercise_yoga_matrix.png) | Doctor-prescribed daily yoga matrix and camera pose coach |
| [09_patient_medicine_lifestyle_reminders.png](screenshots/09_patient_medicine_lifestyle_reminders.png) | Scheduled medication and lifestyle adherence reminders |
| [10_doctor_digital_prescription_composer.png](screenshots/10_doctor_digital_prescription_composer.png) | Doctor clinical workstation with prescription composer |
| [11_doctor_official_rx_print_preview.png](screenshots/11_doctor_official_rx_print_preview.png) | Official ABDM-compliant printable digital prescription modal |
| [12_doctor_patient_report_interview_transcript.png](screenshots/12_doctor_patient_report_interview_transcript.png) | Pre-consultation AI interview transcript review for physicians |
| [13_doctor_patient_report_medical_history.png](screenshots/13_doctor_patient_report_medical_history.png) | Structured past medical history, surgeries, and clinical review |

---

## 11. Installation

### Prerequisites
- Node.js (v18.0 or higher)
- npm (v9.0 or higher)
- Python (v3.10 or higher, optional for standalone Python pipelines)
- MongoDB instance (local or MongoDB Atlas URI)

### Setup Instructions

1. Clone the repository:
```bash
git clone https://github.com/Divyam-112/Swasthya-Setu.git
cd Swasthya-Setu
```

2. Install backend dependencies:
```bash
cd server
npm install
```

3. Install frontend dependencies:
```bash
cd ../client
npm install
```

4. Install Python pipeline dependencies (optional):
```bash
cd ..
pip install -r requirements.txt
```

5. Configure environment variables:
Create a `.env` file in the `server/` directory:
```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key
CLIENT_URL=http://localhost:5173
GEMINI_API_KEY=your_gemini_api_key
OPENROUTER_API_KEY=your_openrouter_api_key
```

---

## 12. Run

1. Seed initial clinical demonstration data (patients, doctor profile, OPD queue):
```bash
cd server
node seed.js --reset
```

2. Launch the backend API server:
```bash
npm start
```
The server runs on `http://localhost:5000`.

3. In a separate terminal, start the frontend client:
```bash
cd client
npm run dev
```
The application opens on `http://localhost:5173`.

4. Default Demonstration Credentials:
- **Doctor Portal:** Email: `dr.priya@swasthyasetu.in` | Password: `doctorpassword`
- **Patient Portal:** Mobile: `9876543210` | Password: `password123`

---

## 13. Future Scope

- **ABHA Health Locker Deep Integration:** Direct integration with Ayushman Bharat Digital Mission (ABDM) Milestone 1 to 3 APIs for automated consent-driven health data discovery and exchange across national networks.
- **Audio-Visual "Talking Prescription" (Bolti Parchi):** Automatic generation of vernacular audio instructions and visual sun/moon dosage cards accessible via QR code scans for illiterate patients.
- **Automated Clinical Early Warning Scoring (MEWS):** Machine-learning powered triage score embedded in kiosk intakes to dynamically elevate critical patients (e.g., suspected acute coronary syndrome or severe hypoxia) to priority status in hospital OPD waiting queues.
- **Dual Allopathy-AYUSH Drug Interaction Engine:** Cross-referencing prescribed allopathic pharmaceuticals against traditional Ayurvedic formulations to preempt adverse herb-drug interactions.

---

## Important

Before submission, ensure the repository is accessible to reviewers. Do **not** upload passwords, API keys, access tokens, `.env` files containing secrets, or other confidential credentials.
