# ContextGate — Unified MCP Gateway for Organizations

> ระบบกลางจัดการ MCP (Model Context Protocol) สำหรับองค์กร ที่รวบรวม Knowledge Base, Operational Systems และ Context ทั้งหมดไว้ในจุดเดียว พร้อมระบบความปลอดภัย การตรวจสอบ และการเชื่อมต่อที่ง่ายต่อการขยาย

---

## 1. Vision & Overview

**ContextGate** คือ Open Source MCP Gateway ที่ออกแบบมาเพื่อให้องค์กรสามารถรวบรวม Context และข้อมูลจากหลายระบบ (เอกสาร, ฐานข้อมูล, API) เข้าไว้ในจุดเดียว แล้วเปิดให้ AI Agent เข้าถึงผ่าน Protocol เดียว (MCP) โดยไม่ต้องกังวลเรื่องการจัดการสิทธิ์ การตรวจสอบ หรือการเชื่อมต่อที่ซับซ้อน

สำหรับบริษัทที่มีหลายทีม หลายระบบ หรือแม้แต่คนเดียวที่ทำงานหลายโปรเจ็ค — ContextGate ช่วยให้ AI Agent ทุกตัวเข้าถึงข้อมูลได้จาก "แหล่งเดียวที่เป็นความจริง" (Single Source of Truth) โดยที่ Admin สามารถควบคุมได้ว่า Agent ไหน เห็นอะไร ทำอะไรได้บ้าง

---

## 2. Problem Statement

ในบริษัทที่เริ่มใช้ AI Agent มากขึ้น พบปัญหาเหล่านี้:

1. **Fragmented Context**: Agent แต่ละตัวต้องเชื่อมต่อกับระบบต่างกันเอง (Notion ตัวหนึ่ง, Database อีกตัว, API อีกตัว) ทำให้ setup ซ้ำซ้อน
2. **No Single Source of Truth**: ข้อมูลในเอกสารกับข้อมูลในระบบปฏิบัติงานไม่สอดคล้องกัน Agent ตอบคำถามผิดหรือไม่ครบ
3. **Security Blind Spot**: ไม่มีระบบควบคุมว่า Agent หรือ User คนไหนเข้าถึงข้อมูลอะไรได้บ้าง ไม่มี Audit Log
4. **Difficulty Scaling**: เมื่อต้องการเพิ่มระบบใหม่ ต้องเขียน MCP Server ใหม่ทั้งหมด ไม่มี Plugin System
5. **Inconsistent Experience**: Agent คนละตัวมีข้อมูลไม่เหมือนกัน ขึ้นอยู่กับว่าคนสร้าง config ไว้ยังไง

---

## 3. Solution: ContextGate

ContextGate ทำหน้าที่เป็น **MCP Proxy + Orchestrator + Security Layer** ที่นั่งอยู่ตรงกลางระหว่าง AI Agent กับ Backend Systems ทั้งหมดขององค์กร

```
┌─────────────────┐     ┌─────────────────────────────┐     ┌──────────────────┐
│   AI Agent 1    │────▶│                             │────▶│   Notion / Docs  │
│   (Claude, etc) │     │    ┌─────────────────┐      │     │   (Knowledge)    │
└─────────────────┘     │    │                 │      │     └──────────────────┘
┌─────────────────┐     │    │   ContextGate   │      │     ┌──────────────────┐
│   AI Agent 2    │────▶│    │   (MCP Gateway) │      │────▶│   PostgreSQL     │
│   (Claude, etc) │     │    │                 │      │     │   (Operational)  │
└─────────────────┘     │    └─────────────────┘      │     └──────────────────┘
                        │                             │     ┌──────────────────┐
                        │    • RBAC / ACL             │────▶│   REST APIs      │
                        │    • Audit Logging          │     │   (Internal)     │
                        │    • Caching                │     └──────────────────┘
                        │    • Rate Limiting          │     ┌──────────────────┐
                        │    • Context Sync           │────▶│   Confluence     │
                        └─────────────────────────────┘     └──────────────────┘
```

