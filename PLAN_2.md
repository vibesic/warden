# Research Proposal: The "Echo-Lock" Protocol
**Title:** Zero-Trust BYOD Proctoring via Negative Network Sensing and Dynamic Acoustic Mesh
**Target Venue:** IEEE Transactions on Learning Technologies / Computers & Security

---

## 1. Executive Summary
We propose a novel framework for secure onsite "Bring Your Own Device" (BYOD) examinations that requires **zero administrative privileges** and **no software installation** (running entirely in a browser/local environment).

The system utilizes two novel side-channel verifications to ensure integrity:
1.  **Negative Network Sensing (NNS):** A "Honeypot" mechanism that continuously validates the *absence* of an internet connection, rather than the presence of a user.
2.  **Dynamic Acoustic Mesh (Echo-Lock):** A server-orchestrated, self-healing ultrasonic network that binds the student's digital session to the physical classroom geometry, preventing remote proxy cheating.

---

## 2. Core Novelty & Contribution

### 2.1 The Problem
Traditional proctoring relies on:
*   **Rootkits (SEB/Proctorio):** Invasive, privacy-violating, requires installation.
*   **Visual Analysis (Webcam):** High bandwidth, privacy concerns, easy to fool with "deep fakes."

### 2.2 Our Solution (The "Honeypot" + "Echo-Lock")
We invert the security model. Instead of watching the user, we **watch the environment**.

| Feature | Novelty Description |
| :--- | :--- |
| **Negative Network Sensing** | Proves the student uses the specific "Offline Router" by ensuring **public internet requests FAIL**. If a student successfully fetches `google.com`, they are cheating (using USB Tethering/VPN). |
| **Acoustic Orchestration** | Solves the "Big Room" problem. The server dynamically designates specific student laptops as "Acoustic Repeaters" to extend beacon range, creating a **verification mesh** that is impossible to replicate remotely. |

---

## 3. Technical Architecture

### 3.1 Hardware Logic ("The Air-Gap")
*   **Teacher Node:** Runs Node.js Server + Standard Wi-Fi Router (WAN unplugged).
*   **Student Logic:**
    *   **Primary Interface:** Wi-Fi (Connected to Teacher).
    *   **Secondary Interface:** USB/Bluetooth (Must be physically absent).

### 3.2 Protocol Flow: The "Echo-Lock" Handshake

**Phase A: Implementation of the "Repeater" (Your Relay Idea)**
To prevent "Replay Attacks" (Data Leaks), the system uses **Server-Authoritative Timing**:

1.  **Orchestration:** Server analyzes the WebSocket latency map of all students.
2.  **Selection:** Server randomly selects `Student_A` (Front Row) and sends command: `EMIT_TOKEN(0x8F, 19000Hz)`.
3.  **Emission:** `Student_A`'s laptop plays a 19kHz tone for 300ms.
4.  **Verification:**
    *   `Student_B` (Middle Row) hears 19kHz.
    *   `Student_B` reports: `{ heard: "19kHz", timestamp: T1 }`.
    *   **Server Logic:** "Did I verify `Student_B` is physically close to `Student_A`? **Yes**."
5.  **Rejection (The Anti-Cheat):**
    *   `Student_C` (Remote Cheater) is on Discord with `Student_A`.
    *   `Student_C` tries to play the sound.
    *   **Server Logic:** `Student_C`'s WebSocket latency is 50ms (too high) OR `Student_C` reports hearing the sound *after* the valid window. **Flagged.**

---

## 4. Implementation Details

### 4.1 "Honeypot" Sniffer (Negative Network Sensing)
*   **Objective:** Detect hidden internet bridges.
*   **Code Strategy:**
    *   Use `fetch()` with `mode: 'no-cors'` to 50+ random high-availability CDNs (Google, Azure, Cloudflare).
    *   **Logic:** A `Success` response is a **VIOLATION**. A `Timeout/Error` is **VALID**.
    *   **Frequency:** Randomized intervals (Poisson distribution) to prevent traffic prediction.

### 4.2 Acoustic Processing (Web Audio API)
*   **Frequency Range:** 18.5 kHz - 19.5 kHz (Near-Ultrasound).
    *   *Why?* Imperceptible to most humans, compatible with standard laptop speakers, unaffected by human speech/coughing (low frequency).
*   **Signal Processing:**
    *   **Sender:** OscillatorNode (Sine Wave).
    *   **Receiver:** AnalyserNode (FFT Size 2048).
    *   **Algorithm:** Detect peak amplitude in the target bin > -50dB threshold.

---

## 5. Security Threat Model

| Threat Attack | Defense Mechanism | Likelihood |
| :--- | :--- | :--- |
| **USB Tethering** | **NNS Honeypot:** The browser will successfully route to Google. | Caught Instantly |
| **Remote Helper (VPN)** | **Acoustic Binding:** Helper cannot hear the ultrasonic beacon. | Caught Instantly |
| **Relay Attack (Wormhole)** | **Orchestrated Mesh:** The strict timing window (< 500ms) and randomized repeater selection make manual relaying impossible. | High Difficulty |
| **Local Offline AI** | **Physical Proctoring:** High CPU usage/Fan noise. | Monitoring Required |

---

## 6. Journal Feasibility & Next Steps
1.  **Prototype:** Build the `useAudioMesh()` hook in React.
2.  **Experiment:** Run a mock exam with 5 laptops.
    *   Test A: Quiet Room.
    *   Test B: Noisy Room (Play cafeteria noise).
    *   Test C: "The Cheater" (Student trying to relay audio via Discord).
3.  **Metrics:** Measure "False Rejection Rate" (how often valid students fail). If < 5%, it is publication-ready.
