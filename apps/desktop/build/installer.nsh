; Old unpacked copies share the production profile and can retain its instance
; lock after an upgrade. Detect both names, regardless of install directory.
; Never terminate editors: let the user exit from the tray after saving.
!macro customCheckAppRunning
  !define /redef JOTDAY_CHECK_LABEL "jotday_check_${__LINE__}"
  ${JOTDAY_CHECK_LABEL}:
    ${nsProcess::FindProcess} "Jotday.exe" $R0
    ${If} $R0 == 603
      ${nsProcess::FindProcess} "烟笺.exe" $R0
    ${EndIf}
    ${If} $R0 == 603
      ${nsProcess::FindProcess} "SmokeNotes.exe" $R0
    ${EndIf}
    ${If} $R0 != 603
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "请先从系统托盘退出 Jotday 或旧版烟笺，保存完成后再点重试。关闭主窗口只会收起程序。 / Please quit Jotday or the old Smoke Notes from the system tray, then retry." /SD IDCANCEL IDRETRY ${JOTDAY_CHECK_LABEL}
      SetErrorLevel 2
      Quit
    ${EndIf}
  !undef JOTDAY_CHECK_LABEL
!macroend

!macro customInstall
  ; Remove only the stale startup entry targeting the renamed binary here.
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.烟笺"
  ${If} $R0 == '$\"$INSTDIR\烟笺.exe$\" --background'
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.烟笺"
  ${EndIf}
!macroend