Agent ทุกตัวเชื่อมต่อกับ ContextGate ผ่าน MCP Protocol เพียงจุดเดียว แต่สามารถเข้าถึง Resources และ Tools จากหลายระบบได้ตามสิทธิ์ที่ถูกกำหนดไว้

---

## 4. Core Features

### 4.1 Unified MCP Endpoint
- เปิด MCP Server จุดเดียวที่รวม `tools`, `resources`, `prompts` จากทุก backend
- Agent เชื่อมต่อครั้งเดียว ใช้ได้ทุกระบบ
- Auto-discovery: เมื่อเพิ่ม Connector ใหม่ Agent จะเห็น Tools/Resources ใหม่ทันที

### 4.2 Pluggable Connector System
- ระบบ Plugin ที่ให้เชื่อมต่อกับ Backend ต่างๆ โดยไม่ต้องแก้ Core Code
- Connectors ที่รองรับในตอนแรก:
  - **Knowledge**: Notion, Confluence, Google Drive, Markdown Files, PDF (RAG-ready)
  - **Operational**: PostgreSQL, MySQL, REST API (OpenAPI), GraphQL, Redis
  - **Communication**: Slack, Discord, Email (read-only context)
- สามารถเขียน Custom Connector ด้วย TypeScript/JavaScript ได้

### 4.3 Role-Based Access Control (RBAC)
- จัดการสิทธิ์ระดับ: **Organization → Team → User/Agent → Resource**
- กำหนดได้ว่า Agent ตัวไหน (หรือ User คนไหน) ใช้ Tool ไหนได้ อ่าน Resource ไหนได้
- รองรับ Policy แบบ fine-grained เช่น "Agent นี้อ่านได้แค่ Table `customers` แต่ไม่ใช่ `salary`"

### 4.4 Audit & Compliance
- บันทึกทุกการเรียกใช้ Tool และการอ่าน Resource (who, what, when, result size)
- แดชบอร์ดดู Audit Log ได้แบบ real-time
- Export เป็น CSV/JSON สำหรับการตรวจสอบ

### 4.5 Smart Caching & Context Sync
- Cache Context และ Resources ไว้ใน Memory/Redis เพื่อลดการโหลดจาก Backend ซ้ำๆ
- ตั้งเวลา Sync (polling) หรือรองรับ Webhook จากบางระบบ
- Context Versioning: รู้ได้ว่า Context เปลี่ยนไปเมื่อไหร่ และ Agent กำลังใช้ Version ไหน

### 4.6 Web-based Admin Dashboard
- UI สำหรับจัดการ Connectors, Resources, Policies
- ทดสอบ Tools ก่อนเปิดให้ Agent ใช้จริง (Playground)
- Monitor การใช้งาน: ดูว่า Agent ไหนใช้อะไรบ่อย มี Error อะไรบ้าง

### 4.7 Multi-Workspace (พื้นฐาน)
- รองรับหลาย Workspace ใน Instance เดียว (เบื้องต้นสำหรับใช้ภายใน หรือ SaaS ในอนาคต)
- Workspace แยกกันโดยสิ้นเชิง (data isolation)

---

## 5. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Client Layer                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                       │
│  │  AI Agent 1  │  │  AI Agent 2  │  │  Web Admin   │                       │
│  │   (MCP)      │  │   (MCP)      │  │   (HTTP)     │                       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                       │
└─────────┼────────────────┼────────────────┼─────────────────────────────────┘
          │                │                │
          └────────────────┴────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────────────┐
│                           API / Transport Layer                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    ContextGate API Gateway                               ││
│  │   • MCP over SSE (Server-Sent Events)                                   ││
│  │   • MCP over stdio (for local agents)                                   ││
│  │   • REST API (for Web Dashboard)                                        ││
│  │   • Authentication (API Key / JWT)                                      ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└──────────────────────────┬──────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────────────┐
│                           Core Engine                                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐│
│  │   Router    │  │   Policy    │  │   Audit     │  │   Cache Manager     ││
│  │  (MCP Hub)  │  │   Engine    │  │   Logger    │  │   (Redis)           ││
│  └──────┬──────┘  └─────────────┘  └─────────────┘  └─────────────────────┘│
└─────────┼────────────────────────────────────────────────────────────────────┘
          │
