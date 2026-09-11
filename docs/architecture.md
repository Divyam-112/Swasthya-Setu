# System Architecture

## Overview

SwasthyaSetu is structured as a distributed, edge-assisted clinical intelligence platform. It bridges rural and semi-urban patient kiosks with hospital outpatient department (OPD) clinical workstations. The system is designed to minimize clinical documentation overhead, operate efficiently across low-bandwidth environments, and ensure strict data privacy by processing computer vision streams entirely on the client edge.

---

## High-Level System Flow

```text
+-------------------------------------------------------------------------------+
|                             CLIENT TIER (BROWSER)                             |
|                                                                               |
|   +--------------------------+             +------------------------------+   |
|   |   Patient Kiosk / App    |             |  Doctor Clinical Workstation |   |
|   |  - Vernacular Voice I/O  |             |  - OPD Queue Management      |   |
|   |  - MediaPipe Pose (Edge) |             |  - Intake Review & SOAP      |   |
|   |  - Biometric Form Matrix |             |  - Digital Rx Composer       |   |
|   +------------+-------------+             +--------------+---------------+   |
+----------------|------------------------------------------|-------------------+
                 | HTTPS / REST                             | HTTPS / REST
                 v                                          v
+-------------------------------------------------------------------------------+
|                          APPLICATION & ROUTING TIER                           |
|                                                                               |
|   +-----------------------------------------------------------------------+   |
|   | Express.js API Gateway (Node.js Runtime)                              |   |
|   | - Token Authentication & Role-Based Access Control (JWT)              |   |
|   | - Request Sanitization & Rate Limiting                                |   |
|   | - ABHA Identifier & Informed Consent Verification                     |   |
|   +-----------------------------------+-----------------------------------+   |
+---------------------------------------|---------------------------------------+
                                        |
      +---------------------------------+---------------------------------+
      |                                                                   |
      v                                                                   v
+-----------------------------+                         +-------------------------------+
|       PERSISTENCE TIER      |                         |      INTELLIGENCE SERVICES    |
|                             |                         |                               |
|   +---------------------+   |                         |   +-----------------------+   |
|   | MongoDB Database    |   |                         |   | Dual-Tier OCR Service |   |
|   | - User & Auth Store |   |                         |   | - Primary: Gemini API |   |
|   | - Patient Profiles  |   |                         |   | - Failover: OpenRouter|   |
|   | - Clinical Sessions |   |                         |   +-----------------------+   |
|   | - OPD Queue Records |   |                         |   +-----------------------+   |
|   | - Vitals Time-Series|   |                         |   | Clinical LLM Engine   |   |
|   | - Medical Documents |   |                         |   | - Vernacular Triage   |   |
|   +---------------------+   |                         |   | - SOAP Note Synthesis |   |
+-----------------------------+                         |   +-----------------------+   |
                                                        +-------------------------------+
```

---

## Core Subsystems and Components

### 1. Presentation and Edge Client Layer

The client application is built as a single-page application using React 19 and Vite. It serves two distinct interfaces governed by role-based access control:

* **Patient Kiosk Interface:**
  * **Multilingual Input Engine:** Integrates the browser Web Speech API with a 10-language localized dictionary (English, Hindi, Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam, Punjabi), allowing low-literacy patients to complete structured intakes through voice or touch.
  * **Edge Computer Vision Pipeline:** Employs MediaPipe Pose compiled to WebAssembly. Landmark detection and joint angle computations are executed on the user device via WebGL shaders. Raw video feeds are never transmitted over the network, guaranteeing patient privacy and reducing bandwidth usage to zero for camera operations.
  * **Biometric & Nutrition Calculator:** Computes Body Mass Index, basal metabolic requirements, and clinical macronutrient targets dynamically based on patient biometrics.

* **Doctor Clinical Workstation:**
  * **Real-Time OPD Queue:** Visualizes waiting, in-consultation, and completed patient tokens sorted by arrival and clinical urgency flags.
  * **Comprehensive Clinical Intake Viewer:** Renders multi-turn interview transcripts, structured History of Present Illness (HPI) attributes, past medical/surgical history, and active medications.
  * **Digital Prescription Composer:** Supports rapid diagnosis selection, dosage scheduling, and generation of ABDM-compliant official digital prescriptions with exportable print layouts.

### 2. Application and Routing Tier

The backend service is implemented in Node.js utilizing the Express framework. It exposes stateless RESTful APIs grouped into functional domains:

* **Authentication and Access Control (`authController`):** Manages user registration, session token generation using JSON Web Tokens (JWT), and password hashing via bcrypt. Enforces strict role boundaries (`patient`, `doctor`, `admin`).
* **Clinical Session Management (`sessionController`):** Persists patient intake dialogues, chief complaints, categorized symptoms, and clinical assessment data.
* **Outpatient Queue Controller (`appointmentController`):** Orchestrates token assignment, appointment scheduling, and consultation status transitions (`booked`, `in_progress`, `completed`, `cancelled`).
* **Prescription Engine (`prescriptionController`):** Validates and stores digital medication regimens, usage directions, and authorized physician signatures.
* **Document Management (`documentController`):** Handles secure intake, metadata extraction, association, and deletion of scanned clinical reports and prescriptions.

### 3. Machine Learning and Intelligence Services Tier

The intelligence tier combines client-side kinematic algorithms with resilient cloud-based Large Language Models (LLMs) and Optical Character Recognition (OCR):

