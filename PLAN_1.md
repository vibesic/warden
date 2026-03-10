# Secure BYOD Exam Strategy: "The Honeypot Architecture"

## 1. Executive Summary

This plan outlines a cost-effective, high-security architecture for conducting onsite coding exams using students' own laptops (Bring Your Own Device). Instead of relying on expensive proctoring software, we leverage a **local offline network** combined with a software "Honeypot" to detect cheating.

**Core Concept:**
We create a strictly offline Local Area Network (LAN). The exam application runs on the teacher's laptop (Server). Students connect to this LAN. The application silently attempts to connect to the public internet in the background. If it succeeds, it means the student has illicitly bridged a connection (e.g., USB Tethering), and they are flagged immediately.

---

## 2. Architecture Diagram

```mermaid
graph TD
    TeacherLaptop[Teacher Laptop (Server)]
    OfflineRouter[Offline Wi-Fi Router]
    StudentA[Student Laptop (Legit)]
    StudentB[Student Laptop (Cheater)]
    MobilePhone[Mobile Phone]
    Internet[Public Internet]

    TeacherLaptop -- Ethernet/Wi-Fi -- OfflineRouter
    StudentA -- Wi-Fi -- OfflineRouter
    StudentB -- Wi-Fi -- OfflineRouter
    
    StudentB -- USB Cable -- MobilePhone
    MobilePhone -. 4G/5G .- Internet

    style TeacherLaptop fill:#bbf,stroke:#333
    style OfflineRouter fill:#f9f,stroke:#333
    style Internet fill:#f00,stroke:#333
```

- **Teacher Laptop:** Runs Node.js Backend, Database, and React Frontend. Serves as the Central Authority.
- **Offline Router:** A standard TP-Link/Asus router with **NO WAN CABLE** connected. It provides IP addresses but no internet.
- **Student Laptop:** Connects to the Router. Accesses the generic Exam Portal.
- **The Trap:** The Exam Portal tries to load `google.com/favicon.ico`.
    - **Student A:** Fails (Good).
    - **Student B:** Succeeds (Bad - Alert Triggered).

---

## 3. Hardware & Network Setup

### 3.1 Requirements
1.  **Teacher Laptop**: Capable of running Docker/Node.js.
2.  **Wi-Fi Router**: Any consumer-grade router ($30+).
3.  **Proctor**: Physical presence to spot phones and dongles.

### 3.2 Setup Instructions (Teacher)
1.  **Router Configuration**:
    - Plug into power.
    - **Do NOT** connect the Internet cable.
    - Set SSID: `Exam_Secure_LAN`.
    - Set Password: `secure_exam_2026`.
2.  **Server IP Discovery**:
    - Connect Teacher Laptop to `Exam_Secure_LAN`.
    - Run `ipconfig` (Windows) or `ifconfig` (Mac/Linux).
    - Note the IP (e.g., `192.168.1.5`).
3.  **Exam URL**:
    - URL for students: `http://192.168.1.5:3000`.

---

## 4. Security Logic Implementation

### 4.1 Layer 1: Heartbeat (Prove Participation)
**Goal:** Ensure student is connected to our network.
- **Mechanism:** Persistent `WebSocket` connection.
- **Logic:**
    - Client sends `{ studentId, status: 'alive' }` every 5 seconds.
    - Server expects heartbeat.
    - If missed for >30s -> **Alert: "Disconnected/Possible Hotspot Switch"**.

### 4.2 Layer 2: The Honeypot (Detect Bridging)
**Goal:** Detect hidden internet connections (USB Tethering, internal LTE).
- **Mechanism:** `useInternetSniffer` Hook.
- **Logic:**
    - Frontend attempts `fetch('https://www.google.com/favicon.ico?t=' + Date.now(), { mode: 'no-cors' })`.
    - If `catch` (Error) -> **Status: SECURE** (No Internet).
    - If `then` (Success) -> **Status: VIOLATION** (Internet Detected).
    - **Alert: "Unauthorized Internet Access!"**.

### 4.3 Layer 3: Physical Proctoring
**Goal:** Prevent obvious cheating.
- **Mechanism:** Eyes.
- **Logic:**
    - Teacher bans mobile phones on desks.
    - Teacher bans Visible USB Dongles.
    - *Note:* Hidden cheating is caught by Layer 2.

---

## 5. Implementation Roadmap

### 5.1 Backend (NestJS/Express)
- `ExamGateway`: WebSocket Gateway to handle connections.
- `ViolationService`: Logger for detected anomalies.

```typescript
// Payload for Violation
interface ViolationEvent {
  studentId: string;
  type: 'INTERNET_ACCESS' | 'DISCONNECTION' | 'SNIFFER_TIMEOUT';
  timestamp: Date;
}
```

### 5.2 Frontend (React)
- **Component:** `<SecureExamMonitor />`.
- **Hook:** `useInternetSniffer()`.
- **UI:** Fullscreen warning if violation detected.

### 5.3 Local Development Environment (For Coding Exams)
Since `npm install` requires internet, we must prep the environment:
1.  **Option A (Pre-install):** Students clone the base repo and run `npm install` **before** entering the room.
2.  **Option B (Local Proxy):** Teacher runs `verdaccio` on Laptop to serve npm packages (Advanced).
    - *Recommendation: Option A for simplicity.*

---

## 6. Threat Model & Mitigations

| Threat | Method | Mitigation |
| :--- | :--- | :--- |
| **Hotspot Switching** | Student disconnects from Exam Wi-Fi to use personal Hotspot. | **Heartbeat Loss**. Server flags them as "Offline". |
| **USB Tethering** | Student stays on Exam Wi-Fi but bridges internet via USB phone. | **Honeypot Sniffer**. Browser requests to Google will succeed, triggering alarm. |
| **Dual Wi-Fi** | Student uses USB Wi-Fi dongle for second connection. | **Physical Proctoring** (Dongles are visible) + **Honeypot Sniffer** (Traffic will route). |
| **Local LLM** | Student runs Ollama/Llama3 locally for AI help. | **Hard to detect**. Requires heavy laptop battery drain. Proctor looks for high fan noise/unusual screen apps. |
| **Pre-written Code** | Student copies files from USB stick. | **Git History Analysis**. Require atomic commits pushed to local Git server (optional). |

---

## 7. Operational Workflow

1.  **T-10 Mins:** Teacher sets up Router and starts Server.
2.  **T-5 Mins:** Students enter, closing all apps except VS Code & Chrome.
3.  **Start:** Students connect to `Exam_Secure_LAN`.
4.  **Check-in:** Students navigate to `http://192.168.x.x:3000` and register ID.
5.  **Exam:**
    - Students code in VS Code.
    - Browser tab remains open for "Monitoring".
6.  **End:** Students zip project or push to local Git.