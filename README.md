# SwasthyaSetu

This repository is the official submission for **Smart India Hackathon (SIH) 2026**.

## 1. Project Information

- **Project Title:** SwasthyaSetu
- **PS ID:** SIH26047
- **PS Title:** Patient Case-Taking Software
- **Organization:** Ministry of Ayush
- **Category:** Software
- **Theme:** MedTech / BioTech / HealthTech

## 2. Problem Statement

Public healthcare facilities and Primary Health Centers (PHCs) across India handle overwhelming patient loads, with doctors examining 80 to 100 OPD patients in short shifts. Doctors spend over 60% of consultation time manually capturing patient history, vital signs, and handwriting prescriptions. Concurrently, rural patients encounter language and literacy barriers, fragmented paper records, and lack guided physical therapy and rehabilitation.

## 3. Proposed Solution

SwasthyaSetu bridges rural patient kiosks with hospital OPD doctor workstations. Patients complete a structured, voice-guided clinical intake in their regional language at the kiosk before meeting the doctor. The system extracts data from physical prescriptions and lab reports via a dual-tier OCR pipeline, synthesizes interview transcripts into standardized SOAP clinical notes, and delivers in-browser edge computer vision pose estimation for prescribed rehabilitation without streaming video over the network.

## 4. Key Features

- Multilingual Vernacular Kiosk Intake across 10 Indian regional languages with speech-to-text
- Ambient Clinical Scribe and automated SOAP note generation reducing doctor documentation time by up to 75%
- In-browser Edge Computer Vision pose correction for prescribed yoga and rehabilitation routines
- Dual-Tier Resilient Medical OCR for prescriptions and lab diagnostic reports
- Doctor OPD Queue Management with priority clinical risk triage
- Digital Prescription Composer with ABDM-compliant official Rx print layouts
- Longitudinal Health Tracker for blood pressure, blood glucose, heart rate, and BMI-based nutrition targets

## 5. Technology Stack

- Frontend: React 19, Vite, Vanilla CSS, Web Speech API
- Backend: Node.js, Express.js, REST API, JSON Web Tokens (JWT)
- Machine Learning & Computer Vision: MediaPipe Pose (WebAssembly / WebGL), OpenCV, NumPy
- Vision & OCR Providers: Google Gemini Flash Vision, OpenRouter Multimodal Fallback
- Database: MongoDB, Mongoose ODM
- Deployment: Vercel (Client), Render (Backend), MongoDB Atlas

## 6. Architecture

See [docs/architecture.md](docs/architecture.md).

```text
User (Patient Kiosk / Doctor Workstation)
  |
  v
Frontend (React 19 + WebAssembly Edge Pose)
  |
  v
Backend API (Express.js REST Gateway + JWT Auth)
  |
  +----> Database (MongoDB - Patients, Sessions, OPD Queue, Vitals)
  |
  v
Machine Learning Services (Dual-Tier Gemini/OpenRouter OCR + Clinical LLM Scribe)
  |
  v
Prediction & Synthesized Clinical SOAP / Extracted Rx Entities
  |
  v
Frontend (Doctor OPD Dashboard / Patient Portal)
```

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
│   ├── PRESENTATION.md
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
├── server/
│   ├── package.json
│   ├── server.js
│   ├── seed.js
│   └── controllers/
├── ocr_pipeline/
│   ├── requirements.txt
│   └── pipeline/
└── yoga_pose/
    └── pipeline/
        └── yoga_engine.py
```

### What goes where?

| Item | Location |
|---|---|
| Source code (Client & Server) | `client/`, `server/` |
| Architecture / technical documentation | `docs/architecture.md` |
| Project screenshots | `screenshots/` |
| Final PPT / presentation | `submission/PRESENTATION.md` |
| Demo video link | `submission/DEMO.md` |
| Project overview | `README.md` |

## 8. Final Presentation

Keep your final SIH presentation in the repository whenever the file size allows it.

See [submission/PRESENTATION.md](submission/PRESENTATION.md) for the required format and presentation details.

- **Presentation Link:** [View Presentation on Google Drive](https://drive.google.com/drive/u/5/folders/1vYV-grpc7Lmv8FgcRcNa6Dp0YSrvpHEW)

## 9. Demo Video

A demo video is **optional**, but recommended.

Add the YouTube/Google Drive link in [submission/DEMO.md](submission/DEMO.md).

- **Demo Video Link:** [Watch Demo Video on Google Drive](https://drive.google.com/drive/folders/1G-lIdTcfq7XXqMAXFx1vHOEMSWPr33Fd?usp=sharing)

## 10. Screenshots / Prototype Photos

Add important screenshots or hardware/prototype photos to:

`screenshots/`

| File | Description |
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

## 11. Installation

```bash
# 1. Clone repository
git clone https://github.com/Divyam-112/Swasthya-Setu.git
cd Swasthya-Setu

# 2. Install backend dependencies
cd server
npm install

# 3. Install frontend dependencies
cd ../client
npm install

# 4. Install Python dependencies (optional for Python OCR & kinematic tools)
cd ..
pip install -r requirements.txt
```

## 12. Run

```bash
# 1. Seed initial clinical test data
cd server
node seed.js --reset

# 2. Start backend API server (runs on http://localhost:5000)
npm start

# 3. Start frontend client in separate terminal (runs on http://localhost:5173)
cd ../client
npm run dev
```

### Demonstration Credentials
- Doctor Portal: Email: `dr.priya@swasthyasetu.in` | Password: `doctorpassword`
- Patient Portal: Mobile: `9876543210` | Password: `password123`

## 13. Future Scope

- Direct ABHA Milestone 1-3 API integration for automated consent-driven health record exchange across national health networks
- Audio-visual "Talking Prescription" (Bolti Parchi) generating regional spoken instructions and visual dosage cards for illiterate patients
- Machine-learning driven Modified Early Warning Score (MEWS) triage to automatically prioritize critical emergencies in OPD queues
- Unified Allopathy-AYUSH herb-drug interaction safety checker

## Important

Before submission, make sure the repository is accessible to reviewers. Do **not** upload passwords, API keys, access tokens, `.env` files containing secrets, or other confidential credentials.
