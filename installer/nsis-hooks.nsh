!macro customInstall
  ; Add firewall rule to allow inbound connections on port 3333
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Proctor App Server"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Proctor App Server" dir=in action=allow protocol=TCP localport=3333'
  
  ; Remove any stale HTTP URL ACL reservation (not needed for Node.js, can cause EACCES)
  nsExec::ExecToLog 'netsh http delete urlacl url=http://+:3333/'
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
