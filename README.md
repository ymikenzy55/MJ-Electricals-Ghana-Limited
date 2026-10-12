# MJ Electricals Ghana Limited — Business Platform

Three applications that run the business on one shared database:

| Application | Purpose | Backend (API) | Frontend (UI) |
|---|---|---|---|
| **POS** | Point of sale, inventory, purchasing, stock transfers, shifts, expenses, reports, and website administration. Works **offline-first**. | `http://127.0.0.1:8000` | `http://localhost:3000` |
| **Website** | Public online store: catalogue, cart, checkout, customer accounts, order tracking. | `http://127.0.0.1:8001` | `http://localhost:3001` |
| **Payroll** | Employees, attendance (QR kiosk), leave, loans, payroll runs, payslips, payments. | `http://127.0.0.1:8002` | `http://localhost:3002` |

API documentation (development mode): `http://127.0.0.1:<backend-port>/docs`

---

## Architecture

```
                  ┌──────────────────────────────┐
                  │  PostgreSQL (Neon, cloud)    │
                  │  POS tables · website_* ·    │
                  │  payroll_*                   │
                  └──────▲──────────▲────────▲───┘
           background    │          │        │
           sync (30 s)   │          │        │
 ┌───────────────────────┴──┐ ┌─────┴──────┐ ┌┴────────────┐
 │ POS backend      :8000   │ │ Website    │ │ Payroll     │
 │ FastAPI + local SQLite   │ │ backend    │ │ backend     │
 │ (offline-first)          │ │ :8001      │ │ :8002       │
 └──────────▲───────────────┘ └─────▲──────┘ └──────▲──────┘
            │                       │               │
 ┌──────────┴─────────┐ ┌───────────┴──────┐ ┌──────┴───────────┐
 │ POS frontend :3000 │ │ Website     :3001│ │ Payroll     :3002│
 │ Next.js            │ │ Next.js          │ │ Next.js          │
 └────────────────────┘ └──────────────────┘ └──────────────────┘
```

- **One database.** The website reads POS products and stock directly
  (`is_published_to_website`), so the catalogue never needs copying. Each app
  owns its own tables (`website_*`, `payroll_*`).
- **The POS is the control plane.** Website orders, customers and settings are
  managed from the POS (*Administration → Website Management*) through the
  website's admin API.
- **Offline-first tills.** Each POS computer writes to a local SQLite database
  first, then syncs with the cloud about every 30 seconds. Selling never waits
  for the internet. See [POS/README-OFFLINE.md](POS/README-OFFLINE.md).

## Tech stack

| Layer | Technology |
|---|---|
| Backends | Python 3.13, FastAPI, SQLAlchemy 2, Pydantic 2, Uvicorn |
| Frontends | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Database | PostgreSQL (Neon); SQLite for offline POS terminals |
| Auth | JWT (per app), bcrypt password hashing, login lockout |
| Media | Cloudinary (product images) |
| Desktop | C# tray launcher + Inno Setup installer for POS tills |

## Repository layout

```
.
├── POS/
│   ├── backend/          FastAPI app (app/core, models, routers, schemas, services)
│   ├── frontend/         Next.js app
│   ├── Launcher/         "MJ POS.exe" desktop launcher (C#)
│   ├── installer/        Till installer build (MJ-POS-Setup.exe)
│   └── README-OFFLINE.md Offline mode, backups, multiple tills
├── Website/
│   ├── backend/
│   ├── frontend/
│   └── README.md         Website API and architecture
├── Payroll/
│   ├── backend/
│   └── frontend/
└── Start-All.ps1         Starts every server
```

## Getting started

### Prerequisites

- Windows 10/11
- Python 3.13
- Node.js 20+ (22 LTS recommended)
- A PostgreSQL database (Neon free tier works)

### 1. Configure

Each app ships a `.env.example`. Copy it and fill in your values:

```powershell
Copy-Item POS\backend\.env.example         POS\backend\.env
Copy-Item Website\backend\.env.example     Website\backend\.env
Copy-Item Payroll\backend\.env.example     Payroll\backend\.env
Copy-Item POS\frontend\.env.example        POS\frontend\.env.local
Copy-Item Website\frontend\.env.example    Website\frontend\.env.local
Copy-Item Payroll\frontend\.env.example    Payroll\frontend\.env.local
```

Use a different long random `SECRET_KEY` for each backend:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

### 2. Install dependencies

Run once per app (`POS`, `Website`, `Payroll`):

```powershell
cd POS\backend
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
cd ..\frontend
npm ci
cd ..\..
```

Build the POS desktop launcher once:

```powershell
powershell -ExecutionPolicy Bypass -File POS\Launcher\build-launcher.ps1
```

### 3. Run

Start everything (servers that are already running are skipped):

```powershell
powershell -ExecutionPolicy Bypass -File Start-All.ps1
```

Stop everything:

```powershell
powershell -ExecutionPolicy Bypass -File Stop-All.ps1
```

The first start builds each frontend for production, which takes a few
minutes. Logs are written to `logs\`.

## POS on other computers

Shop computers don't need this repository. They install the POS with
`MJ-POS-Setup.exe`: no admin rights, no Python or Node.js, and fully offline
after the first start.

```powershell
powershell -ExecutionPolicy Bypass -File POS\installer\build-installer.ps1
```

Each till signs in to the cloud with a **restricted database login** (POS
tables only) and claims its own block of record IDs, so tills never collide.
Distribute the installer privately: it contains that login. Details:
[POS/README-OFFLINE.md](POS/README-OFFLINE.md#several-computers-tills).

## Security

- Secrets live only in `.env` files, which are git-ignored. Never commit them.
- Each backend signs its JWTs with its own `SECRET_KEY`. The POS will not start
  without one, and Website/Payroll log a warning if theirs is weak.
- The POS → website admin API uses a shared key (`WEBSITE_ADMIN_KEY` /
  `ADMIN_API_KEY`) and is called server-side only.
- Offline tills use the restricted `mjpos_till` database role. It cannot read
  payroll or website customer data, and cannot change the schema.

## License

Proprietary. © MJ Electricals Ghana Limited. All rights reserved.
