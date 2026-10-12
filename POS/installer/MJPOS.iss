; MJ Electricals POS — till installer. Built by build-installer.ps1, which
; passes /DStageDir=<installer\build\stage>.
;
; Per-user install (no admin prompt). The sales database, backups, logs and
; this computer's till settings live in %LOCALAPPDATA%\MJPOS, outside the
; install folder, so upgrading or uninstalling never deletes sales data.

#define AppName "MJ Electricals POS"
#define AppVersion "1.0.0"
#ifndef StageDir
  #error StageDir not defined - run build-installer.ps1
#endif

[Setup]
AppId={{55ABAB88-7792-4777-97E9-6DDDFEDFA266}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=MJ Electricals Ghana Limited
DefaultDirName={localappdata}\Programs\MJ POS
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputBaseFilename=MJ-POS-Setup
SetupIconFile={#StageDir}\MJPOS.ico
UninstallDisplayIcon={app}\MJ POS.exe
Compression=lzma2/ultra64
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
WizardStyle=modern

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"
Name: "autostart"; Description: "Start the POS when Windows starts (keeps cloud sync running all day)"; GroupDescription: "Background sync:"

[Files]
Source: "{#StageDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[InstallDelete]
; Replace program files cleanly on upgrade (never touches %LOCALAPPDATA%\MJPOS).
Type: filesandordirs; Name: "{app}\backend\app"
Type: filesandordirs; Name: "{app}\frontend"
Type: filesandordirs; Name: "{app}\runtime"

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\MJ POS.exe"; IconFilename: "{app}\MJPOS.ico"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\MJ POS.exe"; IconFilename: "{app}\MJPOS.ico"; Tasks: desktopicon
Name: "{userstartup}\{#AppName}"; Filename: "{app}\MJ POS.exe"; Parameters: "--minimized"; IconFilename: "{app}\MJPOS.ico"; Tasks: autostart

[Run]
Filename: "{app}\MJ POS.exe"; Description: "Open MJ POS now"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoProfile -Command ""Get-Process | Where-Object {{ $_.Path -like '{app}\*' } | Stop-Process -Force"""; Flags: runhidden; RunOnceId: "StopPOS"

[Code]
// Stop a running POS (launcher, Python, Node) before files are replaced.
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Code: Integer;
begin
  Exec('powershell.exe',
    '-NoProfile -Command "Get-Process | Where-Object { $_.Path -like ''' + ExpandConstant('{app}') + '\*'' } | Stop-Process -Force"',
    '', SW_HIDE, ewWaitUntilTerminated, Code);
  Result := '';
end;
