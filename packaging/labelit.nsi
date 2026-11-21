Unicode true
!include "MUI2.nsh"
!include "x64.nsh"

!ifndef APP_NAME
  !define APP_NAME "Label-IT"
  !define INSTALL_ID "Labelit"
  !define LEGACY_SHORTCUT
!else
  !define INSTALL_ID "${APP_NAME}"
!endif
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${INSTALL_ID}"
!define WEBVIEW2_KEY "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"

Name "${APP_NAME}"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\${INSTALL_ID}"
InstallDirRegKey HKCU "${UNINSTALL_KEY}" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "FileDescription" "${APP_NAME} installer"
VIAddVersionKey "LegalCopyright" "${APP_NAME}"

!define MUI_ICON "${APP_ICON}"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\labelit.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Run ${APP_NAME} now"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  ${IfNot} ${RunningX64}
    SetErrorLevel 2
    MessageBox MB_OK|MB_ICONSTOP "This ${APP_NAME} package requires 64-bit Windows."
    Abort
  ${EndIf}
  SetRegView 32
  ReadRegStr $0 HKLM "${WEBVIEW2_KEY}" "pv"
  ${If} $0 == ""
  ${OrIf} $0 == "0.0.0.0"
    ReadRegStr $0 HKCU "${WEBVIEW2_KEY}" "pv"
  ${EndIf}
  ${If} $0 == ""
  ${OrIf} $0 == "0.0.0.0"
    SetErrorLevel 2
    IfSilent runtime_missing
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "${APP_NAME} needs the Microsoft Edge WebView2 Runtime. Choose OK to open Microsoft's download page, then run this installer again." IDOK open_runtime
    Goto runtime_missing
    open_runtime:
      ExecShell "open" "https://developer.microsoft.com/microsoft-edge/webview2/"
    runtime_missing:
      Abort
  ${EndIf}
FunctionEnd

Section "Install"
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  ClearErrors
  File "${APP_EXE}"
  File "${WEBVIEW_LOADER}"
  File "${BWIP_LICENSE}"
  File "${FONT_LICENSE}"
  IfErrors install_failed
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}.lnk" "$INSTDIR\labelit.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\labelit.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
  IfErrors install_failed
  Goto install_done
  install_failed:
    SetErrorLevel 1
    Abort "${APP_NAME} could not finish installing. Close any open ${APP_NAME} window and run setup again."
  install_done:
!ifdef LEGACY_SHORTCUT
  Delete "$SMPROGRAMS\Labelit.lnk"
!endif
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  SetRegView 32
  ClearErrors
  Delete "$INSTDIR\labelit.exe"
  IfErrors uninstall_locked
  Delete "$INSTDIR\WebView2Loader.dll"
  IfErrors uninstall_locked
  Delete "$INSTDIR\BWIP-JS-LICENSE.txt"
  Delete "$INSTDIR\INCONSOLATA-LICENSE.txt"
  Delete "$SMPROGRAMS\${APP_NAME}.lnk"
  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  Goto uninstall_done
  uninstall_locked:
    MessageBox MB_OK|MB_ICONEXCLAMATION "Close ${APP_NAME}, then run the uninstaller again."
    Abort
  uninstall_done:
SectionEnd
