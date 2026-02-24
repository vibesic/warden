!macro customInstall
  ; Add firewall rule to allow inbound connections on port 3333
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Proctor App Server"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Proctor App Server" dir=in action=allow protocol=TCP localport=3333'
  
  ; Reserve port 3333 so the app can bind to 0.0.0.0 without admin
  nsExec::ExecToLog 'netsh http add urlacl url=http://+:3333/ user=Everyone'
!macroend

!macro customUnInstall
  ; Kill any running Proctor App processes
  nsExec::ExecToLog 'taskkill /F /IM "Proctor App.exe"'
  
  ; Kill any node process still listening on port 3333
  nsExec::ExecToLog 'cmd /c "for /f "tokens=5" %a in (''netstat -ano ^| findstr :3333 ^| findstr LISTENING'') do taskkill /F /PID %a"'
  
  ; Remove the firewall rule
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Proctor App Server"'
  
  ; Remove port reservation
  nsExec::ExecToLog 'netsh http delete urlacl url=http://+:3333/'
!macroend