┌─────────▼────────────────────────────────────────────────────────────────────┐
│                        Connector / Adapter Layer                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────────────┐│
│  │  Notion  │ │  Confl.  │ │  Postgres│ │  REST    │ │  Custom Connector   ││
│  │  Adapter │ │  Adapter │ │  Adapter │ │  Adapter │ │  (SDK Provided)     ││
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └─────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Tech Stack

| Layer | Technology | เหตุผล |
|-------|-----------|--------|
| **Backend** | Node.js + TypeScript | MCP SDK มี TypeScript เป็นหลัก คอมมูนิตี้ใหญ่ |
| **MCP Transport** | SSE + stdio | รองรับทั้ง Cloud Agent และ Local Agent |
| **Database** | PostgreSQL | เก็บ Config, Policies, Audit Logs |
| **Cache** | Redis | Cache Context, Session, Rate Limiting |
| **Frontend** | React + Tailwind CSS | ง่ายต่อการมีส่วนร่วมของคอมมูนิตี้ |
| **Queue** | BullMQ (Redis) | Background Sync Jobs |
| **Authentication** | JWT + API Key | รองรับทั้ง User Login และ Service-to-Service |

---

## 7. Data Model (คร่าวๆ)

```
Workspace
├── Users
├── Agents (API Key + Metadata)
├── Connectors (config, credentials encrypted)
│   └── Sync Schedules
├── Resources (mapping จาก Connector → MCP Resource)
│   └── Resource Groups (จัดกลุ่มสำหรับให้สิทธิ์)
├── Policies (RBAC Rules)
│   ├── Agent/Group → Resource → Action (read/use)
│   └── Time-based / IP-based restrictions (optional)
└── AuditLogs
    ├── timestamp, agent_id, action, resource, result_size, status
```

---

## 8. Connector Ecosystem

### Phase 1 (Core Knowledge)
- **File System**: Markdown, PDF, TXT (with basic RAG)
- **Notion**: Pages, Databases
- **Confluence**: Pages, Spaces

### Phase 2 (Operational)
- **Database**: PostgreSQL, MySQL (read-only by default)
- **REST API**: OpenAPI Spec importer
- **GraphQL**
- **Redis**
- **Slack**: Channel history (read-only context)
- **Telegram**: Messages, channels (read-only context)
- **Google Sheets**: Spreadsheets, worksheets (read-only by default)

### Phase 3 (Advanced)
- **Google Drive**: Docs, Sheets, Slides
- **GitHub**: Issues, PRs, Code (for dev teams)
- **Custom Webhook**: รับ Events จากระบบภายใน
- **Jira / Trello**: Project management (planned)

---

## 9. Security Model

### Default Secure by Design
- **Read-Only Default**: Connector ใหม่ default เป็น read-only ต้องเปิดเองถ้าอยากให้เขียน
- **Least Privilege**: Agent ได้เห็นแค่ Resource ที่ถูก assign ไว้เท่านั้น
- **Credential Encryption**: API Keys, DB passwords encrypt ด้วย AES-256
- **No Data Persistence (optional mode)**: สามารถตั้งค่าให้ไม่เก็บ Content ลง Database ใดๆ (passthrough mode)

### RBAC Granularity
```yaml
policy:
  agent: "hr-assistant"
  allow:
    - resource: "confluence://company-policies/*"
      actions: ["read"]
    - resource: "postgres://hr-db/employees"
      actions: ["query"]
      columns: ["id", "name", "department", "start_date"]
      deny_columns: ["salary", "ssn"]
  deny:
    - resource: "postgres://finance-db/*"
```

---