* **Edge Kinematic Geometry Engine:**
  * Computes 3D spatial joint vectors from 33 body landmarks.
  * Evaluates joint angles across 11 standard physical therapy and yoga postures using planar trigonometric projections.
  * Employs an Exponential Moving Average (EMA) filter and debounce windows to eliminate landmark jitter before computing posture accuracy percentages.

* **Multi-Tier Resilient OCR Service (`ocrService.js`):**
  * **Primary Pipeline:** Submits uploaded prescription and laboratory report images to Google Gemini Flash Vision via structured JSON schemas.
  * **Secondary Failover:** Automatically switches to an OpenRouter multimodal endpoint upon encountering rate limits (HTTP 429) or upstream connectivity failures, executing exponential backoff retries.
  * **Data Normalization:** Extracts medication names, dosages, administration frequencies, laboratory markers, and observed values into standardized data models.

* **Clinical Triage and Scribe Engine:**
  * Processes conversational dialogue turns to generate structured SOAP (Subjective, Objective, Assessment, Plan) records.
  * Suggests relevant ICD-10 diagnostic classifications to the consulting doctor based on extracted symptom constellations.

### 4. Persistence Tier

Data persistence is managed through MongoDB using Mongoose as the Object Data Modeling (ODM) layer:

* **Users and Profiles:** Stores authentication credentials, contact data, preferred language, and assigned healthcare roles.
* **Sessions Collection:** Maintains complete clinical records, including multi-turn interview transcripts, structured symptoms, medical history, and clinical summaries.
* **Appointments Collection:** Tracks OPD consultation tokens, scheduled time windows, attending doctor IDs, and consultation life cycles.
* **Health Readings Collection:** Indexes time-series biometric readings (blood pressure, blood glucose, resting heart rate, oxygen saturation, body weight) for trend analytics.

---

## End-to-End Operational Workflows

### 1. Patient Kiosk Intake and Triage Flow

```text
[Patient at Kiosk]
       |
       | 1. Selects language (e.g., Hindi, Tamil, Bengali)
       v
[Web Speech API / Touch UI]
       |
       | 2. Captures chief complaint and answers multi-turn questions
       v
[Client Application]
       |
       | 3. POST /api/sessions/intake (Encrypted JSON payload)
       v
[Backend API Gateway]
       |
       | 4. Normalizes symptoms, evaluates early risk markers
       v
[MongoDB Database]
       |
       | 5. Creates active Session and assigns OPD Token
       v
[Doctor OPD Queue] (Token appears instantly on physician dashboard)
```

### 2. Edge Pose Estimation and Form Analysis Flow

```text
[Patient Video Camera]
       |
       | 1. Local video frame capture (640x480 @ 30 FPS)
       v
[MediaPipe WebAssembly (Client Browser)]
       |
       | 2. Detects 33 skeletal landmark coordinates
       v
[Geometry Engine (Client Memory)]
       |
       | 3. Vector dot-product calculations for joint angles
       | 4. EMA smoothing & target posture comparison
       v
[Real-Time Canvas Overlay + Metric HUD]
       |
       | 5. Renders skeleton, angle arcs, accuracy score %, and audio cue
       v
(No frame data is sent to server; zero cloud bandwidth consumed)
```

### 3. Medical Document Upload and OCR Analysis Flow

```text
[Patient Uploads Prescription / Lab Report]
       |
       | 1. Base64 / Multipart payload submitted to POST /api/documents/upload
       v
[Backend Document Controller]
       |
       | 2. Relays image buffer to OCR Engine
       v
[OCR Service Router]
       |
       |-- Primary Path --------> [Gemini Vision Direct API]
       |                                   |
       |-- (If HTTP 429 / Error)           | Returns parsed entities
       v                                   v
[OpenRouter Vision Fallback] -----> [JSON Response Normalizer]
                                           |
                                           | 3. Structured medicines & lab values
                                           v
                                   [MongoDB Document Record]
                                           |
                                           | 4. Available to Doctor & Patient records
                                           v
                                   [Patient Medical Timeline]
```

### 4. Doctor OPD Consultation and Prescription Issuance

```text
[Doctor Workstation]
       |
       | 1. Selects next patient token from OPD Queue
       v
[Intake Data Aggregator]
       |
       | 2. Retrieves Session details, transcript, vitals history, and uploaded docs
       v
[Doctor Reviews & Validates]
       |
       | 3. Confirms diagnosis, inputs medications in Digital Rx Composer
       v
[POST /api/prescriptions]
       |
       | 4. Persists official digital prescription with physician credentials
       | 5. Marks OPD Token status as "completed"
       v
[MongoDB Database]
       |
       | 6. Updated record instantly accessible on Patient Portal & PDF export
       v
[Patient Portal / Printable Prescription]
```

---

## Security, Privacy, and Compliance Architecture

* **Edge Processing for Biometric Feeds:** Video streams utilized during pose coaching are processed in volatile client memory and immediately discarded after landmark extraction.
* **Authentication and Authorization:** All protected endpoints require a signed JSON Web Token passed via authorization headers. Role checks strictly isolate patient data access to authorized treating medical personnel and the authenticated individual.
* **Audit-Logged Informed Consent:** Account creation enforces explicit consent tracking for digital triage assistance, ABDM record linkage, and health locker integration.
* **Input Validation and Sanitization:** Server-side validation layers protect against injection, parameter tampering, and malformed payload submissions.

