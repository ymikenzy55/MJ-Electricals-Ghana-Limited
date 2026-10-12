# MJ Electricals POS — offline-first desktop app

## Opening the POS

Double-click **MJ POS.exe** (or the **MJ Electricals POS** desktop shortcut).
A splash screen appears, the local database and interface start in the
background (a few seconds), and the POS opens in its own window.

* First time on a computer: run `Install-Desktop-Shortcut.ps1` to add the desktop
  and Start-menu shortcuts. Add `-AutoStart` to start the POS (hidden, in the
  system tray) whenever Windows starts so cloud sync runs all day.
* Closing the window does **not** stop the POS — it keeps syncing from the tray
  icon. Right-click the tray icon → **Exit (stop POS)** to stop everything.
* Double-click the tray icon (or launch the app again) to reopen the window.

## How offline works

* Every sale, stock change, shift, expense and customer is written to a database on
  **this computer** first. Nothing waits for the internet, so checkout takes
  tens of milliseconds whether you are online or not.
* A background sync sends local changes to the cloud database and brings down
  changes made elsewhere (website orders, other branches) roughly every 30
  seconds while online. The banner at the top of the POS shows
  *Offline mode* / *Syncing* and how many changes are waiting.
* Admins can press **Sync now** in the banner to sync immediately.
* Stock is merged by *difference* (not overwritten), so a website order and an
  offline sale of the same item never cancel each other out.

## Backups

The POS makes a backup of the local database at start-up and every 12 hours
(last 14 kept) in `backend\data\backups`. **Settings → Offline data backups**
lets an admin back up now or download a copy. To restore: exit the POS,
replace `backend\data\mjpos_local.db` with a backup file, start the POS.
Restore while **online** and wait for the first sync (about 30 seconds) before
selling: that sync moves the ID counters past records the computer already
sent, so a new sale can never reuse an old sale's number.

## Several computers (tills)

Other computers get the POS from the installer — they do not need this folder:

1. Build it: `powershell -ExecutionPolicy Bypass -File installer\build-installer.ps1`
   → `installer\dist\MJ-POS-Setup.exe`. Share it privately (WhatsApp, USB,
   Drive), never on the public website: it carries the till database login.
2. On the till, run `MJ-POS-Setup.exe` (no admin rights, nothing else to
   install). **The first start needs internet**: the computer registers itself
   and downloads products, users and stock. After that it works offline.

Each offline computer creates its records in its own block of 10 million IDs
(this computer: block 0, from 1,500,000,000). Installed tills claim the next
free block automatically from the cloud `pos_till_blocks` table — never copy
`till.env` from one till to another. Till data, backups and logs live in
`%LOCALAPPDATA%\MJPOS` on that computer and survive uninstalling.

Tills sign in to the cloud with the restricted `mjpos_till` database login
(POS tables only — no payroll or website accounts). It is created and
re-granted by `installer\create_till_role.py`; run that again whenever a
table is added to the sync. `--rotate` changes its password; every till then
needs a rebuilt installer.

## Requirements

Windows 10/11 with Node.js 20+ (already installed here) and Microsoft Edge or
Chrome. The launcher needs no other installs. To rebuild the launcher after
editing `Launcher\MJPOS.cs`, run `Launcher\build-launcher.ps1`.