## 10. Use Cases

### Use Case 1: Company Onboarding Agent
- **Agent**: HR Chatbot สำหรับพนักงานใหม่
- **Data**: เอกสารใน Notion/Confluence (วิธีทำงาน, นโยบาย, สวัสดิการ), Directory จาก PostgreSQL
- **Result**: พนักงานใหม่ถามได้ทุกเรื่อง ไม่ต้องรบกวน HR ตลอดเวลา

### Use Case 2: Developer Support Agent
- **Agent**: Claude ที่ช่วย Dev ในทีม
- **Data**: API Documentation (จาก OpenAPI), Database Schema, Error Logs จาก Log System, GitHub Issues
- **Result**: Dev ถามได้ว่า "API นี้ทำงานยังไง" หรือ "ทำไม user คนนี้ถึงเจอ Error" โดย Agent รู้ Context ทั้งหมด

### Use Case 3: Single Freelancer, Multiple Clients
- **User**: Freelancer คนเดียวที่ทำให้หลายบริษัท
- **Data**: แยก Workspace ต่อ Client — Workspace A มีข้อมูล Client A, Workspace B มีข้อมูล Client B
- **Result**: ใช้ MCP ตัวเดียว แต่ Context แยกกันชัดเจน ไม่ปนกัน

---

## 11. Roadmap

### Phase 1: Foundation (MVP)
- [ ] MCP Server Core (SSE + stdio)
- [ ] File System Connector (Markdown, PDF)
- [ ] PostgreSQL Connector (read-only)
- [ ] Basic RBAC (Agent → Resource)
- [ ] Audit Log (basic)
- [ ] Web Dashboard (basic config)

### Phase 2: Enterprise Ready
- [ ] Notion & Confluence Connectors
- [ ] Telegram Connector (messages, channels)
- [ ] Google Sheets Connector (spreadsheets, worksheets)
- [ ] REST API Connector (OpenAPI)
- [ ] Advanced RBAC (column-level, time-based)
- [ ] Redis Caching Layer
- [ ] Audit Dashboard
- [ ] Multi-Workspace

### Phase 3: Ecosystem
- [ ] Custom Connector SDK + Template
- [ ] Slack, GitHub, Google Drive Connectors
- [ ] Webhook / Event-driven Sync
- [ ] CLI Tool สำหรับ Deploy
- [ ] Plugin Marketplace (Community Connectors)

---

## 12. Why Open Source?

1. **Trust**: องค์กรสามารถ audit โค้ดได้ว่าข้อมูลไปไหน เก็บยังไง
2. **Extensibility**: ใครก็ได้สร้าง Connector ใหม่ได้
3. **Community**: ปัญหา Connector ที่พบบ่อย คอมมูนิตี้ช่วยกันแก้
4. **No Vendor Lock-in**: ถ้าวันหนึ่งอยากย้ายไปใช้ของอื่น ก็ย้ายได้เพราะข้อมูลอยู่ที่ตัวเอง

---

## 13. Potential Project Names

- **ContextGate** (ที่ใช้อยู่ในเอกสารนี้)
- **NexusMCP**
- **OmniContext**
- **MCP Central**
- **ContextHub**
- **SynapseBridge**

---

## 14. Next Steps (ถ้าตัดสินใจเริ่ม)

1. **Validate**: ลองสร้าง PoC ด้วย Node.js + `@anthropic-ai/mcp` ที่รวม File System + PostgreSQL เข้าด้วยกัน
2. **Design**: วาง Database Schema ให้ละเอียด
3. **Bootstrap**: สร้าง Repo, ตั้ง CI/CD, เขียน README ให้ดึงดูดคอนTRIBUTOR
4. **Iterate**: ปล่อย MVP ให้ทีมหรือคนรู้จักใช้ก่อน แล้วเก็บ Feedback

---

*เอกสารนี้เป็น Draft สำหรับเริ่มต้นอภิปราย สามารถปรับเปลี่ยนตามความเหมาะสมได้ครับ*
