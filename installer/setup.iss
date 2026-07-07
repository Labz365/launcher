; Inno Setup script for the Aelix Studio Launcher.
; Build AFTER `dotnet publish src/AelixLauncher -c Release -r win-x64 -o publish`
; Compile with:  iscc installer\setup.iss

#define MyAppName "Aelix Studio Launcher"
#define MyAppVersion "1.1.0"
#define MyAppPublisher "Aelix Studio"
#define MyAppExeName "AelixLauncher.exe"

[Setup]
AppId={{B47E9A12-3C5D-4F6E-8A90-1D2E3F4A5B6C}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\AelixStudio\Launcher
DefaultGroupName=Aelix Studio
DisableProgramGroupPage=yes
OutputDir=Output
OutputBaseFilename=AelixStudioLauncherSetup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
SetupIconFile=..\src\AelixLauncher\Assets\icon.ico
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest

; CODE SIGNING (TODO — enable once a certificate is configured in the
; Inno Setup IDE under Tools > Configure Sign Tools, named "aelixsign"):
; SignTool=aelixsign $f
; SignedUninstaller=yes

[Files]
Source: "..\publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent
